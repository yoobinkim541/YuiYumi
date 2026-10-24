<script setup lang="ts">
// One macOS-style pull-down menu. Mouse-down is cancelled on rows so the text field that had
// focus keeps it (Edit menu commands act on it).
import { formatShortcut, type MenuDef } from './menus'

defineProps<{ menu: MenuDef, left: number }>()
const emit = defineEmits<{ run: [action: string] }>()

function onClick(action: string | undefined, disabled: boolean | undefined) {
  if (action && !disabled) emit('run', action)
}
</script>

<template>
  <div
    class="md"
    role="menu"
    :style="{ left: `${left}px` }"
    :data-no-capture="menu.noCapture ? '' : undefined"
    @mousedown.prevent
  >
    <template v-for="(e, i) in menu.entries" :key="i">
      <div v-if="e.kind === 'sep'" class="md-sep" />
      <label v-else-if="e.kind === 'search'" class="md-search" @mousedown.stop>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></svg>
        <input type="text" :placeholder="e.placeholder" spellcheck="false">
      </label>
      <button
        v-else
        type="button"
        class="md-row"
        role="menuitem"
        :disabled="e.disabled"
        :data-no-capture="e.noCapture ? '' : undefined"
        @click="onClick(e.action, e.disabled)"
      >
        <span class="md-check">{{ e.checked ? '✓' : '' }}</span>
        <span class="md-label">{{ e.label }}</span>
        <span v-if="e.shortcut" class="md-key">{{ formatShortcut(e.shortcut) }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.md {
  position: absolute;
  top: 40px;
  min-width: 270px;
  max-width: 520px;
  padding: 5px;
  border-radius: 12px;
  background: rgba(236, 236, 241, 0.97);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.26), 0 0 0 0.5px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.6);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: -0.005em;
  color: #1d1d1f;
  z-index: 100003;
  user-select: none;
}
.md-row {
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  padding: 0 14px 0 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: default;
}
.md-row:hover:not(:disabled) { background: #1f6fe5; color: #fff; }
.md-row:disabled { color: rgba(0, 0, 0, 0.28); }
.md-check { width: 24px; flex: none; text-align: center; font-size: 14px; }
.md-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-right: 28px; }
.md-key { flex: none; color: rgba(0, 0, 0, 0.45); font-size: 15px; letter-spacing: 0.06em; }
.md-row:hover:not(:disabled) .md-key { color: rgba(255, 255, 255, 0.85); }
.md-row:disabled .md-key { color: rgba(0, 0, 0, 0.22); }
.md-sep { height: 1px; margin: 5px 10px; background: rgba(0, 0, 0, 0.1); }
.md-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 6px 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.md-search svg { width: 16px; height: 16px; flex: none; fill: none; stroke: rgba(0, 0, 0, 0.45); stroke-width: 2; }
.md-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 15px; color: inherit; }
</style>
