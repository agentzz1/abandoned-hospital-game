import { defineConfig } from 'vite'

// Relative base so the build works on any static host or subfolder (Vercel, itch.io, GitHub Pages).
export default defineConfig({
  base: './',
  // A production build rewrites dist/index.html, which would otherwise reload the dev page.
  server: { watch: { ignored: ['**/dist/**'] } },
})
