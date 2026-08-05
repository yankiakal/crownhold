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

## The renderer, rebuilt (v1.32)

Asked whether to build the sprite pipeline or make the procedural renderer
genuinely good, and the answer was the renderer — so it stopped being a
placeholder and became the thing. Sprites are still the bigger jump, but they cost
2–6MB of inlined base64 and the single-file property, and they cost art nobody has
drawn yet. This costs 13KB.

**The architectural change is the whole story.** The scene now splits in two:

| | what | when |
|---|---|---|
| **static** | ground, roads, trees, the wall, every building | re-rendered only when a level, the threat state, the skin or the canvas size changes |
| **dynamic** | smoke, flags, forge-light, tower sweeps, cranes, villagers, raiders, badges | every frame |

Before, all of it redrew at 60fps, and *that* was what capped the detail: 81
textured ground tiles and 22 materially-shaded buildings per frame is not
affordable, so everything had to stay cheap — and cheap looks like boxes. Cached,
the static layer redraws perhaps once a minute and can carry as much detail as it
likes. Measured over a run: **rebuilt once.** Everything below is spent out of
that budget.

- **One light, obeyed everywhere** (`LIT`), plus a rim highlight on the lit corner.
  A consistent light source is read by the eye long before any detail is.
- **Materials, not colours**: stone in staggered courses, timber in planks,
  plaster mottled, roofs in tile / slate / thatch / lead. Grain runs parallel to
  the face's real top edge, so it follows the geometry instead of lying flat
  across the screen. All seeded deterministically — `Math.random()` here would
  make the whole village shimmer every time the cache was invalidated.
- **Gabled roofs.** The first attempt hipped everything, and a screenshot showed
  why that fails: over a square footprint in a 2:1 projection, a hip roof lands
  as a squat pyramid wider than the building, so it swallows the walls and every
  structure reads as a coloured plate on a stump. A gable gives one broad plane
  plus a vertical triangle *in the wall material*.
- **Cast shadows** in one direction, all drawn before any structure so a shadow
  can never fall across a building behind it, plus contact occlusion at each base.
- **Lit windows**, more of them with level, and a door with a lintel.
- **Depth-sorted wall segments.** The wall used to be drawn in one pass before all
  buildings, so the near side sat *behind* everything — it read as a moat. Wall
  tiles now join the same depth sort.
- **Per-building detail**: paddock rails, pike racks, log stacks, ore winches,
  crates, banners, the Victualler's cauldron, arched library windows, and molten
  light spilling from the Crucible.
- **Woodland that retreats** as the hold fills in, and **nothing at all** drawn on
  a plot whose building the Town Hall cannot yet raise — the same rule the build
  menu follows, so the map shows progress instead of reporting it.

### Three bugs a test could not have caught

`npm run shoot` (`tools/scene.html` + headless Chrome) writes six states to
`shots/`. It exists because the stub-DOM suite proved the scene rendered without
throwing while:

1. **kitchen and crucible were invisible.** Shipped in v1.28 with no entry in
   `PLOTS` and none in `LOOK`, so `drawBuilding()` returned early — buildable,
   producing, and simply not drawn, for three versions. `verify-ui.mjs` now fails
   if any building lacks a plot, a look or a material, or if two share a tile.
2. **Trees were drawn under the buildings that hid them.** Painted with the ground,
   so every one behind a structure was invisible. They are depth-sorted now.
3. **Every future building site was a mud patch.** The worn-earth tint came from
   the static `PLOTS` table rather than from what was built, so a brand-new hold
   showed brown scars where buildings would one day go.

None of those throw. None print a warning. Two of them are *absences*, which is
this project's signature failure — and the only instrument that finds an absence
in a renderer is looking at it.

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
