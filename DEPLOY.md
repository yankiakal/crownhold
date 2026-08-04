# Deploying Crownhold as a mobile game

The game is already touch-first. The staged path to phones:

## Stage 1 — PWA on a real URL (do this now, free)

`npm run build` produces `dist/` containing a complete installable PWA:
`index.html` (the whole game, self-contained), `manifest.webmanifest`, `sw.js`
(offline caching), `icon.svg`. Any static host works.

**GitHub Pages (recommended — auto-deploys on every push):**
```sh
gh repo create crownhold --public --source=. --push
gh api repos/{owner}/crownhold/pages -X POST -f build_type=workflow
```
The included workflow (`.github/workflows/pages.yml`) builds and publishes on
every push to `main`. Your game lands at `https://<you>.github.io/crownhold/`.

**Netlify (fastest one-off):** run `npm run build`, then drag the `dist/`
folder onto https://app.netlify.com/drop.

**On the phone:** open the URL → browser menu → *Add to Home Screen*. It
installs with the castle icon, launches fullscreen portrait, and works offline.

## Stage 2 — App stores (when the game has earned it)

Wrap the same build with [Capacitor](https://capacitorjs.com): `npm i
@capacitor/core @capacitor/cli`, `npx cap init`, point `webDir` at `dist`, then
`npx cap add ios android`. That gives real store listings, push notifications
(raid alerts!), and in-app purchases for the cosmetic shop. No game code changes.

## Stage 3 — Multiplayer

The server (Node, importing `src/logic.js` + `src/world.js` for authoritative
state) replaces localStorage saves with accounts, and the Frontier's procedural
tiles start giving way to other players' holds. Hosting: any small VPS or
Fly.io/Railway instance covers thousands of players for this genre's tick rates.

## Reality checks

- The claude.ai artifact link can't be a PWA (sandboxed, no manifest) — it stays
  the dev preview. Stage 1 is what goes on phones.
- localStorage saves are per-browser: installing the PWA starts a fresh hold
  (fine before accounts exist; Stage 3 fixes it properly).
