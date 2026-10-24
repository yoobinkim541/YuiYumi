// macOS screen capture (ScreenCaptureKit) and activity signals (frontmost app, window title,
// time since the last key press).

use std::ptr::NonNull;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::AnyThread;
use objc2_app_kit::NSWorkspace;
use objc2_core_foundation::{CFArray, CFRetained};
use objc2_core_graphics::{
    kCGWindowLayer, kCGWindowName, kCGWindowOwnerPID, CGDataProvider, CGEventSource,
    CGEventSourceStateID, CGEventType, CGImage, CGMainDisplayID, CGPreflightScreenCaptureAccess,
    CGRequestScreenCaptureAccess, CGWindowListCopyWindowInfo, CGWindowListOption,
};
use objc2_foundation::{NSArray, NSDictionary, NSError, NSNumber, NSString};
use objc2_screen_capture_kit::{
    SCContentFilter, SCRunningApplication, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow,
};

/// Raw 8-bit RGB pixels of a capture.
pub struct Rgb {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

pub fn has_screen_permission() -> bool {
    CGPreflightScreenCaptureAccess()
}

/// Shows the system prompt once (later calls return the current state without a prompt).
pub fn request_screen_permission() -> bool {
    CGRequestScreenCaptureAccess()
}

/// Captures the main display without this app's own windows, scaled to fit max_w x max_h.
pub fn capture_main_display(max_w: f64, max_h: f64) -> Result<Rgb, String> {
    if !has_screen_permission() {
        return Err("permission".into());
    }
    let (tx, rx) = mpsc::channel::<Result<Rgb, String>>();
    let own_pid = std::process::id() as i32;

    let on_content = RcBlock::new(move |content: *mut SCShareableContent, error: *mut NSError| {
        let tx = tx.clone();
        let Some(content) = (unsafe { content.as_ref() }) else {
            let msg = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
            let _ = tx.send(Err(msg.unwrap_or_else(|| "no shareable content".into())));
            return;
        };
        unsafe {
            let main_id = CGMainDisplayID();
            let displays = content.displays();
            let Some(display) = displays.iter().find(|d| d.displayID() == main_id).or_else(|| displays.firstObject()) else {
                let _ = tx.send(Err("no display".into()));
                return;
            };
            // Leave out every window of this app (the overlay, settings panels).
            let own: Vec<Retained<SCRunningApplication>> =
                content.applications().iter().filter(|a| a.processID() == own_pid).collect();
            let own_refs: Vec<&SCRunningApplication> = own.iter().map(|a| &**a).collect();
            let excluded = NSArray::from_slice(&own_refs);
            let none: Retained<NSArray<SCWindow>> = NSArray::new();
            let filter = SCContentFilter::initWithDisplay_excludingApplications_exceptingWindows(
                SCContentFilter::alloc(),
                &display,
                &excluded,
                &none,
            );
            let (w, h) = (display.width() as f64, display.height() as f64);
            let scale = (max_w / w).min(max_h / h);
            let config = SCStreamConfiguration::new();
            config.setWidth((w * scale).round().max(1.0) as usize);
            config.setHeight((h * scale).round().max(1.0) as usize);
            config.setShowsCursor(true);

            let tx2 = tx.clone();
            let on_image = RcBlock::new(move |image: *mut CGImage, error: *mut NSError| {
                let result = match NonNull::new(image) {
                    Some(ptr) => to_rgb(ptr.as_ref()),
                    None => Err(error
                        .as_ref()
                        .map(|e| e.localizedDescription().to_string())
                        .unwrap_or_else(|| "capture failed".into())),
                };
                let _ = tx2.send(result);
            });
            SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(&filter, &config, Some(&on_image));
        }
    });
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            false, true, &on_content,
        );
    }
    rx.recv_timeout(Duration::from_secs(6)).map_err(|_| "capture timed out".to_string())?
}

/// BGRA CGImage -> packed RGB.
fn to_rgb(image: &CGImage) -> Result<Rgb, String> {
    let img = Some(image);
    let (w, h) = (CGImage::width(img), CGImage::height(img));
    let stride = CGImage::bytes_per_row(img);
    if CGImage::bits_per_pixel(img) != 32 || w == 0 || h == 0 {
        return Err("unexpected pixel format".into());
    }
    let data = CGDataProvider::data(CGImage::data_provider(img).as_deref())
        .ok_or("no pixel data")?
        .to_vec();
    let mut pixels = Vec::with_capacity(w * h * 3);
    for row in data.chunks(stride).take(h) {
        for px in row[..w * 4].chunks_exact(4) {
            pixels.extend_from_slice(&[px[2], px[1], px[0]]);
        }
    }
    Ok(Rgb { width: w as u32, height: h as u32, pixels })
}

#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub active_app: Option<String>,
    pub window_title: Option<String>,
    /// Seconds since the last key press anywhere (no Input Monitoring permission needed).
    pub idle_key_sec: f64,
}

/// The last app other than this one, so clicking the overlay does not hide what the user works in.
static LAST_OTHER: Mutex<Option<(i32, String)>> = Mutex::new(None);

pub fn activity() -> Activity {
    let own_pid = std::process::id() as i32;
    let front = NSWorkspace::sharedWorkspace().frontmostApplication();
    let mut last = LAST_OTHER.lock().unwrap();
    if let Some(app) = front {
        let pid = app.processIdentifier();
        if pid != own_pid {
            let name = app.localizedName().map(|n| n.to_string()).unwrap_or_default();
            *last = Some((pid, name));
        }
    }
    let idle_key_sec = CGEventSource::seconds_since_last_event_type(CGEventSourceStateID::CombinedSessionState, CGEventType::KeyDown);
    match last.clone() {
        Some((pid, name)) => Activity { active_app: Some(name), window_title: window_title(pid), idle_key_sec },
        None => Activity { idle_key_sec, ..Default::default() },
    }
}

/// Title of the front-most normal window of `pid` (needs the Screen Recording permission).
fn window_title(pid: i32) -> Option<String> {
    let list: CFRetained<CFArray> =
        CGWindowListCopyWindowInfo(CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements, 0)?;
    // CFArray of CFDictionary is toll-free bridged to NSArray of NSDictionary.
    let list: &NSArray<NSDictionary<NSString, AnyObject>> = unsafe { &*(CFRetained::as_ptr(&list).as_ptr() as *const _) };
    let key = |k: &objc2_core_foundation::CFString| -> &NSString { unsafe { &*(k as *const _ as *const NSString) } };
    let (k_pid, k_layer, k_name) = unsafe { (key(kCGWindowOwnerPID), key(kCGWindowLayer), key(kCGWindowName)) };
    let num = |d: &NSDictionary<NSString, AnyObject>, k: &NSString| -> Option<i64> {
        d.objectForKey(k).and_then(|v| v.downcast::<NSNumber>().ok()).map(|n| n.as_i64())
    };
    for d in list.iter() {
        if num(&d, k_pid) != Some(pid as i64) || num(&d, k_layer) != Some(0) {
            continue;
        }
        let title = d.objectForKey(k_name).and_then(|v| v.downcast::<NSString>().ok()).map(|s| s.to_string());
        if let Some(t) = title.filter(|t| !t.is_empty()) {
            return Some(t);
        }
    }
    None
}

/// Left mouse button held anywhere (no Accessibility permission needed).
pub fn left_button_down() -> bool {
    CGEventSource::button_state(CGEventSourceStateID::CombinedSessionState, objc2_core_graphics::CGMouseButton::Left)
}

// Cocoa keeps windows below the menu bar (constrainFrameRect:toScreen:), which would stop the
// avatar's head well below the top edge (the bubble space sits above her). Floating windows
// (the overlay) skip that constraint; normal windows (the panels) keep it.

use objc2::runtime::{AnyClass, Imp, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::NSRect;

type ConstrainFn = unsafe extern "C-unwind" fn(&AnyObject, Sel, NSRect, *mut AnyObject) -> NSRect;
static ORIGINAL_CONSTRAIN: std::sync::OnceLock<usize> = std::sync::OnceLock::new();

unsafe extern "C-unwind" fn constrain_frame(this: &AnyObject, cmd: Sel, rect: NSRect, screen: *mut AnyObject) -> NSRect {
    let level: isize = msg_send![this, level];
    if level > 0 {
        return rect;
    }
    match ORIGINAL_CONSTRAIN.get() {
        Some(&imp) => (std::mem::transmute::<usize, ConstrainFn>(imp))(this, cmd, rect, screen),
        None => rect,
    }
}

/// Lets the overlay window move above the menu bar edge (and anywhere else).
pub fn allow_unconstrained_frames(ns_window: *mut std::ffi::c_void) {
    if ns_window.is_null() || ORIGINAL_CONSTRAIN.get().is_some() {
        return;
    }
    let sel = sel!(constrainFrameRect:toScreen:);
    let Some(base) = AnyClass::get(c"NSWindow").and_then(|c| c.instance_method(sel)) else { return };
    let _ = ORIGINAL_CONSTRAIN.set(base.implementation() as usize);
    unsafe {
        let obj = &*(ns_window as *const AnyObject);
        let cls = obj.class() as *const AnyClass as *mut AnyClass;
        let imp: Imp = std::mem::transmute::<ConstrainFn, Imp>(constrain_frame);
        let types = c"{CGRect={CGPoint=dd}{CGSize=dd}}@:{CGRect={CGPoint=dd}{CGSize=dd}}@";
        if !objc2::ffi::class_addMethod(cls, sel, imp, types.as_ptr()).as_bool() {
            objc2::ffi::class_replaceMethod(cls, sel, imp, types.as_ptr());
        }
    }
}
