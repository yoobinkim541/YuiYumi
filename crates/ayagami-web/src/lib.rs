//! Feasibility spike: wraps the Ayagami MOC3 loader and `driver` behind a
//! plain C-ABI surface so it can be built for `wasm32-unknown-unknown`
//! without wasm-bindgen, and lays out its output the way Cubism Core's
//! `Live2DCubismCore.Model` exposes it, so a thin JS facade can stand in for
//! Cubism Core under the Cubism Web Framework / pixi-live2d-display.
//!
//! Memory model: every per-drawable array is a flat `Vec` owned by
//! `Instance` and allocated once at load time, so pointers returned by the
//! accessors stay valid until `ayg_destroy` (WASM memory growth still
//! detaches JS-side typed array views, which must be re-created when
//! `memory.buffer` changes).
//!
//! Vertex layout: `positions` is one contiguous `f32` span of
//! `total_vertex_count * 2` floats (x, y interleaved). Drawable `i` occupies
//! floats `[2 * vertex_offset[i], 2 * (vertex_offset[i] + vertex_count[i]))`.
//! `vertex_offset` equals the MOC3 texcoord offset, so `uvs` uses the same
//! indexing. Indices are `u16`, local to each drawable.
//!
//! Conventions are converted to Cubism Core's: Ayagami is y-down with
//! v-flipped UVs and opposite triangle winding, so `update` negates y,
//! `uvs` holds `1 - v`, and each index triangle is reversed.
//!
//! Flags use Cubism Core's bit layout:
//! - constant: bit0 additive, bit1 multiplicative, bit2 double-sided,
//!   bit3 inverted mask; bit7 (non-Core) = SDK 5.3 advanced blend mode.
//! - dynamic: bit0 visible, bit1 visibility changed, bit2 opacity changed,
//!   bit3 draw order changed, bit4 render order changed, bit5 vertex
//!   positions changed, bit6 blend color changed. Change bits accumulate
//!   until `reset_dynamic_flags`, as in Core.
//!
//! Inputs: `param_values` and `part_opacities` are writable arrays (Core's
//! `parameters.values` / `parts.opacities`); `update` pushes them into the
//! driver before driving.

use std::io::Cursor;

use ayagami::core::{ArtMesh, Item, ItemArray, Model, Param, Part};
use ayagami::driver::{DrawNode, Driver};
use ayagami::file::ParsedModel;

type Uid = <ParsedModel as Model>::Uid;

pub const CF_ADDITIVE: u8 = 1 << 0;
pub const CF_MULTIPLICATIVE: u8 = 1 << 1;
pub const CF_DOUBLE_SIDED: u8 = 1 << 2;
pub const CF_INVERTED_MASK: u8 = 1 << 3;
pub const CF_ADVANCED_BLEND: u8 = 1 << 7;

pub const DF_VISIBLE: u8 = 1 << 0;
pub const DF_VISIBILITY_CHANGED: u8 = 1 << 1;
pub const DF_OPACITY_CHANGED: u8 = 1 << 2;
pub const DF_DRAW_ORDER_CHANGED: u8 = 1 << 3;
pub const DF_RENDER_ORDER_CHANGED: u8 = 1 << 4;
pub const DF_VERTEX_POSITIONS_CHANGED: u8 = 1 << 5;
pub const DF_BLEND_COLOR_CHANGED: u8 = 1 << 6;

pub struct Instance {
    model: ParsedModel,
    driver: Driver<ParsedModel>,

    // Static per-model data.
    param_uids: Vec<Uid>,
    param_ids: Vec<String>,
    param_min: Vec<f32>,
    param_max: Vec<f32>,
    param_default: Vec<f32>,
    part_uids: Vec<Uid>,
    part_ids: Vec<String>,
    part_parent: Vec<i32>,
    drawable_uids: Vec<Uid>,
    drawable_ids: Vec<String>,
    drawable_parent_part: Vec<i32>,
    vertex_offset: Vec<u32>,
    vertex_count: Vec<i32>,
    index_offset: Vec<u32>,
    index_count: Vec<i32>,
    texture_index: Vec<i32>,
    constant_flags: Vec<u8>,
    /// Ayagami ColorBlendMode as u8 (0 Normal, 1 PremultAdd, 2 PremultMultiply, 3.. advanced)
    color_blend: Vec<u8>,
    alpha_blend: Vec<u8>,
    mask_offset: Vec<u32>,
    mask_count: Vec<i32>,
    mask_indices: Vec<i32>,
    uvs: Vec<f32>,
    indices: Vec<u16>,

    // Inputs.
    param_values: Vec<f32>,
    part_opacities: Vec<f32>,

    // Dynamic per-frame data.
    positions: Vec<f32>,
    opacity: Vec<f32>,
    dynamic_flags: Vec<u8>,
    multiply_color: Vec<f32>, // rgba, a = 1
    screen_color: Vec<f32>,   // rgba, a = 1
    render_order: Vec<i32>,
    draw_order: Vec<i32>,
    /// SDK 5.3 offscreen parts are inlined into the flat render order.
    offscreen_part_count: u32,
    first_update: bool,
}

impl Instance {
    pub fn load(bytes: &[u8]) -> Result<Self, String> {
        let model = ParsedModel::load(&mut Cursor::new(bytes)).map_err(|e| format!("{e:?}"))?;
        let driver = Driver::new(&model);

        let mut param_uids = Vec::new();
        let mut param_ids = Vec::new();
        let mut param_min = Vec::new();
        let mut param_max = Vec::new();
        let mut param_default = Vec::new();
        for p in model.params() {
            param_uids.push(p.uid());
            param_ids.push(p.id().to_string());
            param_min.push(p.min());
            param_max.push(p.max());
            param_default.push(p.default());
        }

        let mut part_uids = Vec::new();
        let mut part_ids = Vec::new();
        let mut part_parent = Vec::new();
        for p in model.parts() {
            part_uids.push(p.uid());
            part_ids.push(p.id().to_string());
            part_parent.push(p.parent().map(|q| q.uid() as i32).unwrap_or(-1));
        }

        let n = model.artmeshes().count();
        let mut drawable_uids = Vec::with_capacity(n);
        let mut drawable_ids = Vec::with_capacity(n);
        let mut drawable_parent_part = Vec::with_capacity(n);
        let mut vertex_offset = Vec::with_capacity(n);
        let mut vertex_count = Vec::with_capacity(n);
        let mut index_offset = Vec::with_capacity(n);
        let mut index_count = Vec::with_capacity(n);
        let mut texture_index = Vec::with_capacity(n);
        let mut constant_flags = Vec::with_capacity(n);
        let mut color_blend = Vec::with_capacity(n);
        let mut alpha_blend = Vec::with_capacity(n);
        let mut mask_offset = Vec::with_capacity(n);
        let mut mask_count = Vec::with_capacity(n);
        let mut mask_indices = Vec::new();
        for (i, am) in model.artmeshes().into_iter().enumerate() {
            debug_assert_eq!(am.uid() as usize, i);
            drawable_uids.push(am.uid());
            drawable_ids.push(am.id().to_string());
            drawable_parent_part.push(am.part().map(|p| p.uid() as i32).unwrap_or(-1));
            vertex_offset.push(am.texcoord_offset());
            vertex_count.push(am.vertex_count() as i32);
            let r = am.index_range();
            index_offset.push(r.start);
            index_count.push((r.end - r.start) as i32);
            texture_index.push(am.texture() as i32);
            let bc = am.blend_config();
            let mut f = 0u8;
            match bc.color as u8 {
                1 => f |= CF_ADDITIVE,
                2 => f |= CF_MULTIPLICATIVE,
                _ => {}
            }
            if !am.culling() {
                f |= CF_DOUBLE_SIDED;
            }
            if am.invert_mask() {
                f |= CF_INVERTED_MASK;
            }
            if bc.is_advanced() {
                f |= CF_ADVANCED_BLEND;
            }
            constant_flags.push(f);
            color_blend.push(bc.color as u8);
            alpha_blend.push(bc.alpha as u8);
            mask_offset.push(mask_indices.len() as u32);
            let before = mask_indices.len();
            for c in am.clips() {
                mask_indices.push(c.uid() as i32);
            }
            mask_count.push((mask_indices.len() - before) as i32);
        }

        let uvs: Vec<f32> = model
            .texcoord_buffer()
            .unwrap_or(&[])
            .iter()
            .flat_map(|c| [c.x, 1.0 - c.y])
            .collect();
        // Ayagami stores triangles with the opposite winding of Cubism Core
        // (consistent with its y-down space); reverse each triangle.
        let mut indices = model.index_buffer().unwrap_or(&[]).to_vec();
        for tri in indices.chunks_exact_mut(3) {
            tri.swap(0, 2);
        }
        let total_verts = uvs.len() / 2;
        let param_values = param_default.clone();
        let part_opacities = vec![1.0; part_uids.len()];

        Ok(Self {
            model,
            driver,
            param_uids,
            param_ids,
            param_min,
            param_max,
            param_default,
            part_uids,
            part_ids,
            part_parent,
            drawable_uids,
            drawable_ids,
            drawable_parent_part,
            vertex_offset,
            vertex_count,
            index_offset,
            index_count,
            texture_index,
            constant_flags,
            color_blend,
            alpha_blend,
            mask_offset,
            mask_count,
            mask_indices,
            uvs,
            indices,
            param_values,
            part_opacities,
            positions: vec![0.0; total_verts * 2],
            opacity: vec![0.0; n],
            dynamic_flags: vec![0; n],
            multiply_color: vec![1.0; n * 4],
            screen_color: vec![0.0; n * 4],
            render_order: vec![-1; n],
            draw_order: vec![0; n],
            offscreen_part_count: 0,
            first_update: true,
        })
    }

    pub fn drawable_count(&self) -> usize {
        self.drawable_uids.len()
    }
    pub fn param_count(&self) -> usize {
        self.param_uids.len()
    }
    pub fn part_count(&self) -> usize {
        self.part_uids.len()
    }
    pub fn total_vertex_count(&self) -> usize {
        self.positions.len() / 2
    }
    pub fn total_index_count(&self) -> usize {
        self.indices.len()
    }
    pub fn param_ids(&self) -> &[String] {
        &self.param_ids
    }
    pub fn positions(&self) -> &[f32] {
        &self.positions
    }
    pub fn render_order(&self) -> &[i32] {
        &self.render_order
    }
    pub fn mask_indices(&self) -> &[i32] {
        &self.mask_indices
    }
    pub fn advanced_blend_count(&self) -> usize {
        self.constant_flags.iter().filter(|f| **f & CF_ADVANCED_BLEND != 0).count()
    }
    pub fn offscreen_part_count(&self) -> u32 {
        self.offscreen_part_count
    }
    pub fn canvas(&self) -> (f32, [f32; 2], [f32; 2]) {
        let c = self.model.canvas_properties();
        (c.scale, [c.center.x, c.center.y], [c.dimensions.x, c.dimensions.y])
    }

    pub fn set_param(&mut self, index: usize, value: f32) -> bool {
        match self.param_values.get_mut(index) {
            Some(v) => {
                *v = value;
                true
            }
            None => false,
        }
    }
    pub fn set_param_by_id(&mut self, id: &str, value: f32) -> bool {
        match self.param_ids.iter().position(|s| s == id) {
            Some(i) => self.set_param(i, value),
            None => false,
        }
    }
    pub fn set_part_opacity(&mut self, index: usize, value: f32) -> bool {
        match self.part_opacities.get_mut(index) {
            Some(v) => {
                *v = value;
                true
            }
            None => false,
        }
    }

    pub fn reset_dynamic_flags(&mut self) {
        for f in self.dynamic_flags.iter_mut() {
            *f &= DF_VISIBLE;
        }
    }

    /// Pushes inputs into the driver, drives, and mirrors its output into
    /// the flat arrays. Returns the number of drawables whose vertices changed.
    pub fn update(&mut self) -> u32 {
        for (i, uid) in self.param_uids.iter().enumerate() {
            let _ = self.driver.set_param(*uid, self.param_values[i]);
        }
        for (i, uid) in self.part_uids.iter().enumerate() {
            let _ = self.driver.set_part_opacity(*uid, self.part_opacities[i]);
        }
        self.driver.drive(&self.model);

        let first = self.first_update;
        let mut changed = 0u32;
        for i in 0..self.drawable_uids.len() {
            let uid = self.drawable_uids[i];
            let Some(st) = self.driver.artmesh_state(uid) else {
                continue;
            };
            let old = self.dynamic_flags[i];
            let mut f = old & !DF_VISIBLE;
            // Cubism Core reports zero-opacity drawables as not visible.
            let visible = st.visual.visible && st.visual.opacity > 0.0;
            if visible {
                f |= DF_VISIBLE;
            }
            if first || visible != (old & DF_VISIBLE != 0) {
                f |= DF_VISIBILITY_CHANGED;
            }
            if first || self.opacity[i] != st.visual.opacity {
                f |= DF_OPACITY_CHANGED;
                self.opacity[i] = st.visual.opacity;
            }
            if first || self.draw_order[i] != st.depth {
                f |= DF_DRAW_ORDER_CHANGED;
                self.draw_order[i] = st.depth;
            }
            if st.updated {
                f |= DF_VERTEX_POSITIONS_CHANGED;
                changed += 1;
                let off = self.vertex_offset[i] as usize * 2;
                let dst = &mut self.positions[off..off + st.vertices.len() * 2];
                for (d, v) in dst.chunks_exact_mut(2).zip(st.vertices.iter()) {
                    d[0] = v.x;
                    d[1] = -v.y;
                }
            }
            let mc = st.visual.multiply_color;
            let sc = st.visual.screen_color;
            let m = [mc.x, mc.y, mc.z, 1.0];
            let s = [sc.x, sc.y, sc.z, 1.0];
            if first || self.multiply_color[i * 4..i * 4 + 4] != m || self.screen_color[i * 4..i * 4 + 4] != s {
                f |= DF_BLEND_COLOR_CHANGED;
                self.multiply_color[i * 4..i * 4 + 4].copy_from_slice(&m);
                self.screen_color[i * 4..i * 4 + 4].copy_from_slice(&s);
            }
            self.dynamic_flags[i] = f;
        }
        if self.driver.order_changed() || first {
            self.rebuild_render_order();
        }
        self.first_update = false;
        changed
    }

    /// Flattens Ayagami's draw node tree into a Cubism-style render order
    /// (render_order[drawable] = position in back-to-front sequence).
    /// Offscreen parts are inlined in place (lossy for SDK 5.3 offscreen
    /// blending, exact for everything else).
    fn rebuild_render_order(&mut self) {
        let mut seq: Vec<Uid> = Vec::with_capacity(self.drawable_uids.len());
        let mut offscreen = 0u32;
        fn walk(d: &Driver<ParsedModel>, part: Option<Uid>, seq: &mut Vec<Uid>, offscreen: &mut u32) {
            if let Some(nodes) = d.draw_nodes(part) {
                for n in nodes {
                    match n {
                        DrawNode::ArtMesh(u) => seq.push(*u),
                        DrawNode::OffscreenPart(p) => {
                            *offscreen += 1;
                            walk(d, Some(*p), seq, offscreen);
                        }
                    }
                }
            }
        }
        walk(&self.driver, None, &mut seq, &mut offscreen);
        self.offscreen_part_count = offscreen;
        // Update in place: the buffer address is exported and must not move.
        let mut new_order = vec![-1; self.drawable_uids.len()];
        for (pos, uid) in seq.iter().enumerate() {
            new_order[*uid as usize] = pos as i32;
        }
        for (i, o) in new_order.into_iter().enumerate() {
            if self.render_order[i] != o {
                self.render_order[i] = o;
                self.dynamic_flags[i] |= DF_RENDER_ORDER_CHANGED;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// C ABI (wasm32-unknown-unknown exports). All pointers are linear-memory
// offsets on wasm32. A null handle or out-of-range index returns 0 / null.
// ---------------------------------------------------------------------------

#[unsafe(no_mangle)]
pub extern "C" fn ayg_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr`/`len` must come from `ayg_alloc(len)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ayg_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(unsafe { Vec::from_raw_parts(ptr, 0, len) });
    }
}

/// # Safety
/// `ptr` must point to `len` readable bytes (a MOC3 file).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ayg_load(ptr: *const u8, len: usize) -> *mut Instance {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match Instance::load(bytes) {
        Ok(i) => Box::into_raw(Box::new(i)),
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// `h` must be a handle returned by `ayg_load` and not yet destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ayg_destroy(h: *mut Instance) {
    if !h.is_null() {
        drop(unsafe { Box::from_raw(h) });
    }
}

fn with_mut<R: Default>(h: *mut Instance, f: impl FnOnce(&mut Instance) -> R) -> R {
    match unsafe { h.as_mut() } {
        Some(i) => f(i),
        None => R::default(),
    }
}
fn with<R: Default>(h: *const Instance, f: impl FnOnce(&Instance) -> R) -> R {
    match unsafe { h.as_ref() } {
        Some(i) => f(i),
        None => R::default(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn ayg_update(h: *mut Instance) -> u32 {
    with_mut(h, |i| i.update())
}

#[unsafe(no_mangle)]
pub extern "C" fn ayg_reset_dynamic_flags(h: *mut Instance) {
    with_mut(h, |i| i.reset_dynamic_flags())
}

#[unsafe(no_mangle)]
pub extern "C" fn ayg_set_param(h: *mut Instance, index: u32, value: f32) -> u32 {
    with_mut(h, |i| i.set_param(index as usize, value) as u32)
}

#[unsafe(no_mangle)]
pub extern "C" fn ayg_set_part_opacity(h: *mut Instance, index: u32, value: f32) -> u32 {
    with_mut(h, |i| i.set_part_opacity(index as usize, value) as u32)
}

macro_rules! count_fn {
    ($name:ident, $field:ident) => {
        #[unsafe(no_mangle)]
        pub extern "C" fn $name(h: *const Instance) -> u32 {
            with(h, |i| i.$field.len() as u32)
        }
    };
}
count_fn!(ayg_param_count, param_uids);
count_fn!(ayg_part_count, part_uids);
count_fn!(ayg_drawable_count, drawable_uids);
count_fn!(ayg_index_len, indices);
count_fn!(ayg_mask_indices_len, mask_indices);
count_fn!(ayg_vertex_len, positions);

macro_rules! ptr_fn {
    ($name:ident, $field:ident, $t:ty) => {
        #[unsafe(no_mangle)]
        pub extern "C" fn $name(h: *const Instance) -> *const $t {
            match unsafe { h.as_ref() } {
                Some(i) => i.$field.as_ptr(),
                None => std::ptr::null(),
            }
        }
    };
}
ptr_fn!(ayg_vertex_ptr, positions, f32);
ptr_fn!(ayg_uv_ptr, uvs, f32);
ptr_fn!(ayg_index_ptr, indices, u16);
ptr_fn!(ayg_vertex_offsets, vertex_offset, u32);
ptr_fn!(ayg_vertex_counts, vertex_count, i32);
ptr_fn!(ayg_index_offsets, index_offset, u32);
ptr_fn!(ayg_index_counts, index_count, i32);
ptr_fn!(ayg_texture_indices, texture_index, i32);
ptr_fn!(ayg_constant_flags, constant_flags, u8);
ptr_fn!(ayg_color_blend_modes, color_blend, u8);
ptr_fn!(ayg_alpha_blend_modes, alpha_blend, u8);
ptr_fn!(ayg_mask_offsets, mask_offset, u32);
ptr_fn!(ayg_mask_counts, mask_count, i32);
ptr_fn!(ayg_mask_indices, mask_indices, i32);
ptr_fn!(ayg_opacities, opacity, f32);
ptr_fn!(ayg_dynamic_flags, dynamic_flags, u8);
ptr_fn!(ayg_multiply_colors, multiply_color, f32);
ptr_fn!(ayg_screen_colors, screen_color, f32);
ptr_fn!(ayg_render_orders, render_order, i32);
ptr_fn!(ayg_draw_orders, draw_order, i32);
ptr_fn!(ayg_drawable_parent_parts, drawable_parent_part, i32);
ptr_fn!(ayg_part_parents, part_parent, i32);
ptr_fn!(ayg_param_mins, param_min, f32);
ptr_fn!(ayg_param_maxs, param_max, f32);
ptr_fn!(ayg_param_defaults, param_default, f32);
// Writable inputs (Core's parameters.values / parts.opacities).
ptr_fn!(ayg_param_values, param_values, f32);
ptr_fn!(ayg_part_opacities, part_opacities, f32);

macro_rules! str_fns {
    ($ptr:ident, $len:ident, $field:ident) => {
        #[unsafe(no_mangle)]
        pub extern "C" fn $ptr(h: *const Instance, index: u32) -> *const u8 {
            match unsafe { h.as_ref() }.and_then(|i| i.$field.get(index as usize)) {
                Some(s) => s.as_ptr(),
                None => std::ptr::null(),
            }
        }
        #[unsafe(no_mangle)]
        pub extern "C" fn $len(h: *const Instance, index: u32) -> u32 {
            with(h, |i| i.$field.get(index as usize).map(|s| s.len() as u32).unwrap_or(0))
        }
    };
}
str_fns!(ayg_param_id_ptr, ayg_param_id_len, param_ids);
str_fns!(ayg_part_id_ptr, ayg_part_id_len, part_ids);
str_fns!(ayg_drawable_id_ptr, ayg_drawable_id_len, drawable_ids);

/// Canvas: writes [pixels_per_unit, origin_x, origin_y, width, height] (pixels) to `out`.
///
/// # Safety
/// `out` must point to 5 writable f32.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ayg_canvas(h: *const Instance, out: *mut f32) {
    let Some(i) = (unsafe { h.as_ref() }) else { return };
    let (s, c, d) = i.canvas();
    let o = unsafe { std::slice::from_raw_parts_mut(out, 5) };
    o.copy_from_slice(&[s, c[0], c[1], d[0], d[1]]);
}
