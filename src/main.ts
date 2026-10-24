import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { initAgent } from './agent'
import { initCharacter } from './character'
import { initDesktop } from './desktop'
import { initNunchi } from './nunchi'
import { initVoice } from './voice'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

// Each track wires itself to the bus (src/core/bus.ts). Order does not matter.
initDesktop()
initCharacter()
initNunchi()
initVoice()
initAgent()
