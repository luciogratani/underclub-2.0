import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  assetsInclude: ['**/*.glb'],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: the 3D stack stays reachable only from the
        // lazy /ticket route, and survives deploys in the browser cache.
        manualChunks(id) {
          // Vite's dynamic-import preload helper is shared by the entry and
          // every lazy chunk; pin it next to React so the entry does not end
          // up statically importing (and preloading) vendor-three for it.
          if (id.includes('vite/preload-helper')) return 'vendor-react'
          if (!id.includes('node_modules')) return
          // React must own its chunk, otherwise Rollup folds it into
          // vendor-three (shared with @react-three/fiber) and "/" ends up
          // preloading the whole 3D stack just to boot.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
          if (id.includes('rapier')) return 'vendor-rapier'
          if (id.includes('@react-three') || id.includes('meshline') || /node_modules\/three\//.test(id)) {
            return 'vendor-three'
          }
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('react-router')) return 'vendor-router'
        },
      },
    },
  },
})
