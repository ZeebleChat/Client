use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use serde::Serialize;
use tauri::{AppHandle, State, Emitter};

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
            xcap::image::ColorType::Rgb8,
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
                format!("Screen {} — {}", i + 1, monitor.name())
            },
            thumbnail,
            source_type: "screen".into(),
        });
    }

    // Windows — skip minimised, invisible, or untitled ones
    for window in Window::all().unwrap_or_default() {
        let title = window.title().to_string();
        if title.is_empty() || window.is_minimized() || window.width() < 50 {
            continue;
        }

        let thumbnail = window
            .capture_image()
            .ok()
            .filter(|img| img.width() > 10 && img.height() > 10)
            .map(|img| encode_jpeg_thumbnail(&img))
            .unwrap_or_default();

        sources.push(CaptureSource {
            id: format!("window:{}", window.id()),
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
                    .and_then(|ws| ws.into_iter().find(|w| w.id() == id))
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
                        xcap::image::ColorType::Rgb8,
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

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::<Option<CaptureHandle>>::new(None))
        .invoke_handler(tauri::generate_handler![
            get_capture_sources,
            start_screen_capture,
            stop_screen_capture,
        ])
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Zeeble")
            .inner_size(1280.0, 800.0)
            .min_inner_size(900.0, 600.0)
            .decorations(false)
            .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zeeble")
}
