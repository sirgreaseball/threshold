import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // pdf.js is imported lazily; pre-bundle it so the dev server does not reload the page mid-import.
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs'] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
});
