import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function copyDir(src: string, dest: string) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * After Vite writes HTML files to dist/src/popup/popup.html etc.,
 * move them to dist/popup.html and dist/options.html and fix asset paths.
 */
function fixHtmlPlugin() {
  return {
    name: 'fix-html-paths',
    closeBundle() {
      // Copy public/ assets into dist/
      copyDir('public', 'dist');

      const moves: Array<[string, string]> = [
        ['dist/src/popup/popup.html', 'dist/popup.html'],
        ['dist/src/options/options.html', 'dist/options.html'],
      ];

      for (const [src, dest] of moves) {
        if (existsSync(src)) {
          // Fix relative asset paths: ../../assets/ → assets/
          let content = readFileSync(src, 'utf-8');
          content = content.replace(/\.\.\/\.\.\/assets\//g, 'assets/');
          writeFileSync(dest, content, 'utf-8');
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), fixHtmlPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        content: resolve(__dirname, 'src/content/content.ts'),
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'content') return 'content.js';
          if (chunk.name === 'serviceWorker') return 'serviceWorker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
