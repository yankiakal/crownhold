import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
/* Injected here rather than written into a source file, so nothing generated lands in
   src/ and a fresh clone stays importable with no build step. */
import { stamp, version } from './scripts/build-stamp.js';

export default defineConfig({
  base: './', // relative asset paths — works at any subpath (e.g. GitHub Pages)
  plugins: [viteSingleFile()],
  /* __API_HOST__ is compiled in, because a packaged app has no useful origin to infer from: under
     Capacitor the page is served from https://localhost by the native shell, so location.origin
     points at the app itself. Set it when building for the stores:
         API_HOST=https://api.example.com npm run build
     Left empty (the browser build) net.js keeps its existing behaviour. */
  define: {
    __BUILD__: JSON.stringify(stamp()),
    __VERSION__: JSON.stringify(version()),
    __API_HOST__: JSON.stringify(process.env.API_HOST || ''),
    /* Paid items are OFF unless the store products exist. Apple and Google both require digital
       goods to go through their own purchase flow, so a build with priced cosmetics and no IAP
       plugin is a rejection waiting to happen — and a Buy button that leads nowhere is broken
       functionality besides. Turn on with PURCHASES=1 once the products are configured. */
    __PURCHASES__: JSON.stringify(process.env.PURCHASES === '1'),
  },
  build: { rollupOptions: { input: 'game.html' } },
});
