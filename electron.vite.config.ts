import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@': resolve('src'),
  '@core': resolve('src/core')
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      outDir: 'out/main',
      rolldownOptions: {
        input: { index: resolve('electron/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      // Sandboxed preload scripts must be CommonJS.
      rolldownOptions: {
        input: { index: resolve('electron/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: 'src',
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'out/renderer',
      rolldownOptions: {
        input: { index: resolve('src/index.html') }
      }
    }
  }
})
