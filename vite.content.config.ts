import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Separate build config for the content script.
 *
 * Chrome does NOT support ES module imports in content scripts
 * (only service workers can use "type": "module").
 * We must output an IIFE so that all dependencies are inlined into
 * a single self-contained content.js with no `import` statements.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // keep the main build output intact
    rollupOptions: {
      input: resolve(__dirname, 'src/content/content.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
      },
    },
  },
});
