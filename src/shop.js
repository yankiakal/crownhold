// The store — cosmetic only, and structurally incapable of being otherwise.
//
// The guardrail from MONETIZATION.md, restated as code: nothing in this file
// carries a `bonus`, a `mods`, or a number that any rule reads. There is no field
// here for a stat, so a stat cannot be added by accident later — a reviewer would
// have to invent one and wire it, which is a conversation rather than a typo.
//
// Everything is visible to other players. That is the actual product: status
// without stats. One store, real prices, no gem layer to obscure them.
//
// Some items are EARNABLE. That matters for two reasons: the Supporter Pass
// promise in the spec ("every gameplay-relevant item is also earnable free"), and
// because a cosmetic system with no free path is a dead system for the ~95% who
// never buy anything.

export const COS_KINDS = {
  hold:  { name:'Hold skin',  blurb:'Repaints your whole hold. Everyone who scouts you sees it.' },
  sigil: { name:'Sigil',      blurb:'Flies beside your name, in chat and on every ladder.' },
  title: { name:'Title',      blurb:'Sits under your name wherever your hold is listed.' },
};

/* A hold skin is a palette the isometric renderer tints roofs through. It changes
   nothing but colour — no size, no plot, no light that any rule reads. */
export const HOLD_SKINS = {
  default:  { name:'The Reach',    price:0,    tint:null,
              blurb:'Ordinary timber and slate. What everyone starts with.' },
  frost:    { name:'Frosthold',    price:4.99, tint:{ h:200, s:0.22, l:0.06 },
              blurb:'Pale slate and hard frost — the Iron Winter, kept.' },
  ember:    { name:'Ember Keep',   price:4.99, tint:{ h:18,  s:0.30, l:0.04 },
              blurb:'Ash-dark timber lit from underneath.' },
  ivy:      { name:'Ivy Court',    price:4.99, tint:{ h:110, s:0.20, l:0.03 },
              blurb:'Green over old stone. Nobody has pruned it in a century.' },
  salt:     { name:'Saltmere',     price:0,    earn:'sail',
              blurb:'Bleached timber and verdigris. Earned by charting the Isle.' },
  hallow:   { name:'Hallowmere',   price:0,    earn:'mastery20',
              blurb:'The old capital\'s colours. Earned, not sold.' },
};

export const SIGILS = {
  none:     { name:'No sigil',       price:0,    icon:'' },
  pike:     { name:'Crossed Pikes',  price:1.99, icon:'⚔️' },
  wreath:   { name:'Oak Wreath',     price:1.99, icon:'🌿' },
  hart:     { name:'The White Hart', price:1.99, icon:'🦌' },
  anchor:   { name:'Salt Anchor',    price:1.99, icon:'⚓' },
  horn:     { name:'The First Horn',  price:0,    earn:'waves200', icon:'📯' },
  crown:    { name:'Broken Crown',   price:0,    earn:'mastery25', icon:'👑' },
};

export const TITLES = {
  none:     { name:'—',                 price:0    },
  warden:   { name:'Warden of the Line', price:0.99 },
  factor:   { name:'Salt Factor',        price:0.99 },
  marshal:  { name:'Lord Marshal',       price:0.99 },
  unpaid:   { name:'Debt-Collector',     price:0.99 },
  beastward:{ name:'Beast-Ward',         price:0,   earn:'beasts50' },
  charted:  { name:'Chartwright',        price:0,   earn:'charted60' },
};

export const CATALOGUE = { hold: HOLD_SKINS, sigil: SIGILS, title: TITLES };

/* The Supporter Pass and Steward's Pact are listed for honesty about what they
   would cost and what they would do. Neither grants anything a rule reads —
   the Pact automates GIVING alliance help, which speeds other people up. */
export const SUBSCRIPTIONS = [
  { id:'pass', name:'Supporter Pass', price:4.99, per:'8-week season',
    lines:['The season\'s hold skin, sigil set and flair',
           'More saved formations, longer chronicle history',
           'Everything gameplay-relevant on it is also earnable free'] },
  { id:'pact', name:'The Steward\'s Pact', price:4.99, per:'30 days',
    lines:['Standing orders: your hold helps every ally automatically, even offline',
           'It costs you nothing and speeds THEM up — never you',
           'Asking for help is free and automatic for everyone, so there is nothing to sell there',
           'Supporter banner and chat flair — visible, which is the actual product'] },
];

/* Free unlocks. Each is a plain predicate over the hold, so what earns a cosmetic
   is legible in one line and testable. */
export const EARN = {
  sail:      { need:'Chart 40% of the Salt Isle',  test:(s, ch) => ch >= 40 },
  charted60: { need:'Chart 60% of the Salt Isle',  test:(s, ch) => ch >= 60 },
  mastery20: { need:'Reach Mastery 20',            test:(s, ch, ml) => ml >= 20 },
  mastery25: { need:'Reach Mastery 25',            test:(s, ch, ml) => ml >= 25 },
  waves200:  { need:'Repel 200 raids',             test:s => (s.wavesWon || 0) >= 200 },
  beasts50:  { need:'Take 50 beasts',              test:s => (s.beastsSlain || 0) >= 50 },
};

export function itemsOf(kind){ return Object.entries(CATALOGUE[kind] || {}); }
export function itemDef(kind, id){ return (CATALOGUE[kind] || {})[id] || null; }
/* Owned means bought OR earned. Earned is recomputed live rather than granted, so
   it can never drift out of step with the hold that earned it. */
export function isEarned(def, s, charted, masteryLvl){
  if(!def || !def.earn) return false;
  const e = EARN[def.earn];
  return !!(e && e.test(s, charted, masteryLvl));
}
export function isOwned(s, kind, id, charted, masteryLvl){
  const def = itemDef(kind, id);
  if(!def) return false;
  if(!def.price && !def.earn) return true;                 // the default of its kind
  if(((s.cos && s.cos.owned) || {})[kind + ':' + id]) return true;
  return isEarned(def, s, charted, masteryLvl);
}
