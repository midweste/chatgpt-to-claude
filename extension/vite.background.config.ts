/**
 * Vite config for building the background service worker.
 *
 * Produces a single IIFE bundle at extension/dist/background.js
 * so that background.ts can use TypeScript while the manifest
 * references a plain .js file.
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'background.ts'),
      formats: ['iife'],
      name: 'background',
      fileName: () => 'background.js',
    },
    outDir: resolve(__dirname, 'dist/background'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        // No exports — service worker is side-effect-only
        exports: 'none',
      },
    },
  },
})
