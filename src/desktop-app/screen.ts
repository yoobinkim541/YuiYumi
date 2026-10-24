import { reactive } from 'vue'

/** The main display in the overlay page's CSS pixels; the overlay maps glances through it. */
export const screenRect = reactive({ left: 0, top: 0, width: screen.width, height: screen.height })
