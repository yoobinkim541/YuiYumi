//! Native feasibility test: load a MOC3, drive parameters, verify vertices move,
//! and time the update path.
//!
//! Usage: cargo run --release -- [path/to/model.moc3]

use std::time::Instant;

use ayagami_web::Instance;

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../models/Yui/Yui.moc3").to_string()
    });
    let bytes = std::fs::read(&path).expect("read moc3");
    println!("file: {path} ({} bytes, version byte {})", bytes.len(), bytes[4]);

    let t = Instant::now();
    let mut inst = match Instance::load(&bytes) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("LOAD FAILED: {e}");
            std::process::exit(1);
        }
    };
    println!("load: {:.2} ms", t.elapsed().as_secs_f64() * 1e3);

    println!("params: {}", inst.param_count());
    println!("parts: {}", inst.part_count());
    println!("drawables (ArtMeshes): {}", inst.drawable_count());
    println!("total vertices: {}", inst.total_vertex_count());
    println!("total indices: {}", inst.total_index_count());
    println!("mask references: {}", inst.mask_indices().len());
    println!("advanced-blend drawables: {}", inst.advanced_blend_count());
    let (s, c, d) = inst.canvas();
    println!("canvas: scale(ppu)={s} center={c:?} dims={d:?}");

    let t = Instant::now();
    let changed = inst.update();
    println!(
        "first update: {:.2} ms ({changed} drawables updated), offscreen parts: {}",
        t.elapsed().as_secs_f64() * 1e3,
        inst.offscreen_part_count()
    );
    let ro = inst.render_order();
    let unordered = ro.iter().filter(|o| **o < 0).count();
    println!("render order: {} drawables placed, {unordered} unreachable", ro.len() - unordered);

    let p = inst.positions();
    let (mut minx, mut miny, mut maxx, mut maxy) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for v in p.chunks_exact(2) {
        minx = minx.min(v[0]);
        maxx = maxx.max(v[0]);
        miny = miny.min(v[1]);
        maxy = maxy.max(v[1]);
    }
    println!("vertex bounds: x[{minx:.3}, {maxx:.3}] y[{miny:.3}, {maxy:.3}]");
    let before = p.to_vec();

    let mut set = Vec::new();
    for (id, v) in [("ParamAngleX", 30.0), ("ParamMouthOpenY", 1.0), ("ParamEyeLOpen", 0.0)] {
        let ok = inst.set_param_by_id(id, v);
        set.push(format!("{id}={v} ({})", if ok { "ok" } else { "missing" }));
    }
    println!("set: {}", set.join(", "));

    let t = Instant::now();
    let changed = inst.update();
    println!(
        "posed update: {:.2} ms ({changed} drawables updated)",
        t.elapsed().as_secs_f64() * 1e3
    );
    let after = inst.positions();
    let moved = before
        .chunks_exact(2)
        .zip(after.chunks_exact(2))
        .filter(|(a, b)| (a[0] - b[0]).abs() + (a[1] - b[1]).abs() > 1e-6)
        .count();
    let max_d = before
        .chunks_exact(2)
        .zip(after.chunks_exact(2))
        .map(|(a, b)| ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt())
        .fold(0.0f32, f32::max);
    println!("vertices moved: {moved} / {} (max displacement {max_d:.4} units)", before.len() / 2);

    // Steady-state animation benchmark: sweep head angle + mouth every frame.
    let ids = inst.param_ids().to_vec();
    let idx = |name: &str| ids.iter().position(|s| s == name);
    let ax = idx("ParamAngleX");
    let mo = idx("ParamMouthOpenY");
    let ay = idx("ParamAngleY");
    let br = idx("ParamBreath");
    let frames = 600;
    let t = Instant::now();
    let mut total_changed = 0u64;
    for f in 0..frames {
        let ph = f as f32 / 60.0;
        if let Some(i) = ax {
            inst.set_param(i, 30.0 * (ph * 2.0).sin());
        }
        if let Some(i) = ay {
            inst.set_param(i, 15.0 * (ph * 1.3).cos());
        }
        if let Some(i) = mo {
            inst.set_param(i, 0.5 + 0.5 * (ph * 9.0).sin());
        }
        if let Some(i) = br {
            inst.set_param(i, 0.5 + 0.5 * (ph * 0.5).sin());
        }
        total_changed += inst.update() as u64;
    }
    let per = t.elapsed().as_secs_f64() * 1e3 / frames as f64;
    println!(
        "animated update ({frames} frames, 4 params/frame): {per:.3} ms/frame, avg {} drawables updated/frame",
        total_changed / frames as u64
    );

    // Worst case: every parameter changes every frame.
    let n = inst.param_count();
    let t = Instant::now();
    for f in 0..120 {
        for i in 0..n {
            inst.set_param(i, (f as f32 * 0.1 + i as f32).sin() * 10.0);
        }
        inst.update();
    }
    println!(
        "all-params update (120 frames, {n} params/frame): {:.3} ms/frame",
        t.elapsed().as_secs_f64() * 1e3 / 120.0
    );
}
