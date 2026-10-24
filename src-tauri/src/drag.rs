// Dragging the overlay by the avatar. The window follows the global cursor from Rust (not the
// webview's events, which stop at the window edge), so she can go anywhere on any display,
// edges included. A soft clamp keeps at least MIN_VISIBLE points of the character on the
// display under the cursor (her head or the pill always stays reachable).

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, LogicalPosition, WebviewWindow};

const MIN_VISIBLE: f64 = 120.0;
const STEP: Duration = Duration::from_millis(8);

static DRAGGING: AtomicBool = AtomicBool::new(false);

/// Character rect inside the window, in CSS pixels: [x, y, width, height].
pub type CharRect = [f64; 4];

struct Rect { x: f64, y: f64, w: f64, h: f64 }

/// Monitors in logical points (each with its own scale factor).
fn monitors(window: &WebviewWindow) -> Vec<Rect> {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let s = m.scale_factor();
            let p = m.position().to_logical::<f64>(s);
            let z = m.size().to_logical::<f64>(s);
            Rect { x: p.x, y: p.y, w: z.width, h: z.height }
        })
        .collect()
}

/// Keeps MIN_VISIBLE points of the character on the display under (cx, cy) (or the nearest).
fn clamp(x: f64, y: f64, ch: &CharRect, cx: f64, cy: f64, screens: &[Rect]) -> (f64, f64) {
    let dist = |r: &Rect| {
        let dx = (r.x - cx).max(0.0).max(cx - (r.x + r.w));
        let dy = (r.y - cy).max(0.0).max(cy - (r.y + r.h));
        dx * dx + dy * dy
    };
    let Some(m) = screens.iter().min_by(|a, b| dist(a).total_cmp(&dist(b))) else { return (x, y) };
    let [ox, oy, w, h] = *ch;
    let x = x.clamp(m.x + MIN_VISIBLE - ox - w, m.x + m.w - MIN_VISIBLE - ox);
    let y = y.clamp(m.y + MIN_VISIBLE - oy - h, m.y + m.h - MIN_VISIBLE - oy);
    (x, y)
}

/// Moves the window with the cursor until the left button is released. `anchor` is where the
/// press happened, in screen points, so a quick flick still lands where the cursor ends up.
pub fn start(window: WebviewWindow, ch: CharRect, anchor: Option<[f64; 2]>) {
    if DRAGGING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let run = || -> Option<()> {
            let scale = window.scale_factor().ok()?;
            let p0 = window.outer_position().ok()?.to_logical::<f64>(scale);
            let (c0x, c0y) = match anchor {
                Some([x, y]) => (x, y),
                None => {
                    let c = window.cursor_position().ok()?.to_logical::<f64>(scale);
                    (c.x, c.y)
                }
            };
            let screens = monitors(&window);
            let mut last = (p0.x, p0.y);
            loop {
                #[cfg(target_os = "macos")]
                let down = crate::macos::left_button_down();
                #[cfg(not(target_os = "macos"))]
                let down = false;
                let c = window.cursor_position().ok()?.to_logical::<f64>(scale);
                let next = clamp(p0.x + c.x - c0x, p0.y + c.y - c0y, &ch, c.x, c.y, &screens);
                if next != last {
                    last = next;
                    let _ = window.set_position(LogicalPosition::new(next.0.round(), next.1.round()));
                }
                if !down {
                    break;
                }
                std::thread::sleep(STEP);
            }
            Some(())
        };
        run();
        DRAGGING.store(false, Ordering::SeqCst);
        let _ = window.emit_to(window.label(), "yy://drag-end", ());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_every_edge_but_keeps_part_visible() {
        let screen = [Rect { x: 0.0, y: 0.0, w: 1728.0, h: 1117.0 }];
        let ch = [30.0, 228.0, 400.0, 612.0];
        // Far left/top: clamped so 120 points of the character remain.
        assert_eq!(clamp(-5000.0, -5000.0, &ch, 0.0, 0.0, &screen), (120.0 - 30.0 - 400.0, 120.0 - 228.0 - 612.0));
        // Far right/bottom.
        assert_eq!(clamp(5000.0, 5000.0, &ch, 1727.0, 1116.0, &screen), (1728.0 - 120.0 - 30.0, 1117.0 - 120.0 - 228.0));
        // The corners themselves are reachable (character flush with each edge).
        assert_eq!(clamp(-30.0, -228.0, &ch, 0.0, 0.0, &screen), (-30.0, -228.0));
        assert_eq!(clamp(1728.0 - 430.0, 1117.0 - 840.0, &ch, 0.0, 0.0, &screen), (1298.0, 277.0));
    }
}
