// Turns Vite's full-document build into the artifact-ready fragment at ./index.html.
// The artifact host wraps published files in its own doctype/head/body skeleton,
// so the shipped file must carry content only (title/style/script/divs, no wrapper).
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

// full document → dist/index.html, the deployable PWA (GitHub Pages, Netlify, …)
copyFileSync('dist/game.html', 'dist/index.html');

let html = readFileSync('dist/game.html', 'utf8');
html = html
  .replace(/^<!DOCTYPE html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head[^>]*>/gi, '')
  .replace(/<\/?body[^>]*>/gi, '')
  .replace(/<meta[^>]*>/gi, '')
  .replace(/<link[^>]*(manifest|icon)[^>]*>/gi, '')
  .trim();

if (/(src|href)\s*=\s*["']https?:/i.test(html))
  throw new Error('release: built page references an external URL — artifact CSP would block it');

writeFileSync('index.html', html);
console.log('index.html written (' + html.length + ' bytes)');
