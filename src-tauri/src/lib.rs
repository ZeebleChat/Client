use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, Emitter};

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
                    icon:  (options && options.icon)  ? options.icon  : undefined,
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

// ── Local packs commands ─────────────────────────────────────────────────────

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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::<Option<CaptureHandle>>::new(None))
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
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(handle).await;
            });

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

            builder.build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zeeble")
}
