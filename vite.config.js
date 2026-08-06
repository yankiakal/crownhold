import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
/* Injected here rather than written into a source file, so nothing generated lands in
   src/ and a fresh clone stays importable with no build step. */
import { stamp, version } from './scripts/build-stamp.js';

export default defineConfig({
  base: './', // relative asset paths — works at any subpath (e.g. GitHub Pages)
  plugins: [viteSingleFile()],
  define: { __BUILD__: JSON.stringify(stamp()), __VERSION__: JSON.stringify(version()) },
  build: { rollupOptions: { input: 'game.html' } },
});
