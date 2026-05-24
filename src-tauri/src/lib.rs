use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};

// ── Windows toast identity ────────────────────────────────────────────────────
//
// In dev mode (tauri dev / cargo run) the process has no registered AUMID so
// Windows attributes toast notifications to the parent terminal ("PowerShell").
// Fix: call SetCurrentProcessExplicitAppUserModelID from shell32.dll and write
// the display-name + icon into the registry so every toast reads "Zeeble".
// No extra Cargo dependencies needed — shell32 is always present on Windows.

#[cfg(target_os = "windows")]
mod win_toast {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt as _;
    use std::os::windows::process::CommandExt as _;

    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(appid: *const u16) -> i32;
    }

    pub fn register() {
        const AUMID: &str = "xyz.zeeble.desktop";

        // 1. Brand this process with the AUMID so WinRT picks it up immediately.
        let wide: Vec<u16> = OsStr::new(AUMID)
            .encode_wide()
            .chain(std::iter::once(0u16))
            .collect();
        unsafe { SetCurrentProcessExplicitAppUserModelID(wide.as_ptr()); }

        // 2. Persist the display name in the registry (idempotent, very fast).
        let reg_key = format!("HKCU\\SOFTWARE\\Classes\\AppUserModelId\\{AUMID}");
        let _ = std::process::Command::new("reg")
            .args(["add", &reg_key, "/v", "DisplayName",
                   "/t", "REG_EXPAND_SZ", "/d", "Zeeble", "/f"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output();

        // 3. Point the registry entry at the Zeeble icon so the toast tile
        //    shows the app icon instead of a blank square.
        //    Dev layout:  src-tauri/icons/icon.ico  (CARGO_MANIFEST_DIR)
        //    Prod layout: <install-dir>/icons/icon.ico (next to the exe)
        let dev_icon = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("icons")
            .join("icon.ico");
        let prod_icon = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("icons").join("icon.ico")));

        let icon_path = [Some(dev_icon), prod_icon]
            .into_iter()
            .flatten()
            .find(|p| p.exists());

        if let Some(path) = icon_path {
            let _ = std::process::Command::new("reg")
                .args(["add", &reg_key, "/v", "IconUri",
                       "/t", "REG_EXPAND_SZ",
                       "/d", path.to_string_lossy().as_ref(), "/f"])
                .creation_flags(0x0800_0000)
                .output();
        }
    }
}

// ── Close-to-tray state ───────────────────────────────────────────────────────

struct CloseToTrayState {
    enabled: AtomicBool,
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, state: State<CloseToTrayState>) {
    state.enabled.store(enabled, Ordering::Relaxed);
}

// ── Packs URI scheme helpers ──────────────────────────────────────────────────

fn mime_for_path(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("yaml") | Some("yml") => "text/plain; charset=utf-8",
        Some("json")               => "application/json; charset=utf-8",
        Some("css")                => "text/css; charset=utf-8",
        Some("mp3")                => "audio/mpeg",
        Some("ogg")                => "audio/ogg",
        Some("wav")                => "audio/wav",
        Some("png")                => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif")                => "image/gif",
        Some("webp")               => "image/webp",
        Some("svg")                => "image/svg+xml",
        _                          => "application/octet-stream",
    }
}

fn packs_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("packs"))
}

// ── Capture source descriptor ─────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct CaptureSource {
    id: String,
    name: String,
    thumbnail: String,   // base64 JPEG, may be empty if capture failed
    source_type: String, // "screen" | "window"
}

// ── Active capture state ──────────────────────────────────────────────────────

struct CaptureHandle {
    running: Arc<AtomicBool>,
}

type CaptureState = Mutex<Option<CaptureHandle>>;

// ── Permission compatibility init script ──────────────────────────────────────
//
// Injected before any page JS runs. Does three things:
//
//  1. Replaces window.Notification with a Tauri-native shim so that
//     • Notification.permission always reads 'granted'
//     • Notification.requestPermission() always resolves to 'granted'
//     • new Notification() routes through tauri-plugin-notification (no browser
//       permission popup ever)
//
//  2. Overrides navigator.permissions.query to return 'granted' for mic/camera/
//     notifications so all JS permission guards pass immediately.
//
//  3. Pre-warms the microphone permission once on DOMContentLoaded.  WebView2
//     persists the grant in its user-data folder, so the small "allow mic" info-
//     bar appears at most once per install — at startup, not during a voice join.

const PERM_COMPAT_JS: &str = r#"
(function () {
    'use strict';

    // ── 1. Notification API shim ─────────────────────────────────────────────

    function TauriNotification(title, options) {
        if (window.__TAURI_INTERNALS__) {
            window.__TAURI_INTERNALS__.invoke('plugin:notification|notify', {
                options: {
                    title: title,
                    body:  (options && options.body)  ? options.body  : undefined,
                }
            }).catch(function () {});
        }
    }

    TauriNotification.permission = 'granted';
    TauriNotification.requestPermission = function () { return Promise.resolve('granted'); };

    Object.defineProperty(window, 'Notification', {
        value: TauriNotification,
        writable: true,
        configurable: true,
    });

    // ── 2. navigator.permissions shim ───────────────────────────────────────

    if (navigator.permissions && navigator.permissions.query) {
        var _origQuery = navigator.permissions.query.bind(navigator.permissions);
        var AUTO_GRANT = ['microphone', 'camera', 'notifications'];

        navigator.permissions.query = function (descriptor) {
            if (AUTO_GRANT.indexOf(descriptor.name) !== -1) {
                return Promise.resolve({ state: 'granted', onchange: null });
            }
            return _origQuery(descriptor);
        };
    }

    // ── 3. Microphone permission pre-warm ────────────────────────────────────
    // Request mic access right after the page loads. WebView2 shows its native
    // info-bar at most once (the grant is persisted). This ensures the bar never
    // interrupts a voice channel join.

    document.addEventListener('DOMContentLoaded', function () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                stream.getTracks().forEach(function (t) { t.stop(); });
            })
            .catch(function () { /* no mic attached or already denied — ignore */ });
    });

})();
"#;

// ── Thumbnail helper ──────────────────────────────────────────────────────────

fn encode_jpeg_thumbnail(rgba: &xcap::image::RgbaImage) -> String {
    use base64::{Engine, engine::general_purpose::STANDARD};

    let scale = 320.0f32 / rgba.width() as f32;
    let h = ((rgba.height() as f32) * scale) as u32;
    let thumb = xcap::image::imageops::resize(
        rgba,
        320,
        h.max(1),
        xcap::image::imageops::FilterType::Triangle,
    );

    // JPEG doesn't support alpha — convert RGBA → RGB
    let rgb = xcap::image::DynamicImage::ImageRgba8(thumb).into_rgb8();

    let mut buf = Vec::new();
    if xcap::image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 70)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            xcap::image::ColorType::Rgb8.into(),
        )
        .is_ok()
    {
        STANDARD.encode(&buf)
    } else {
        String::new()
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Returns all screens and visible windows with JPEG thumbnails.
/// Called once when the user opens the screen picker.
#[tauri::command]
async fn get_capture_sources() -> Vec<CaptureSource> {
    use xcap::{Monitor, Window};

    let mut sources = Vec::new();

    // Screens / monitors
    let monitors = Monitor::all().unwrap_or_default();
    let n = monitors.len();
    for (i, monitor) in monitors.iter().enumerate() {
        let thumbnail = monitor
            .capture_image()
            .ok()
            .map(|img| encode_jpeg_thumbnail(&img))
            .unwrap_or_default();

        sources.push(CaptureSource {
            id: format!("screen:{i}"),
            name: if n == 1 {
                "Entire Screen".into()
            } else {
                format!("Screen {} — {}", i + 1, monitor.friendly_name().unwrap_or_default())
            },
            thumbnail,
            source_type: "screen".into(),
        });
    }

    // Windows — skip minimised, invisible, or untitled ones
    for window in Window::all().unwrap_or_default() {
        let title = window.title().unwrap_or_default();
        if title.is_empty() || window.is_minimized().unwrap_or(false) || window.width().unwrap_or(0) < 50 {
            continue;
        }

        let thumbnail = window
            .capture_image()
            .ok()
            .filter(|img| img.width() > 10 && img.height() > 10)
            .map(|img| encode_jpeg_thumbnail(&img))
            .unwrap_or_default();

        sources.push(CaptureSource {
            id: format!("window:{}", window.id().unwrap_or(0)),
            name: title,
            thumbnail,
            source_type: "window".into(),
        });
    }

    sources
}

/// Starts a background thread that captures the selected source at ~15 fps
/// and emits each frame as a base64 JPEG via the "screen-frame" event.
#[tauri::command]
fn start_screen_capture(
    source_id: String,
    app: AppHandle,
    state: State<CaptureState>,
) {
    use xcap::{Monitor, Window};
    use base64::{Engine, engine::general_purpose::STANDARD};
    use std::thread;
    use std::time::Duration;

    // Stop any existing capture first
    {
        let mut guard = state.lock().unwrap();
        if let Some(old) = guard.take() {
            old.running.store(false, Ordering::Relaxed);
        }
    }

    let running = Arc::new(AtomicBool::new(true));
    {
        let mut guard = state.lock().unwrap();
        *guard = Some(CaptureHandle { running: running.clone() });
    }

    thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            let frame_rgba = if let Some(idx_str) = source_id.strip_prefix("screen:") {
                let idx: usize = idx_str.parse().unwrap_or(0);
                Monitor::all()
                    .ok()
                    .and_then(|m| m.into_iter().nth(idx))
                    .and_then(|m| m.capture_image().ok())
            } else if let Some(id_str) = source_id.strip_prefix("window:") {
                let id: u32 = id_str.parse().unwrap_or(0);
                Window::all()
                    .ok()
                    .and_then(|ws| ws.into_iter().find(|w| w.id().unwrap_or(0) == id))
                    .and_then(|w| w.capture_image().ok())
            } else {
                None
            };

            if let Some(img) = frame_rgba {
                // Scale down to max 1280×720
                let scale = (1280.0f32 / img.width() as f32)
                    .min(720.0f32 / img.height() as f32)
                    .min(1.0);
                let w = ((img.width() as f32) * scale) as u32;
                let h = ((img.height() as f32) * scale) as u32;

                let rgb = if scale < 0.99 {
                    let resized = xcap::image::imageops::resize(
                        &img,
                        w.max(1),
                        h.max(1),
                        xcap::image::imageops::FilterType::Nearest,
                    );
                    xcap::image::DynamicImage::ImageRgba8(resized).into_rgb8()
                } else {
                    xcap::image::DynamicImage::ImageRgba8(img).into_rgb8()
                };

                let mut buf = Vec::new();
                if xcap::image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 75)
                    .encode(
                        rgb.as_raw(),
                        rgb.width(),
                        rgb.height(),
                        xcap::image::ColorType::Rgb8.into(),
                    )
                    .is_ok()
                {
                    let _ = app.emit("screen-frame", STANDARD.encode(&buf));
                }
            }

            thread::sleep(Duration::from_millis(67)); // ~15 fps
        }
    });
}

/// Stops the background capture thread.
#[tauri::command]
fn stop_screen_capture(state: State<CaptureState>) {
    let mut guard = state.lock().unwrap();
    if let Some(handle) = guard.take() {
        handle.running.store(false, Ordering::Relaxed);
    }
}

// ── OS keychain commands ──────────────────────────────────────────────────────

const KEYRING_SERVICE: &str = "xyz.zeeble.desktop";

#[tauri::command]
fn save_credential(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| e.to_string())?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_credential(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_credential(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Local packs commands ──────────────────────────────────────────────────────

/// Returns all subdirectory names inside <appDataDir>/packs/.
/// Creates the directory if it doesn't exist.
#[tauri::command]
fn list_local_packs(app: AppHandle) -> Vec<String> {
    let Some(dir) = packs_dir(&app) else { return vec![] };
    let _ = std::fs::create_dir_all(&dir);
    std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default()
}

/// Returns the absolute path to <appDataDir>/packs/, creating it if needed.
#[tauri::command]
fn get_packs_dir(app: AppHandle) -> String {
    let dir = packs_dir(&app).unwrap_or_default();
    let _ = std::fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

// ── App entry point ───────────────────────────────────────────────────────────

async fn check_for_updates(app: tauri::AppHandle) {
    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                let _ = app.emit("update-available", update.version.to_string());
            }
            Ok(None) => {}
            Err(e) => eprintln!("Update check failed: {e}"),
        },
        Err(e) => eprintln!("Updater init failed: {e}"),
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Register the Zeeble AUMID before anything else so every WinRT toast
    // shows "Zeeble" with the app icon from the very first notification.
    #[cfg(target_os = "windows")]
    win_toast::register();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::<Option<CaptureHandle>>::new(None))
        .manage(CloseToTrayState { enabled: AtomicBool::new(false) })
        // Serve <appDataDir>/packs/<name>/... as packs://localhost/<name>/...
        .register_uri_scheme_protocol("packs", |ctx, request| {
            let Some(dir) = packs_dir(ctx.app_handle()) else {
                return tauri::http::Response::builder().status(500).body(vec![]).unwrap();
            };
            let path = request.uri().path();
            let rel = path.trim_start_matches('/');
            // Prevent path traversal
            if rel.contains("..") {
                return tauri::http::Response::builder().status(403).body(vec![]).unwrap();
            }
            let file = dir.join(rel);
            match std::fs::read(&file) {
                Ok(data) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", mime_for_path(&file))
                    .header("Access-Control-Allow-Origin", "*")
                    .body(data)
                    .unwrap(),
                Err(_) => tauri::http::Response::builder().status(404).body(vec![]).unwrap(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_capture_sources,
            start_screen_capture,
            stop_screen_capture,
            list_local_packs,
            get_packs_dir,
            save_credential,
            load_credential,
            delete_credential,
            set_close_to_tray,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(handle).await;
            });

            // ── System tray ───────────────────────────────────────────────────
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Zeeble")
                .on_tray_icon_event(|tray, event| {
                    // Left-click on the tray icon → restore / focus the window.
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Main window ───────────────────────────────────────────────────
            #[allow(unused_mut)]
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Zeeble")
            .inner_size(1280.0, 800.0)
            .min_inner_size(900.0, 600.0)
            .decorations(false)
            // Inject permission compat shim before any page JS runs.
            .initialization_script(PERM_COMPAT_JS);

            // Disable WebView2 tracking prevention so localStorage is accessible
            // across all origins (needed for chat server tokens stored by IP/domain).
            #[cfg(target_os = "windows")]
            {
                // --allow-insecure-localhost: lets WebView2 grant mic/camera on localhost
                // even without HTTPS (dev mode uses http://localhost:5173).
                builder = builder.additional_browser_args(
                    "--disable-features=msTrackingPrevention --allow-insecure-localhost"
                );
            }

            let window = builder.build()?;

            // ── Close-to-tray: intercept the × button ─────────────────────────
            // If the user has enabled "close to tray" we prevent the default
            // close and hide the window instead; the tray icon brings it back.
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let state: tauri::State<CloseToTrayState> = app_handle.state();
                    if state.enabled.load(Ordering::Relaxed) {
                        api.prevent_close();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zeeble")
}
