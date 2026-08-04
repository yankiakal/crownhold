import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './', // relative asset paths — works at any subpath (e.g. GitHub Pages)
  plugins: [viteSingleFile()],
  build: { rollupOptions: { input: 'game.html' } },
});
