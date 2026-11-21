import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Relative base so the build works on any static host or subfolder (Vercel, itch.io, GitHub Pages)
// and inside the iOS app, which serves the files from capacitor://localhost/.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // The iOS app runs on iOS 15 and later (Capacitor 8's floor); WebGL 2 and top-level await need it too.
    // Pinning the target keeps future syntax from silently requiring a newer Safari.
    target: ['es2022', 'safari15', 'ios15'],
  },
  // A production build rewrites dist/index.html, which would otherwise reload the dev page.
  server: { watch: { ignored: ['**/dist/**'] } },
})
