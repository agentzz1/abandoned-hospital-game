import { defineConfig } from 'vite'

// Relative base so the build works on any static host or subfolder (Vercel, itch.io, GitHub Pages).
export default defineConfig({
  base: './'
})
