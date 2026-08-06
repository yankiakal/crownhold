// Turns Vite's full-document build into the artifact-ready fragment at ./index.html.
// The artifact host wraps published files in its own doctype/head/body skeleton,
// so the shipped file must carry content only (title/style/script/divs, no wrapper).
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { sha } from './build-stamp.js';

// full document → dist/index.html, the deployable PWA (GitHub Pages, Netlify, …)
copyFileSync('dist/game.html', 'dist/index.html');

/* Stamp the build into the service worker's cache name. The worker is network-first, so
   it is not what serves a stale page online — but its `activate` step drops every cache
   whose name is not the current one, so a per-build name means the offline copy can never
   outlive the build it came from. public/ is copied verbatim by Vite, which is why this is
   a rewrite here rather than a define in the config. */
{
  const name = 'crownhold-' + sha().replace(/[^a-zA-Z0-9]+/g, '');
  const swPath = 'dist/sw.js';
  const sw = readFileSync(swPath, 'utf8').replace(/const CACHE = '[^']*'/, "const CACHE = '" + name + "'");
  writeFileSync(swPath, sw);
  console.log('service worker cache: ' + name);
}

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

/* The release number has to have survived the build. Checked against what the file actually
   CONTAINS — the version as a string literal in the bundle — and not against the rendered
   markup: the footer is assembled by JavaScript at runtime, so `class="vtag">v1.52<` never
   appears in this file at all. A CI step that looked for exactly that failed the whole
   deploy, which is the second time today I have grepped a built page for something only the
   browser ever produces. */
if (!/class="vtag"/.test(html))
  throw new Error('release: the footer lost its version tag');
const ver = html.match(/"(v\d+\.\d+)"/);
if (!ver)
  throw new Error('release: no release number was baked in — build-stamp.js found no vX.YY commit subject');
console.log('release ' + ver[1]);

writeFileSync('index.html', html);
console.log('index.html written (' + html.length + ' bytes)');
