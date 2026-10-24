// YuiYumi desktop shell: a transparent always-on-top overlay window with the character, a
// menu bar tray, settings/dashboard panel windows, native screen capture and connector sign-in.
// The UI is the same web app (desktop.html); the API stays on the server.

mod auth;
mod drag;
mod system;
#[cfg(target_os = "macos")]
mod macos;

use std::io::Cursor;
use std::sync::Mutex;

use base64::Engine;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, Wry};
use tauri_plugin_window_state::StateFlags;

const OVERLAY: &str = "overlay";
/// Overlay size: the 400x612 character window plus room above it for the bubble and cards.
const OVERLAY_W: f64 = 460.0;
const OVERLAY_H: f64 = 840.0;
const MAX_W: f64 = 1920.0;
const MAX_H: f64 = 1080.0;
const JPEG_QUALITY: u8 = 70;

struct Tray {
    toggle: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    dashboard: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Frame {
    jpeg_base64: String,
    width: u32,
    height: u32,
}

/// Main display without this app's windows, at most 1920x1080, JPEG base64.
/// Fails with "permission" when Screen Recording is not granted.
#[tauri::command]
async fn capture_screen() -> Result<Frame, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let rgb = macos::capture_main_display(MAX_W, MAX_H)?;
            let mut out = Cursor::new(Vec::with_capacity(256 * 1024));
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
                .encode(&rgb.pixels, rgb.width, rgb.height, image::ExtendedColorType::Rgb8)
                .map_err(|e| e.to_string())?;
            Ok(Frame {
                jpeg_base64: base64::engine::general_purpose::STANDARD.encode(out.into_inner()),
                width: rgb.width,
                height: rgb.height,
            })
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("unsupported".into())
    }
}

/// Screen Recording permission; `request` shows the system prompt (first time only).
#[tauri::command]
fn screen_permission(request: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        if request {
            macos::request_screen_permission()
        } else {
            macos::has_screen_permission()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        true
    }
}

#[tauri::command]
fn open_screen_settings() {
    let _ = open::that_detached("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
}

/// Frontmost app (other than this one), its window title and seconds since the last key press.
#[tauri::command]
fn activity() -> serde_json::Value {
    #[cfg(target_os = "macos")]
    {
        serde_json::to_value(macos::activity()).unwrap_or_default()
    }
    #[cfg(not(target_os = "macos"))]
    {
        serde_json::Value::Null
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorLocal {
    x: f64,
    y: f64,
    /// Window origin on screen, in points (for mapping screen coordinates into the page).
    origin_x: f64,
    origin_y: f64,
}

/// Cursor position in the window's CSS pixels, for click-through hit testing.
#[tauri::command]
fn cursor_local(window: WebviewWindow) -> Option<CursorLocal> {
    let cursor = window.cursor_position().ok()?;
    let origin = window.inner_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some(CursorLocal {
        x: (cursor.x - origin.x as f64) / scale,
        y: (cursor.y - origin.y as f64) / scale,
        origin_x: origin.x as f64 / scale,
        origin_y: origin.y as f64 / scale,
    })
}

/// Starts dragging the overlay with the cursor; `character` is the avatar rect in the page.
#[tauri::command]
fn drag_start(window: WebviewWindow, character: drag::CharRect, anchor: Option<[f64; 2]>) {
    drag::start(window, character, anchor);
}

#[tauri::command]
fn open_panel(app: AppHandle, view: String) -> Result<(), String> {
    show_panel(&app, &view)
}

#[derive(serde::Deserialize)]
struct TrayLabels {
    show: String,
    hide: String,
    settings: String,
    dashboard: String,
    quit: String,
}

static TRAY_TEXT: Mutex<Option<TrayLabels>> = Mutex::new(None);

/// Localized tray menu labels from the UI language.
#[tauri::command]
fn set_tray_labels(app: AppHandle, labels: TrayLabels) {
    let tray = app.state::<Tray>();
    let _ = tray.settings.set_text(&labels.settings);
    let _ = tray.dashboard.set_text(&labels.dashboard);
    let _ = tray.quit.set_text(&labels.quit);
    *TRAY_TEXT.lock().unwrap() = Some(labels);
    refresh_toggle(&app);
}

/// Opens an http(s) URL in the default browser; returns the normalized URL.
#[tauri::command]
fn open_url(url: String) -> Result<String, String> {
    system::open_url(&url)
}

/// Launches an installed app by display name or bundle id; returns the resolved app name.
#[tauri::command]
fn open_app(name: String) -> Result<String, String> {
    system::open_app(&name)
}

/// Installed apps (display name and bundle id).
#[tauri::command]
async fn list_apps() -> Vec<system::AppInfo> {
    tauri::async_runtime::spawn_blocking(system::list_apps).await.unwrap_or_default()
}

/// Server origin the frontend talks to (VITE_API_BASE, or the dev server's own origin).
#[tauri::command]
fn set_api_base(base: String) {
    *auth::API_BASE.lock().unwrap() = url::Url::parse(&base).ok();
}

#[tauri::command]
fn auth_sign_in(app: AppHandle, provider: String, start_url: String) -> Result<(), String> {
    let url = url::Url::parse(&start_url).map_err(|e| e.to_string())?;
    auth::sign_in(app, provider, url)
}

/// Sealed blobs of the signed-in providers (for the Bearer header).
#[tauri::command]
fn auth_blobs() -> Vec<String> {
    auth::load_all()
}

/// Forgets one provider's blob (after the server-side logout).
#[tauri::command]
fn auth_clear(provider: String) -> Result<(), String> {
    auth::clear(&provider)
}

fn refresh_toggle(app: &AppHandle) {
    let visible = app.get_webview_window(OVERLAY).and_then(|w| w.is_visible().ok()).unwrap_or(true);
    let text = TRAY_TEXT.lock().unwrap();
    let label = match (&*text, visible) {
        (Some(t), true) => t.hide.clone(),
        (Some(t), false) => t.show.clone(),
        (None, true) => "Hide YuiYumi".into(),
        (None, false) => "Show YuiYumi".into(),
    };
    let _ = app.state::<Tray>().toggle.set_text(label);
}

fn toggle_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(OVERLAY) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
    refresh_toggle(app);
}

/// Provider name when `url` is a connector sign-in start (/api/auth/<provider>/start).
fn auth_start(url: &url::Url) -> Option<String> {
    let parts: Vec<&str> = url.path().trim_matches('/').split('/').collect();
    match parts.as_slice() {
        ["api", "auth", provider, "start"] => Some((*provider).to_string()),
        _ => None,
    }
}

/// Sign-in links open the system browser with the loopback flow instead of the webview.
fn webview<'a>(app: &'a AppHandle, label: &'a str, url: WebviewUrl) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
    let nav = app.clone();
    let popup = app.clone();
    WebviewWindowBuilder::new(app, label, url)
        .on_navigation(move |url| match auth_start(url) {
            Some(provider) => {
                let _ = auth::sign_in(nav.clone(), provider, url.clone());
                false
            }
            None => true,
        })
        .on_new_window(move |url, _| {
            match auth_start(&url) {
                Some(provider) => {
                    let _ = auth::sign_in(popup.clone(), provider, url);
                }
                None => {
                    let _ = open::that_detached(url.as_str());
                }
            }
            NewWindowResponse::Deny
        })
}

fn show_panel(app: &AppHandle, view: &str) -> Result<(), String> {
    if view != "settings" && view != "dashboard" {
        return Err("unknown view".into());
    }
    if let Some(w) = app.get_webview_window(view) {
        let _ = w.show();
        let _ = w.unminimize();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let title = if view == "settings" { "YuiYumi Settings" } else { "YuiYumi Dashboard" };
    let w = webview(app, view, WebviewUrl::App(format!("desktop.html#{view}").into()))
        .title(title)
        .inner_size(1000.0, 700.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}

fn build_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let mut builder = webview(app, OVERLAY, WebviewUrl::App("desktop.html".into()))
        .title("YuiYumi")
        .inner_size(OVERLAY_W, OVERLAY_H)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .accept_first_mouse(true)
        // Appearing must not take the keyboard from the app the user is typing in.
        .focused(false);
    // First launch: lower right of the main screen; the window-state plugin restores a moved one.
    if let Ok(Some(m)) = app.primary_monitor() {
        let s = m.scale_factor();
        let size = m.size().to_logical::<f64>(s);
        let pos = m.position().to_logical::<f64>(s);
        builder = builder.position(pos.x + size.width - OVERLAY_W - 24.0, pos.y + size.height - OVERLAY_H - 16.0);
    }
    let w = builder.build()?;
    #[cfg(target_os = "macos")]
    if let Ok(ns) = w.ns_window() {
        macos::allow_unconstrained_frames(ns);
    }
    Ok(w)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Hide YuiYumi", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "dashboard", "Dashboard…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit YuiYumi", true, Some("CmdOrCtrl+Q"))?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle, &sep, &settings, &dashboard, &PredefinedMenuItem::separator(app)?, &quit])?;
    TrayIconBuilder::with_id("main")
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("YuiYumi")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_overlay(app),
            "settings" => { let _ = show_panel(app, "settings"); }
            "dashboard" => { let _ = show_panel(app, "dashboard"); }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    app.manage(Tray { toggle, settings, dashboard, quit });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            screen_permission,
            open_screen_settings,
            activity,
            cursor_local,
            drag_start,
            open_panel,
            set_tray_labels,
            open_url,
            open_app,
            list_apps,
            set_api_base,
            auth_sign_in,
            auth_blobs,
            auth_clear,
        ])
        .setup(|app| {
            // Menu bar app: no Dock icon; the tray holds Show/Hide, Settings and Quit.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            build_tray(&handle)?;
            let overlay = build_overlay(&handle)?;
            // Restores the remembered spot (the plugin only restores windows it saw at startup).
            use tauri_plugin_window_state::WindowExt;
            let _ = overlay.restore_state(StateFlags::POSITION);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running YuiYumi");
}
