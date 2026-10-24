// A `Live2DCubismCore`-shaped facade over the ayagami-web wasm module (copied from
// crates/ayagami-web/js/ayagami-cubism-core.mjs; keep the two in sync).
//
// It implements the subset of the Cubism Core JS API that the Cubism 4 Web
// Framework bundled in pixi-live2d-display 0.4.0 and cubism-web-batched-renderer
// read: Moc.fromArrayBuffer, Model.fromMoc, model.parameters / parts /
// drawables / canvasinfo, update(), release(), drawables.resetDynamicFlags(),
// Utils.has*Bit, Version, Logging.
//
// Inputs (parameters.values, parts.opacities) are JS-owned Float32Arrays,
// because the framework caches those views at init; they are copied into wasm
// memory on every update(). Outputs are views over wasm memory, re-created
// when memory.buffer changes (memory growth detaches old views), so
// drawables.vertexPositions[i] all share one heap buffer as the batched
// renderer requires.

export async function createAyagamiCubismCore(wasmSource) {
  const { instance } = await WebAssembly.instantiate(wasmSource, {})
  const X = instance.exports
  const dec = new TextDecoder()

  const Utils = {
    hasBlendAdditiveBit: (f) => (f & 1) === 1,
    hasBlendMultiplicativeBit: (f) => (f & 2) === 2,
    hasIsDoubleSidedBit: (f) => (f & 4) === 4,
    hasIsInvertedMaskBit: (f) => (f & 8) === 8,
    hasIsVisibleBit: (f) => (f & 1) === 1,
    hasVisibilityDidChangeBit: (f) => (f & 2) === 2,
    hasOpacityDidChangeBit: (f) => (f & 4) === 4,
    hasDrawOrderDidChangeBit: (f) => (f & 8) === 8,
    hasRenderOrderDidChangeBit: (f) => (f & 16) === 16,
    hasVertexPositionsDidChangeBit: (f) => (f & 32) === 32,
    hasBlendColorDidChangeBit: (f) => (f & 64) === 64,
  }

  class Moc {
    constructor(bytes) {
      this.bytes = bytes
    }
    static fromArrayBuffer(buffer) {
      return buffer ? new Moc(new Uint8Array(buffer.slice(0))) : null
    }
    _release() {
      this.bytes = null
    }
    hasMocConsistency() {
      return 1
    }
  }

  class Model {
    static fromMoc(moc) {
      const p = X.ayg_alloc(moc.bytes.length)
      new Uint8Array(X.memory.buffer, p, moc.bytes.length).set(moc.bytes)
      const h = X.ayg_load(p, moc.bytes.length)
      X.ayg_free(p, moc.bytes.length)
      return h ? new Model(h) : null
    }

    constructor(h) {
      this.h = h
      const mem = () => X.memory.buffer
      const str = (ptrFn, lenFn, i) => dec.decode(new Uint8Array(mem(), ptrFn(h, i), lenFn(h, i)).slice())
      const copyF32 = (ptr, n) => new Float32Array(mem(), ptr, n).slice()
      const copyI32 = (ptr, n) => new Int32Array(mem(), ptr, n).slice()

      const nParams = X.ayg_param_count(h)
      const nParts = X.ayg_part_count(h)
      const nDraw = X.ayg_drawable_count(h)

      this.parameters = {
        count: nParams,
        ids: Array.from({ length: nParams }, (_, i) => str(X.ayg_param_id_ptr, X.ayg_param_id_len, i)),
        minimumValues: copyF32(X.ayg_param_mins(h), nParams),
        maximumValues: copyF32(X.ayg_param_maxs(h), nParams),
        defaultValues: copyF32(X.ayg_param_defaults(h), nParams),
        values: copyF32(X.ayg_param_defaults(h), nParams),
        types: new Int32Array(nParams),
      }
      this.parts = {
        count: nParts,
        ids: Array.from({ length: nParts }, (_, i) => str(X.ayg_part_id_ptr, X.ayg_part_id_len, i)),
        opacities: new Float32Array(nParts).fill(1),
        parentIndices: copyI32(X.ayg_part_parents(h), nParts),
      }

      const canvas = X.ayg_alloc(20)
      X.ayg_canvas(h, canvas)
      const [ppu, ox, oy, w, hgt] = new Float32Array(mem(), canvas, 5)
      X.ayg_free(canvas, 20)
      this.canvasinfo = { PixelsPerUnit: ppu, CanvasOriginX: ox, CanvasOriginY: oy, CanvasWidth: w, CanvasHeight: hgt }

      // Static drawable data (copied out once).
      const vertexCounts = copyI32(X.ayg_vertex_counts(h), nDraw)
      const indexCounts = copyI32(X.ayg_index_counts(h), nDraw)
      const vOff = new Uint32Array(mem(), X.ayg_vertex_offsets(h), nDraw).slice()
      const iOff = new Uint32Array(mem(), X.ayg_index_offsets(h), nDraw).slice()
      const mOff = new Uint32Array(mem(), X.ayg_mask_offsets(h), nDraw).slice()
      const maskCounts = copyI32(X.ayg_mask_counts(h), nDraw)
      const maskAll = copyI32(X.ayg_mask_indices(h), X.ayg_mask_indices_len(h))
      const uvAll = copyF32(X.ayg_uv_ptr(h), X.ayg_vertex_len(h))
      const idxAll = new Uint16Array(mem(), X.ayg_index_ptr(h), X.ayg_index_len(h)).slice()

      const d = {
        count: nDraw,
        ids: Array.from({ length: nDraw }, (_, i) => str(X.ayg_drawable_id_ptr, X.ayg_drawable_id_len, i)),
        constantFlags: new Uint8Array(mem(), X.ayg_constant_flags(h), nDraw).slice(),
        textureIndices: copyI32(X.ayg_texture_indices(h), nDraw),
        maskCounts,
        masks: Array.from({ length: nDraw }, (_, i) => maskAll.subarray(mOff[i], mOff[i] + maskCounts[i])),
        vertexCounts,
        vertexUvs: Array.from({ length: nDraw }, (_, i) => uvAll.subarray(vOff[i] * 2, (vOff[i] + vertexCounts[i]) * 2)),
        indexCounts,
        indices: Array.from({ length: nDraw }, (_, i) => idxAll.subarray(iOff[i], iOff[i] + indexCounts[i])),
        parentPartIndices: copyI32(X.ayg_drawable_parent_parts(h), nDraw),
        resetDynamicFlags: () => X.ayg_reset_dynamic_flags(h),
      }

      // Dynamic views over wasm memory, rebuilt when the buffer changes.
      let viewBuffer = null
      let views = null
      const refresh = () => {
        if (viewBuffer === X.memory.buffer)
          return views
        viewBuffer = X.memory.buffer
        const b = viewBuffer
        const pos = X.ayg_vertex_ptr(h)
        views = {
          dynamicFlags: new Uint8Array(b, X.ayg_dynamic_flags(h), nDraw),
          opacities: new Float32Array(b, X.ayg_opacities(h), nDraw),
          drawOrders: new Int32Array(b, X.ayg_draw_orders(h), nDraw),
          renderOrders: new Int32Array(b, X.ayg_render_orders(h), nDraw),
          multiplyColors: new Float32Array(b, X.ayg_multiply_colors(h), nDraw * 4),
          screenColors: new Float32Array(b, X.ayg_screen_colors(h), nDraw * 4),
          vertexPositions: Array.from({ length: nDraw }, (_, i) => new Float32Array(b, pos + vOff[i] * 8, vertexCounts[i] * 2)),
        }
        return views
      }
      for (const key of ['dynamicFlags', 'opacities', 'drawOrders', 'renderOrders', 'multiplyColors', 'screenColors', 'vertexPositions'])
        Object.defineProperty(d, key, { get: () => refresh()[key], enumerable: true })
      this.drawables = d
    }

    update() {
      const h = this.h
      const buf = X.memory.buffer
      new Float32Array(buf, X.ayg_param_values(h), this.parameters.count).set(this.parameters.values)
      new Float32Array(buf, X.ayg_part_opacities(h), this.parts.count).set(this.parts.opacities)
      X.ayg_update(h)
    }

    release() {
      if (this.h)
        X.ayg_destroy(this.h)
      this.h = 0
    }
  }

  let logFn = null
  return {
    _isStarted: true,
    Moc,
    Model,
    Utils,
    Version: { csmGetVersion: () => 0x05000000, csmGetLatestMocVersion: () => 6, csmGetMocVersion: () => 5 },
    Logging: { csmSetLogFunction: (f) => (logFn = f), csmGetLogFunction: () => logFn },
    Memory: { initializeAmountOfMemory: () => {} },
  }
}
