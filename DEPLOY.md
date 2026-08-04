# Deploying Crownhold as a mobile game

The game is already touch-first. The staged path to phones:

## Stage 1 — PWA on a real URL (do this now, free)

`npm run build` produces `dist/` containing a complete installable PWA:
`index.html` (the whole game, self-contained), `manifest.webmanifest`, `sw.js`
(offline caching), `icon.svg`. Any static host works.

**GitHub Pages — LIVE at https://yankiakal.github.io/crownhold/**

Repo: https://github.com/yankiakal/crownhold (Pages serves the `gh-pages`
branch). To ship an update:
```sh
npm run deploy     # builds and force-pushes dist/ to gh-pages
```
(An Actions workflow that auto-deploys on every push exists but needs the gh
token's `workflow` scope: `gh auth refresh -s workflow`, then restore
`.github/workflows/pages.yml` from DEPLOY history if wanted. `npm run deploy`
makes it optional.)

**Netlify (alternative):** run `npm run build`, then drag the `dist/`
folder onto https://app.netlify.com/drop.

**On the phone:** open the URL → browser menu → *Add to Home Screen*. It
installs with the castle icon, launches fullscreen portrait, and works offline.

## Stage 2 — App stores (when the game has earned it)

Wrap the same build with [Capacitor](https://capacitorjs.com): `npm i
@capacitor/core @capacitor/cli`, `npx cap init`, point `webDir` at `dist`, then
`npx cap add ios android`. That gives real store listings, push notifications
(raid alerts!), and in-app purchases for the cosmetic shop. No game code changes.

## Stage 3 — Multiplayer (server built; hosting is the remaining step)

`server/server.js` is the authoritative server: accounts (scrypt-hashed
passwords, token sessions), per-hold state fast-forwarded on demand, a shared
leaderboard, and static hosting of `dist/`. It imports the same
`src/logic.js` / `src/world.js` / `src/actions.js` the browser runs, so client
and server can never disagree about the rules. Zero npm dependencies.

Run it locally:
```sh
npm run build && npm run server     # http://localhost:8787
```
Then in the game: **☁ Play online** → server `http://localhost:8787` → found a hold.

**Hosting it (any Node host; ~$0–5/month at prototype scale):**
```sh
# Fly.io
fly launch --now              # detects Node; set PORT via fly.toml if needed
# or Railway / Render: point at the repo, start command `npm run server`
```
Then either serve the client from that same host (it already serves `dist/`) or
keep the client on Pages and type the server URL into the account sheet — CORS
is open for exactly that.

**Before real players:** move `server/data/accounts.json` to Postgres or SQLite
(the shape is already row-per-account), put it behind HTTPS, and add a proper
session store. The current JSON file is fine for testing and small scale.

## Stage 4 — What multiplayer unlocks next

Alliances, an arena of async battles against other holds' snapshot armies, and
seasons — the Frontier's procedural tiles giving way to real neighbours.

## Reality checks

- The claude.ai artifact link can't be a PWA (sandboxed, no manifest) — it stays
  the dev preview. Stage 1 is what goes on phones.
- localStorage saves are per-browser: installing the PWA starts a fresh hold
  (fine before accounts exist; Stage 3 fixes it properly).
