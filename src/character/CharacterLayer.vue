<script setup lang="ts">
// Track A: Live2D character + speech bubble. Rendered inside the desktop's character window
// (src/desktop/CharacterWindow.vue), which owns placement, chrome and hover controls.
// The window is marked [data-no-capture], so the character is never part of a capture.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CharacterRuntime } from '@/core/types'
import ConnectPrompt from '@/connectors/ConnectPrompt.vue'
import { useSettings } from '@/stores/settings'
import SpeechBubble from '@/ui/SpeechBubble.vue'
import WelcomeName from '@/ui/WelcomeName.vue'
import ControlPill from './ControlPill.vue'
import { FALLBACK_ANIM } from './emotion-map'
import { mountCharacter, unmountCharacter } from './index'
import { CHARACTER_MODELS, type CharacterId } from './models'
import { characterView } from './state'
import { useCharacterStore } from './store'

const store = useCharacterStore()
const settings = useSettings()
const stage = ref<HTMLDivElement | null>(null)
let runtime: CharacterRuntime | null = null
let generation = 0

/** Destroys the current runtime and mounts the chosen character. Later calls win. */
async function remount(id: CharacterId) {
  const gen = ++generation
  if (runtime) unmountCharacter(runtime)
  runtime = null
  if (!stage.value) return
  stage.value.replaceChildren()
  characterView.mode = 'loading'
  const rt = await mountCharacter(stage.value, id)
  if (gen !== generation) { unmountCharacter(rt); return }
  runtime = rt
}

onMounted(() => void remount(store.character))
watch(() => store.character, id => void remount(id))

onBeforeUnmount(() => {
  generation++
  if (runtime) unmountCharacter(runtime)
  runtime = null
})

const icon = computed(() => CHARACTER_MODELS[store.character].icon)
const spriteClass = computed(() => [
  `anim-${FALLBACK_ANIM[characterView.emotion] ?? 'none'}`,
  { sleeping: characterView.node === 'sleeping', speaking: characterView.speaking },
])
</script>

<template>
  <div class="character-layer" :data-mode="characterView.mode" :data-node="characterView.node" :data-character="store.character">
    <div class="bubble-anchor">
      <!-- First visit: she asks what to call the user, typed into her bubble. -->
      <WelcomeName v-if="!settings.welcomed" />
      <SpeechBubble v-else />
      <!-- "Connect Gmail" style offer after the agent worked on sample data. -->
      <div class="connect-slot"><ConnectPrompt /></div>
    </div>
    <!-- Upper body only: the legs fall below the window edge. -->
    <div class="window">
      <div class="viewport">
        <div ref="stage" class="stage" />
        <div v-if="characterView.mode === 'fallback'" class="fallback">
          <img :key="characterView.pulse" :src="icon" alt="Character" class="sprite" :class="spriteClass" draggable="false">
        </div>
      </div>
      <!-- The pill hides the waist cut and holds the quick controls. -->
      <ControlPill />
    </div>
  </div>
</template>

<style scoped>
.character-layer {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}
.window {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Transparent window: only the avatar is drawn, like a desktop pet. */
  background: transparent;
}
.viewport {
  /* Ends exactly at the top edge of the control pill: the avatar rises out of it. */
  position: absolute;
  inset: 0 0 var(--pill-top, 64px) 0;
  overflow: hidden;
}
.stage { position: absolute; inset: 0; }
/* The avatar canvas takes presses on her head and body (see cubism-runtime.ts touch);
   presses on transparent pixels bubble on to the window drag. */
.stage :deep(canvas) { pointer-events: auto; }
.bubble-anchor {
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translate(-50%, -100%);
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: 120%;
}
.connect-slot { pointer-events: auto; }
.connect-slot:empty { display: none; }
.fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 24px;
}
.sprite {
  width: 62%;
  max-width: 320px;
  border-radius: 24px;
  filter: drop-shadow(0 8px 18px rgba(40, 20, 60, 0.25));
  transform-origin: 50% 100%;
  transition: opacity 0.4s ease, filter 0.4s ease;
}
.sprite.sleeping { opacity: 0.6; filter: grayscale(0.3) drop-shadow(0 8px 18px rgba(40, 20, 60, 0.2)); }
.sprite.speaking { animation: talk 0.28s ease-in-out infinite alternate; }
.anim-bounce { animation: bounce 0.6s ease-in-out 3; }
.anim-jump { animation: jump 0.5s cubic-bezier(0.3, 1.6, 0.6, 1) 1; }
.anim-tilt { animation: tilt 1.6s ease-in-out 2; }
.anim-droop { animation: droop 1.2s ease-in-out 1 forwards; }
.anim-pulse { animation: pulse 1.4s ease-in-out 2; }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-18px) scale(1.02, 0.98); } }
@keyframes jump { 0% { transform: translateY(0) scale(1); } 40% { transform: translateY(-28px) scale(0.96, 1.06); } 100% { transform: translateY(0) scale(1); } }
@keyframes tilt { 0%, 100% { transform: rotate(0deg); } 30% { transform: rotate(-6deg); } 70% { transform: rotate(4deg); } }
@keyframes droop { 0% { transform: translateY(0) rotate(0); } 100% { transform: translateY(8px) rotate(-3deg) scale(0.98); } }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
@keyframes talk { from { transform: scale(1, 1); } to { transform: scale(1.01, 0.985); } }
</style>
