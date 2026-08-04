# Crownhold

A Kingshot-style kingdom-defense strategy game — same loop, no pay-to-win.

- **[DESIGN.md](DESIGN.md)** — the design doc: Kingshot's loop deconstructed, every
  P2W system mapped to a play-to-earn replacement, the simulator-tuned balance model.
- **[MONETIZATION.md](MONETIZATION.md)** — cosmetic-only store spec, supporter pass,
  revenue scenarios.

## Project layout

```
game.html         Vite dev entry
index.html        built single-file release (artifact-ready; regenerate, don't edit)
src/defs.js       game data: buildings, troops, heroes, mastery, quests
src/logic.js      ALL game rules — pure functions, injectable time & rng
src/state.js      fresh state, localStorage persistence, save migration
src/ui.js         DOM rendering + input
src/main.js       boot + 250ms tick loop
sim/sim.js        balance bot driving the real logic.tick()
```

`src/logic.js` is the single source of truth for game rules. The browser, the
balance sim, and the future multiplayer server all import it — if you change a
number in `src/defs.js`, run the sim before trusting it.

## Workflow

```sh
npm install       # once
npm run dev       # live-reload dev server (opens game.html)
npm run sim       # balance check: bot plays 90-min and 4-h sessions, prints pacing
npm run build     # dist/game.html → strips wrapper → ./index.html (the release file)
```

## Game loop (prototype)

Build and upgrade your hold → train troops (they eat food — army size finds an
equilibrium against your farms) → repel escalating raids (a band that beats you
returns weaker; raids only escalate when you win) → unlock heroes at milestones →
spend **Valor** (earned only by playing, never sold) to finish timers instantly.
Timers run on a seconds scale so the loop is feelable in one sitting.
