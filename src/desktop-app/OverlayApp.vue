<script setup lang="ts">
// Overlay window content: the character (upper body, bubble, pill) at the bottom of a
// transparent window, the confirm card above her head. Everything else is see-through and
// click-through (see overlay.ts).
import CharacterLayer from '@/character/CharacterLayer.vue'
import { CHARACTER_H, CHARACTER_W, PILL_ZONE } from '@/desktop/windows'
import ConfirmCard from '@/ui/ConfirmCard.vue'
import { screenRect } from './screen'
</script>

<template>
  <!-- The real main display in page coordinates: the director maps glances (1920x1080
       logical points) through [data-capture-root]. Never rendered, never hit. -->
  <div
    class="ov-screen"
    data-capture-root
    data-pass-through
    aria-hidden="true"
    :style="{ left: `${screenRect.left}px`, top: `${screenRect.top}px`, width: `${screenRect.width}px`, height: `${screenRect.height}px` }"
  />
  <div class="ov-character" :style="{ width: `${CHARACTER_W}px`, height: `${CHARACTER_H}px`, '--pill-zone': `${PILL_ZONE}px` }">
    <CharacterLayer />
  </div>
  <ConfirmCard />
</template>

<style>
html.yy-overlay, html.yy-overlay body, html.yy-overlay #app {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
  font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans KR", sans-serif;
  user-select: none;
}
/* The card sits above her head, inside the narrow overlay. */
html.yy-overlay .confirm-card {
  --char-w: 0px;
  top: 12px;
  bottom: auto;
  max-height: calc(100vh - 24px);
}
</style>

<style scoped>
.ov-screen { position: fixed; visibility: hidden; pointer-events: none; }
.ov-character {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
}
</style>
