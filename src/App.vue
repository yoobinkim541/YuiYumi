<script setup lang="ts">
import VirtualDesktop from './desktop/VirtualDesktop.vue'
import ConfirmCard from './ui/ConfirmCard.vue'
import LoadingScreen from './ui/LoadingScreen.vue'
</script>

<template>
  <div class="stage">
    <!-- The virtual PC. Its [data-capture-root] is captured for the observer; assistant UI
         inside it (character window, tray menu, YuiYumi windows) is marked [data-no-capture].
         Language, sound, mode, VAD and observing controls live in the menu bar tray item;
         hold-to-talk lives in the character window's hover controls. -->
    <VirtualDesktop class="desktop" />
    <!-- Page overlay: not part of the capture. -->
    <ConfirmCard />
    <!-- Covers the page until the avatar has loaded. -->
    <LoadingScreen />
  </div>
</template>

<style scoped>
.stage { position: relative; width: 100%; height: 100%; }
.desktop { position: absolute; inset: 0; }
</style>
