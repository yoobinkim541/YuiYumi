import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig(env => mergeConfig(viteConfig(env), {
  test: {
    exclude: ['templates/**', '**/node_modules/**', 'dist/**', 'crates/**', 'src-tauri/**'],
  },
}))
