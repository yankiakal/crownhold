// The sprite layer: real drawn art for buildings, when there is any.
//
// Deliberately built BEFORE any art exists, and shipped in that state. The whole
// design is that missing art is the normal case:
//
//   spriteFor() returns null → iso.js draws the building procedurally, exactly as
//   it does today. Per BUILDING, not per game — so one finished sprite improves one
//   building and nothing else changes.
//
// That matters for more than convenience. The repo-root index.html is the artifact
// fragment, served by a host that has no ./art/ directory at all, and the game must
// look right there too. A pipeline that needs its assets to work is a pipeline that
// breaks one of the two places this game ships.
//
// ── the format, and why it has no packer ──
// One PNG per building, tiers laid out left to right in a strip, plus a manifest:
//
//   art/manifest.json  { "townhall": { "cell": [96,160], "anchor": [48,132], "tiers": 4 }, … }
//   art/townhall.png   4 cells of 96×160 (at 2× on disk: 192×320)
//
// No atlas, no packing step, no dependency. An artist can export this directly from
// Blender or Aseprite, and a wrong cell size is visible the moment you look at it
// rather than hidden in a generated index.

/* Four tiers per building, not one per level. 23 buildings × 4 is 92 sprites;
   one per level would be 690, which is the difference between a finite job and a
   project nobody finishes. */
export const ART_TIERS = 4;

/* Which tier a level falls in. Total by construction: every level from 1 to max
   lands in exactly one tier, and level 0 (not built) has no art at all. */
export function artTier(lvl, max){
  if(!(lvl > 0)) return 0;
  const per = Math.max(1, max) / ART_TIERS;
  return Math.max(1, Math.min(ART_TIERS, Math.ceil(lvl / per)));
}
/* The level a tier should be DRAWN at when generating art: the TOP level of that
   tier's band, so a sprite shows the most developed version of what it represents.

   Derived by searching artTier rather than computing round(tier * max/4), because
   that formula does not round-trip. For a building with max 25 it returned level 13
   for tier 2, and artTier(13, 25) is tier 3 — so the emitter drew a frame the game
   would never ask for, and asked for a frame the emitter never drew. Seven of 22
   buildings were mis-tiered and it was invisible until sprite and procedural were
   compared pixel for pixel. Defining one of the pair in terms of the other makes
   the round trip true by construction instead of by arithmetic that has to agree. */
export function tierLevel(tier, max){
  const m = Math.max(1, max);
  let found = 0;
  for(let l = 1; l <= m; l++) if(artTier(l, m) === tier) found = l;
  return found || Math.max(1, Math.min(m, Math.round(tier * m / ART_TIERS)));
}

const art = { base: null, manifest: null, images: {}, loaded: false };

/* Is there a usable sprite for this building at this level? Returns the blit
   arguments, or null — and null is a perfectly ordinary answer. */
export function spriteFor(key, lvl, max){
  if(!art.loaded || !art.manifest) return null;
  const m = art.manifest[key], img = art.images[key];
  /* Validated here too, not just in the loader. Production was safe only by
     coincidence — a malformed entry is skipped when loading images, so the missing
     image happened to catch it. That is a coupling, not a guarantee: it puts the
     safety of a destructure in a different function. */
  if(!m || !img || !valid(m)) return null;
  const tier = artTier(lvl, max);
  if(!tier) return null;
  const [cw, ch] = m.cell, [ax, ay] = m.anchor;
  const frame = Math.min(tier, m.tiers) - 1;
  // the PNG may be authored at 2× or 3×; scale is read from the file, not assumed
  const s = m.scale || 1;
  return { img, sx: frame*cw*s, sy: 0, sw: cw*s, sh: ch*s, dw: cw, dh: ch, ax, ay };
}
export function artLoaded(){ return art.loaded; }
export function artCount(){ return art.manifest ? Object.keys(art.images).length : 0; }

/* Load whatever art is present. Never throws and never blocks: a missing manifest,
   a 404, a broken PNG and a host with no art directory all resolve to "no art",
   which the renderer already handles. `onReady` fires only if something loaded, so
   the caller can invalidate its cached layer. */
export function loadArt(base, onReady){
  if(typeof fetch !== 'function') return;
  art.base = base || './art/';
  fetch(art.base + 'manifest.json', { cache:'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(m => {
      if(!m || typeof m !== 'object') return;
      const keys = Object.keys(m).filter(k => valid(m[k]));
      if(!keys.length) return;
      art.manifest = m;
      return Promise.all(keys.map(k => oneImage(k, m[k])));
    })
    .then(() => {
      if(art.manifest && Object.keys(art.images).length){
        art.loaded = true;
        if(onReady) onReady(Object.keys(art.images).length);
      }
    })
    .catch(() => {});                     // no art is not an error
}

/* A manifest entry has to describe a real strip, or it is ignored rather than
   trusted — a bad cell size would otherwise blit garbage from the next frame. */
function valid(e){
  return !!(e && Array.isArray(e.cell) && e.cell.length === 2 &&
    Array.isArray(e.anchor) && e.anchor.length === 2 &&
    e.cell[0] > 0 && e.cell[1] > 0 && e.tiers >= 1 && e.tiers <= ART_TIERS);
}

function oneImage(key, entry){
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      // the strip must be at least as wide as the frames it claims to hold
      const s = entry.scale || 1;
      if(img.width >= entry.cell[0]*s*entry.tiers && img.height >= entry.cell[1]*s)
        art.images[key] = img;
      res();
    };
    img.onerror = () => res();
    img.src = art.base + (entry.src || (key + '.png'));
  });
}

/* Test seam: hand the layer a manifest and pre-made images directly, so the
   pipeline can be exercised without a network or a browser. */
export function _installArt(manifest, images){
  art.manifest = manifest; art.images = images || {};
  art.loaded = !!(manifest && Object.keys(art.images).length);
}
export function _resetArt(){ art.manifest = null; art.images = {}; art.loaded = false; }
