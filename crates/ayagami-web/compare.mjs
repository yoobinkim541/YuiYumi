// Spike check: run the wasm32 build of ayagami-web in Node and compare its
// deformed vertex positions, opacities and render orders against the
// official Cubism Core (public/vendor/live2dcubismcore.min.js) for the same
// parameter values.
//
// Usage: node compare.mjs [model.moc3]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const mocPath = process.argv[2] ?? resolve(root, "models/Yui/Yui.moc3");
const moc = readFileSync(mocPath);

// ---- Ayagami (wasm) ----
const wasmBytes = readFileSync(resolve(here, "target/wasm32-unknown-unknown/release/ayagami_web.wasm"));
const t0 = performance.now();
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const tInst = performance.now() - t0;
const X = instance.exports;
const mem = () => X.memory.buffer;
const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes));

const p = X.ayg_alloc(moc.length);
new Uint8Array(mem(), p, moc.length).set(moc);
let t = performance.now();
const h = X.ayg_load(p, moc.length);
const tLoad = performance.now() - t;
X.ayg_free(p, moc.length);
if (!h) throw new Error("ayg_load failed");

const dec = new TextDecoder();
const str = (ptrFn, lenFn, i) => dec.decode(new Uint8Array(mem(), ptrFn(h, i), lenFn(h, i)));
const nParams = X.ayg_param_count(h);
const nDraw = X.ayg_drawable_count(h);
const aParamIds = Array.from({ length: nParams }, (_, i) => str(X.ayg_param_id_ptr, X.ayg_param_id_len, i));
const aDrawIds = Array.from({ length: nDraw }, (_, i) => str(X.ayg_drawable_id_ptr, X.ayg_drawable_id_len, i));
const u32 = (ptr, n) => new Uint32Array(mem(), ptr, n);
const f32 = (ptr, n) => new Float32Array(mem(), ptr, n);
const i32 = (ptr, n) => new Int32Array(mem(), ptr, n);

// ---- Cubism Core ----
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(root, "public/vendor");
globalThis.__filename = resolve(root, "public/vendor/live2dcubismcore.min.js");
const coreSrc = readFileSync(resolve(root, "public/vendor/live2dcubismcore.min.js"), "utf8");
vm.runInThisContext(coreSrc + "\nglobalThis.Live2DCubismCore = Live2DCubismCore;");
const Core = globalThis.Live2DCubismCore;
// The Emscripten runtime finishes initializing asynchronously.
await new Promise((r) => setTimeout(r, 300));
const ab = moc.buffer.slice(moc.byteOffset, moc.byteOffset + moc.byteLength);
const cMoc = Core.Moc.fromArrayBuffer(ab);
const cModel = Core.Model.fromMoc(cMoc);
const cParamIds = Array.from(cModel.parameters.ids);
const cDrawIds = Array.from(cModel.drawables.ids);

console.log(`wasm: ${wasmBytes.length} bytes, imports: ${imports.length ? imports.map((i) => i.module + "." + i.name).join(",") : "none"}`);
console.log(`wasm instantiate ${tInst.toFixed(1)} ms, ayg_load ${tLoad.toFixed(1)} ms`);
console.log(`params ayagami=${nParams} core=${cParamIds.length}; drawables ayagami=${nDraw} core=${cDrawIds.length}`);
const sameIds = nDraw === cDrawIds.length && aDrawIds.every((id, i) => id === cDrawIds[i]);
console.log(`drawable id order identical: ${sameIds}`);

// Static data comparison.
const vOff = u32(X.ayg_vertex_offsets(h), nDraw);
const vCnt = i32(X.ayg_vertex_counts(h), nDraw);
const iOff = u32(X.ayg_index_offsets(h), nDraw);
const iCnt = i32(X.ayg_index_counts(h), nDraw);
const tex = i32(X.ayg_texture_indices(h), nDraw);
const idx = new Uint16Array(mem(), X.ayg_index_ptr(h), X.ayg_index_len(h));
const uv = f32(X.ayg_uv_ptr(h), X.ayg_vertex_len(h));
const mOff = u32(X.ayg_mask_offsets(h), nDraw);
const mCnt = i32(X.ayg_mask_counts(h), nDraw);
const mIdx = i32(X.ayg_mask_indices(h), X.ayg_mask_indices_len(h));
const cflags = new Uint8Array(mem(), X.ayg_constant_flags(h), nDraw);
const cblend = new Uint8Array(mem(), X.ayg_color_blend_modes(h), nDraw);
let staticMismatch = { vcount: 0, icount: 0, indices: 0, uvs: 0, texture: 0, masks: 0, constantFlags: 0 };
const D = cModel.drawables;
for (let i = 0; i < nDraw; i++) {
  if (D.vertexCounts[i] !== vCnt[i]) staticMismatch.vcount++;
  if (D.indexCounts[i] !== iCnt[i]) staticMismatch.icount++;
  else {
    const ci = D.indices[i];
    for (let k = 0; k < iCnt[i]; k++) if (ci[k] !== idx[iOff[i] + k]) { staticMismatch.indices++; break; }
  }
  const cuv = D.vertexUvs[i];
  for (let k = 0; k < vCnt[i] * 2; k++) if (Math.abs(cuv[k] - uv[vOff[i] * 2 + k]) > 1e-6) { staticMismatch.uvs++; break; }
  if (D.textureIndices[i] !== tex[i]) staticMismatch.texture++;
  const cm = Array.from(D.masks[i]).sort((a, b) => a - b);
  const am = Array.from(mIdx.subarray(mOff[i], mOff[i] + mCnt[i])).sort((a, b) => a - b);
  if (cm.length !== am.length || cm.some((v, k) => v !== am[k])) staticMismatch.masks++;
  // Same bit layout as Core (bit7 is a non-Core advanced-blend marker).
  if ((D.constantFlags[i] & 0x0f) !== (cflags[i] & 0x0f)) staticMismatch.constantFlags++;
}
console.log("static mismatches (drawables):", JSON.stringify(staticMismatch));


if (process.env.PROBE) {
  X.ayg_update(h); cModel.update();
  const pos = f32(X.ayg_vertex_ptr(h), X.ayg_vertex_len(h));
  for (const i of [0, 1, 100]) {
    console.log(`#${i} ${cDrawIds[i]} vc=${vCnt[i]} ic=${iCnt[i]} vOff=${vOff[i]} iOff=${iOff[i]}`);
    console.log("  core idx", Array.from(D.indices[i].slice(0, 9)).join(","), " ayg idx", Array.from(idx.slice(iOff[i], iOff[i] + 9)).join(","));
    console.log("  core uv ", Array.from(D.vertexUvs[i].slice(0, 6)).map(v=>v.toFixed(4)).join(","), " ayg uv", Array.from(uv.slice(vOff[i]*2, vOff[i]*2 + 6)).map(v=>v.toFixed(4)).join(","));
    console.log("  core pos", Array.from(D.vertexPositions[i].slice(0, 6)).map(v=>v.toFixed(4)).join(","), " ayg pos", Array.from(pos.slice(vOff[i]*2, vOff[i]*2 + 6)).map(v=>v.toFixed(4)).join(","));
  }
  process.exit(0);
}

function setBoth(values) {
  // Reset all params to default on both sides, then apply overrides.
  const def = f32(X.ayg_param_defaults(h), nParams);
  for (let i = 0; i < nParams; i++) X.ayg_set_param(h, i, def[i]);
  const cv = cModel.parameters.values;
  for (let i = 0; i < cParamIds.length; i++) cv[i] = cModel.parameters.defaultValues[i];
  const cpo = cModel.parts.opacities;
  for (let i = 0; i < cpo.length; i++) cpo[i] = 1;
  for (const [id, v] of Object.entries(values)) {
    const ai = aParamIds.indexOf(id);
    const ci = cParamIds.indexOf(id);
    if (ai >= 0) X.ayg_set_param(h, ai, v);
    if (ci >= 0) cv[ci] = v;
  }
}


if (process.env.PROBE2) {
  const show = (label) => {
    const op = f32(X.ayg_opacities(h), nDraw);
    const df = new Uint8Array(mem(), X.ayg_dynamic_flags(h), nDraw);
    let vis = [], ops = [];
    for (let i = 0; i < nDraw; i++) {
      const cvis = !!(D.dynamicFlags[i] & 1);
      if (cvis !== !!(df[i] & 1)) vis.push(`${cDrawIds[i]} core(vis=${cvis},op=${D.opacities[i].toFixed(3)}) ayg(vis=${!!(df[i]&1)},op=${op[i].toFixed(3)})`);
      if (Math.abs(D.opacities[i] - op[i]) > 1e-3) ops.push(`${cDrawIds[i]} core=${D.opacities[i].toFixed(3)} ayg=${op[i].toFixed(3)} coreVis=${cvis}`);
    }
    const visSummary = {};
    for (let i = 0; i < nDraw; i++) { const cvis = !!(D.dynamicFlags[i] & 1); if (cvis !== !!(df[i] & 1)) { const k = `core=${cvis} ayg=${!!(df[i]&1)} coreOp0=${D.opacities[i] < 1e-3} aygOp0=${op[i] < 1e-3}`; visSummary[k] = (visSummary[k]||0)+1; } }
    console.log(label, "vis mismatch summary", JSON.stringify(visSummary));
    console.log(label, "vis sample", vis.slice(0, 4));
    console.log(label, "opacity sample", ops.length, ops.slice(0, 6));
  };
  setBoth({}); X.ayg_update(h); cModel.update(); show("default");
  const mins = Array.from(f32(X.ayg_param_mins(h), nParams)), maxs = Array.from(f32(X.ayg_param_maxs(h), nParams));
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const v = {}; aParamIds.forEach((id, i) => (v[id] = mins[i] + (maxs[i] - mins[i]) * rnd()));
  setBoth(v); X.ayg_update(h); cModel.update(); show("random");
  // which single param causes opacity diff?
  const culprits = [];
  for (const id of aParamIds) {
    setBoth({ [id]: v[id] }); X.ayg_update(h); cModel.update();
    const op = f32(X.ayg_opacities(h), nDraw);
    let n = 0; for (let i = 0; i < nDraw; i++) if (Math.abs(D.opacities[i] - op[i]) > 1e-3) n++;
    if (n) culprits.push(`${id}=${v[id].toFixed(3)} (${n})`);
  }
  console.log("single-param opacity culprits:", culprits.slice(0, 10));
  for (const [id, val] of [["ParamSkinhead", 0.436], ["ParamSkinhead", 1], ["ParamSkinhead", 0.5], ["ParamhaoriOnOff", 0.111], ["ParamhaoriOnOff", 1], ["ParamHeartEffect", 0.754], ["ParamHeartEffect", 1]]) {
    setBoth({ [id]: val }); X.ayg_update(h); cModel.update();
    const op = f32(X.ayg_opacities(h), nDraw);
    const diffs = [];
    for (let i = 0; i < nDraw; i++) if (Math.abs(D.opacities[i] - op[i]) > 1e-3) diffs.push(`${cDrawIds[i]}:core=${D.opacities[i].toFixed(3)}/ayg=${op[i].toFixed(3)}`);
    const pi = cParamIds.indexOf(id);
    console.log(`${id}=${val} range[${cModel.parameters.minimumValues[pi]},${cModel.parameters.maximumValues[pi]}] keys=${cModel.parameters.keyValues ? Array.from(cModel.parameters.keyValues[pi]).join("/") : "?"} diffs=${diffs.length}`, diffs.slice(0, 4).join(" "));
  }
  process.exit(0);
}

if (process.env.PROBE3) {
  setBoth({ ParamAngleX: 30, ParamMouthOpenY: 1, ParamEyeLOpen: 0 }); X.ayg_update(h); cModel.update();
  const mul = f32(X.ayg_multiply_colors(h), nDraw * 4), scr = f32(X.ayg_screen_colors(h), nDraw * 4);
  const fmt = (a, i) => Array.from(a.slice(i * 4, i * 4 + 4)).map((v) => v.toFixed(3)).join(",");
  for (let i = 0; i < nDraw; i++) {
    let bad = false;
    for (let k = 0; k < 3; k++) if (Math.abs(D.multiplyColors[i * 4 + k] - mul[i * 4 + k]) > 1e-3 || Math.abs(D.screenColors[i * 4 + k] - scr[i * 4 + k]) > 1e-3) bad = true;
    if (bad) console.log(`${cDrawIds[i]} vis=${D.dynamicFlags[i] & 1} op=${D.opacities[i].toFixed(3)} core mul=${fmt(D.multiplyColors, i)} scr=${fmt(D.screenColors, i)} | ayg mul=${fmt(mul, i)} scr=${fmt(scr, i)}`);
  }
  process.exit(0);
}

function compare(label, values) {
  setBoth(values);
  let ta = performance.now();
  X.ayg_update(h);
  ta = performance.now() - ta;
  let tc = performance.now();
  cModel.update();
  tc = performance.now() - tc;
  const pos = f32(X.ayg_vertex_ptr(h), X.ayg_vertex_len(h));
  const op = f32(X.ayg_opacities(h), nDraw);
  const ro = i32(X.ayg_render_orders(h), nDraw);
  const dflags = new Uint8Array(mem(), X.ayg_dynamic_flags(h), nDraw);
  const mul = f32(X.ayg_multiply_colors(h), nDraw * 4);
  const scr = f32(X.ayg_screen_colors(h), nDraw * 4);
  let maxErr = 0, sumErr = 0, nV = 0, badDraw = 0, worst = "";
  let opErr = 0, opBad = 0, visBad = 0, orderBad = 0, colorBad = 0;
  for (let i = 0; i < nDraw; i++) {
    const cv = D.vertexPositions[i];
    let dmax = 0;
    for (let k = 0; k < vCnt[i] * 2; k++) {
      const e = Math.abs(cv[k] - pos[vOff[i] * 2 + k]);
      dmax = Math.max(dmax, e);
      sumErr += e;
      nV++;
    }
    const cVisible = !!(D.dynamicFlags[i] & 1);
    if (cVisible !== !!(dflags[i] & 1)) visBad++;
    // Only care about vertex error for drawables that are actually drawn.
    if (cVisible && D.opacities[i] > 0.001) {
      if (dmax > 1e-3) badDraw++;
      if (dmax > maxErr) { maxErr = dmax; worst = cDrawIds[i]; }
    }
    const e = Math.abs(D.opacities[i] - op[i]);
    opErr = Math.max(opErr, e);
    if (e > 1e-3) opBad++;
    if (D.renderOrders[i] !== ro[i]) orderBad++;
    if (D.multiplyColors && D.screenColors) {
      for (let k = 0; k < 3; k++) {
        if (Math.abs(D.multiplyColors[i * 4 + k] - mul[i * 4 + k]) > 1e-3 || Math.abs(D.screenColors[i * 4 + k] - scr[i * 4 + k]) > 1e-3) { colorBad++; break; }
      }
    }
  }
  console.log(
    `[${label}] ayagami ${ta.toFixed(2)} ms vs core ${tc.toFixed(2)} ms | ` +
      `vertex max err ${maxErr.toExponential(2)} (${worst}), mean ${(sumErr / nV).toExponential(2)}, ` +
      `visible drawables >1e-3: ${badDraw} | opacity max err ${opErr.toFixed(4)} (${opBad} >1e-3) | ` +
      `visibility mismatch ${visBad} | renderOrder mismatch ${orderBad} | color mismatch ${colorBad}`
  );
}

compare("default", {});
compare("angleX30+mouth", { ParamAngleX: 30, ParamMouthOpenY: 1, ParamEyeLOpen: 0 });
compare("angleXY-30/-30+bodyX", { ParamAngleX: -30, ParamAngleY: -30, ParamAngleZ: 20, ParamBodyAngleX: 10 });
// Random sweep within each parameter's range.
const mins = Array.from(f32(X.ayg_param_mins(h), nParams));
const maxs = Array.from(f32(X.ayg_param_maxs(h), nParams));
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let r = 0; r < 3; r++) {
  const v = {};
  aParamIds.forEach((id, i) => (v[id] = mins[i] + (maxs[i] - mins[i]) * rnd()));
  compare(`random#${r}`, v);
}

// Steady-state timing in wasm: 4 params per frame.
const ix = (id) => aParamIds.indexOf(id);
const [ax, ay, mo] = [ix("ParamAngleX"), ix("ParamAngleY"), ix("ParamMouthOpenY")];
t = performance.now();
for (let f = 0; f < 600; f++) {
  const ph = f / 60;
  X.ayg_set_param(h, ax, 30 * Math.sin(ph * 2));
  X.ayg_set_param(h, ay, 15 * Math.cos(ph * 1.3));
  X.ayg_set_param(h, mo, 0.5 + 0.5 * Math.sin(ph * 9));
  X.ayg_update(h);
}
const tA = (performance.now() - t) / 600;
t = performance.now();
const cv = cModel.parameters.values;
const [cax, cay, cmo] = [cParamIds.indexOf("ParamAngleX"), cParamIds.indexOf("ParamAngleY"), cParamIds.indexOf("ParamMouthOpenY")];
for (let f = 0; f < 600; f++) {
  const ph = f / 60;
  cv[cax] = 30 * Math.sin(ph * 2);
  cv[cay] = 15 * Math.cos(ph * 1.3);
  cv[cmo] = 0.5 + 0.5 * Math.sin(ph * 9);
  cModel.update();
}
const tC = (performance.now() - t) / 600;
console.log(`steady state (600 frames, 3 params): ayagami wasm ${tA.toFixed(3)} ms/frame, cubism core ${tC.toFixed(3)} ms/frame`);
console.log(`wasm memory after run: ${(mem().byteLength / 1048576).toFixed(1)} MiB`);
