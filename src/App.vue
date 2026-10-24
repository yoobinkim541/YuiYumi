<script setup lang="ts">
import CharacterLayer from './character/CharacterLayer.vue'
import VirtualDesktop from './desktop/VirtualDesktop.vue'
import ControlBar from './ui/ControlBar.vue'
import ConfirmCard from './ui/ConfirmCard.vue'
import ObservingIndicator from './ui/ObservingIndicator.vue'
</script>

<template>
  <div class="stage">
    <!-- Captured for the observer. Nothing outside this layer is ever sent. -->
    <VirtualDesktop class="desktop" />
    <!-- Overlay layers: not part of the capture. -->
    <CharacterLayer class="character" />
    <ConfirmCard />
    <ObservingIndicator />
    <ControlBar />
  </div>
</template>

<style scoped>
.stage { position: relative; width: 100%; height: 100%; }
.desktop { position: absolute; inset: 0; }
.character { position: absolute; right: 20px; bottom: 20px; pointer-events: none; }
</style>
