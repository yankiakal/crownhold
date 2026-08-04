# Making Crownhold look like Kingshot

## The thing worth knowing first

"Web-based" and "a 2D game like Kingshot" are not opposites. Kingshot's look —
an isometric base you tap on, animated characters, a scrollable world map — is a
*rendering* choice, not an engine one. A browser canvas draws exactly that, and
the same build ships to the App Store and Play Store through Capacitor as a real
installable app. Nobody can tell from the screen what technology drew it.

What actually separates Crownhold from Kingshot visually is **art**, not code:
Kingshot has hundreds of commissioned building sprites (each at several upgrade
tiers), animated units, particle effects, and illustrated hero portraits. That
is where the money and months go. Engine choice barely moves that needle.

## Where we are (v1.3)

`src/iso.js` renders the hold as an isometric 2.5D village on a canvas at 60fps:

- Every building is a real structure whose height, footprint and detail grow
  with its level (the Town Hall sprouts corner towers at 3 and 5; the Watchtower
  sweeps a lantern; the Farm's crop rows multiply).
- Villagers walk the roads, smoke rises from the Tavern, banners wave.
- Scaffolding and a swinging crane appear on whatever is under construction.
- Raiders gather on the south road in the 15 seconds before a wave lands.
- A green ↑ badge floats over any building you can afford to raise; tap any
  building to open its sheet.
- `▤ list` in the panel header flips back to the old table view.

The art is **procedural** — drawn from shapes at runtime. That is deliberate:
it keeps the whole game one self-contained file, it has no licensing questions,
and it is a placeholder layer with a clean seam. `drawBuilding()` is the only
function that needs replacing when real art arrives.

## The upgrade path, in order

**1. Real sprites, same engine (biggest visual jump per hour).**
Replace each `drawBuilding()` branch with an image blit. Sources, cheapest first:
- Free/cheap isometric asset packs: Kenney.nl (CC0), itch.io asset stores,
  CraftPix. Enough for a real-looking prototype for $0–60.
- AI-generated sprites (Midjourney/SDXL) cleaned up in Aseprite or Photoshop —
  fast, but check the licence terms for commercial use.
- A commissioned pixel/vector artist: roughly $30–120 per building with tiers.
  13 buildings × 3 visual tiers is the real shopping list, plus terrain, units
  and UI frames. Budget $2–6k for a coherent, distinctive set.
Add `assets/` as PNG sprite sheets; the artifact/PWA build inlines or serves them.

**2. A 2D engine, still web (when the scene gets busy).**
[PixiJS](https://pixijs.com) (WebGL sprite batching — best for thousands of
sprites) or [Phaser](https://phaser.io) (a full game framework: sprites,
tweens, particles, input, cameras). Either drops into the existing Vite build as
one dependency, and neither touches `logic.js`, `world.js`, `arena.js`, or the
server. Reach for this when hand-rolled canvas starts costing more than it saves
— animated troop columns, particle-heavy battles, a pinch-zoom world map.

**3. A native engine (only if the stores demand it).**
Unity or Godot gives the best animation tooling and the genre-standard polish.
The critical point: **our architecture already makes this cheap.** The server is
authoritative and speaks plain JSON, so a Unity client is a *renderer plus API
calls* — the rules never get rewritten, and there is never a second source of
truth to keep in sync. Doing this before the game is proven would mean rebuilding
the UI for a game whose design is still moving.

## Recommendation

Stay on the web. Do step 1 (real sprites) next, because it buys almost all of
the perceived quality; consider step 2 when the scene demands it; keep step 3 in
reserve for when store presence matters more than iteration speed.

The honest sequencing question is not "web or native" — it is "is the game fun
enough to deserve art yet?" Art is the expensive, hard-to-reverse commitment.
