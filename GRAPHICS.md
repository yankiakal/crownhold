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

## The sprite pipeline (v1.33) — built before the art, and deliberately not shipped with any

`src/sprites.js` + `tools/emit-sprites.html` + `npm run sprites`.

**The format has no packer.** One PNG per building, tiers left to right in a strip,
plus a manifest of cell size and anchor:

```
art/manifest.json   { "forge": { "cell":[62,75], "anchor":[31,49], "tiers":4, "scale":2 }, … }
art/forge.png       4 cells, authored at 2×
```

An artist exports that directly from Blender or Aseprite. A wrong cell size is
visible the moment you look at it, rather than buried in a generated atlas index.

**Missing art is the normal path.** `spriteFor()` returns null and iso.js draws the
building procedurally — per BUILDING, so one finished sprite improves one building
and changes nothing else. This is also a correctness requirement, not a nicety: the
repo-root `index.html` is the artifact fragment, served by a host with no `art/`
directory at all, so a pipeline that needs its assets is a pipeline that breaks one
of the two places this game ships.

**Four tiers, not thirty levels.** 23 × 4 = 92 sprites; one per level is 690, which
is the difference between a finite job and a project nobody finishes.

### The placeholder art, and why it does NOT ship

`npm run sprites` renders every building at every tier *with the procedural
renderer* and writes the strips the game then loads. That let the whole pipeline be
built and measured before any art existed. Measured, at 2× against the procedural
draw at matched level and position:

| | result |
|---|---|
| per building, sprite vs procedural | **20 of 22 pixel-exact**; 2 differ by 1–2 px (the crop's alpha threshold) |
| whole scene, every building at a tier top | **0.012%** of pixels differ (132 of 1,059,520) |
| whole scene, buildings mid-band | 3.4% differ — *tier quantisation, by design* |

That last row is the finding that decided it. With four tiers a level-12 building
displays its band's art, which was drawn at level 15. Procedurally it is drawn as
exactly level 12. **So shipping the placeholder art would make the game slightly
wrong for no visual gain whatsoever** — identical pixels at tier tops, and the wrong
level's building everywhere else.

So `public/art/` is gitignored and the deployed game runs procedurally, exactly as
before. The pipeline is what shipped. `npm run sprites` regenerates the placeholders
any time the path needs exercising.

This is also the honest cost of sprites for real art, and it is inherent rather than
a flaw in this implementation: buildings will change appearance in four steps instead
of thirty. Kingshot works the same way.

### What the pixel comparison caught

**The tier↔level round trip was broken for 7 of 22 buildings.** `tierLevel(tier)`
computed `round(tier × max/4)`; for a building with max 25 that gave level 13, and
`artTier(13, 25)` is tier **3**. The emitter drew frames the game would never ask
for, and the game asked for frames that were never drawn. Real art would have
inherited it exactly. `tierLevel` is now derived by searching `artTier`, so the round
trip is true by construction rather than by two formulas agreeing, and a test asserts
it for all 23 buildings.

**`spriteFor` destructured a manifest entry it had not validated**, relying on the
loader to have filtered bad ones. Production was safe only by coincidence — an
invalid entry gets no image loaded, so the missing image caught it. That put the
safety of a destructure in a different function; it validates directly now.

**And it caught three wrong explanations of mine**, which is the part worth
remembering. I attributed the scene difference to resampling (wrong — it got worse at
2×), then to position-phased texture grain (wrong — measured 0.00% across six
buildings drawn at two positions), then narrowed with an offset search that I had
clipped to ±3 device pixels, so it reported "no offset helps" when the real answer
was a wrong frame. Each explanation was specific and plausible. The one that was
right came from a measurement designed to distinguish them, not from thinking harder.

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
