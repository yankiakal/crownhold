# Crownhold

A Kingshot-style kingdom-defense strategy game — same loop, no pay-to-win.

- **[DESIGN.md](DESIGN.md)** — the design doc: Kingshot's loop deconstructed, every
  P2W system mapped to a play-to-earn replacement, the simulator-tuned balance model.
- **[MONETIZATION.md](MONETIZATION.md)** — cosmetic-only store spec, supporter pass,
  revenue scenarios.

## Project layout

```
game.html          Vite dev entry
index.html         built single-file release (artifact-ready; regenerate, don't edit)
src/defs.js        game data: buildings, troops, heroes, mastery, quests
src/logic.js       ALL game rules — pure functions, injectable time & rng
src/world.js       the Frontier: map tiles, marches, camp battles
src/actions.js     every player action, one table (client + server dispatch it)
src/state.js       fresh state, offline progress, persistence, save migration
src/net.js         client sync layer (offline unless a server is configured)
src/ui.js          DOM rendering + input
src/main.js        boot + 250ms tick loop
server/server.js   authoritative server: accounts, state, leaderboard
sim/sim.js         balance bot driving the real logic.tick()
```

`src/logic.js`, `src/world.js` and `src/actions.js` are the single source of
truth for the rules. The browser, the balance sim, and the server all import
them — the game cannot disagree with itself. If you change a number in
`src/defs.js`, run the sim before trusting it.

## Workflow

```sh
npm install       # once
npm run dev       # live-reload dev server (opens game.html)
npm run sim       # balance check: bot plays 90-min and 4-h sessions, prints pacing
npm run build     # dist/ (deployable PWA) + ./index.html (artifact release)
npm run server    # authoritative server on :8787, also serves dist/
npm run deploy    # build + publish dist/ to GitHub Pages
```

Live: **https://yankiakal.github.io/crownhold/** — see [DEPLOY.md](DEPLOY.md).

## Online play

The game is offline-first: with no server it plays exactly as before, saving to
localStorage. Run `npm run server`, click **☁ Play online**, enter
`http://localhost:8787` and found a hold — from then on the server owns the
state (actions round-trip, progress is fast-forwarded server-side on demand,
and holds appear on a shared leaderboard).

## Game loop (prototype)

Build and upgrade your hold → train troops (they eat food — army size finds an
equilibrium against your farms) → repel escalating raids (a band that beats you
returns weaker; raids only escalate when you win) → unlock heroes at milestones →
spend **Valor** (earned only by playing, never sold) to finish timers instantly.
Timers run on a seconds scale so the loop is feelable in one sitting.
