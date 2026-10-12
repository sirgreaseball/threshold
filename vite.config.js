import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // pdf.js is imported lazily; pre-bundle it so the dev server does not reload the page mid-import.
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs'] },
  // No licence banners in the bundles: the notices the licences ask for are in public/legal.txt.
  esbuild: { legalComments: 'none' },
  build: {
    // Files are named by content hash alone, with no preload helper, so the output
    // says little about how it was made.
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: 'a/[hash].js',
        chunkFileNames: 'a/[hash].js',
        assetFileNames: 'a/[hash][extname]',
      },
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard/index.html'),
      },
    },
  },
});
