// Gear: the Lord's Regalia and a hero's wargear.
//
// Kingshot has both, and both are among its heaviest spend funnels — gear there
// is fed by random forging and paid refreshes. Here the rules are:
//
//   · Every piece is CRAFTED, at the Forge, from Steel and Runestone. Those are
//     already the scarcest things in the economy and cannot be bought.
//   · No random stats. A tier-6 blade is a tier-6 blade for everyone; there is
//     nothing to reroll, so there is nothing to sell rerolls of.
//   · Wargear raises a hero's EFFECTIVE LEVEL, exactly as stars do. One number
//     feeds passives, lead traits, class affinity and column capacity alike, so
//     gear needs no special case anywhere in the rules.
//
// It is a sink, not a ladder: 32 heroes × 4 slots is years of Steel, which is
// the point. Nothing here overtakes a hero you have actually been fielding.

import { RES_META } from './defs.js';

export const GEAR_MAX = 10;

/* Account-wide. One set, worn by you rather than by any captain. */
export const REGALIA = {
  crown:  {name:'Circlet of the Reach', icon:'👑', key:'valor',      per:0.02, fx:t=>'+'+(2*t)+'% Valor earned'},
  signet: {name:"Warden's Signet",      icon:'📜', key:'production', per:0.02, fx:t=>'+'+(2*t)+'% production'},
  mantle: {name:'Oathkeeper’s Mantle',  icon:'🧣', key:'casualties', per:0.015,fx:t=>'−'+(1.5*t)+'% casualties'},
  blade:  {name:'The Hallowmere Blade', icon:'🗡️', key:'troopPower', per:0.02, fx:t=>'+'+(2*t)+'% troop power'},
};

/* Per hero. Four pieces; what they add is effective level, so a well-equipped
   captain is simply a more experienced one. */
export const WARGEAR = {
  weapon: {name:'Weapon', icon:'⚔️'},
  armour: {name:'Armour', icon:'🛡️'},
  helm:   {name:'Helm',   icon:'🪖'},
  banner: {name:'Banner', icon:'🚩'},
};
/* Four full sets of ten is +10 effective levels — real, and a long way short of
   what fielding the hero for a year is worth. */
export const GEAR_PER_LEVEL = 4;

/* Cost of taking a piece from `tier` to `tier+1`. Runestone enters at tier 6,
   which is deep in the Runeworks era — early gear never blocks on it. */
export function gearCost(tier){
  const t = tier + 1;
  const c = {
    steel: Math.round(4 * Math.pow(t, 1.7)),
    iron:  Math.round(60 * Math.pow(t, 1.5)),
    wood:  Math.round(40 * Math.pow(t, 1.5)),
  };
  if(t >= 6) c.runestone = Math.round(2 * Math.pow(t - 4, 1.5));
  return c;
}
export function gearTime(tier){ return Math.round(90000 * Math.pow(tier + 1, 1.35)); }

export function regaliaTier(s, slot){ return (s.regalia && s.regalia[slot]) || 0; }
export function regaliaBonus(s, key){
  let b = 0;
  for(const [slot, d] of Object.entries(REGALIA))
    if(d.key === key) b += d.per * regaliaTier(s, slot);
  return b;
}
export function wargearTier(s, id, slot){
  const g = s.heroes[id] && s.heroes[id].gear;
  return (g && g[slot]) || 0;
}
export function wargearTotal(s, id){
  let n = 0;
  for(const slot of Object.keys(WARGEAR)) n += wargearTier(s, id, slot);
  return n;
}
/* The effective-level contribution of a hero's kit. */
export function gearLevels(s, id){ return Math.floor(wargearTotal(s, id) / GEAR_PER_LEVEL); }

export function costLabel(c){
  return Object.entries(c).map(([r,v]) => (RES_META[r] ? RES_META[r].icon : '') + ' ' + v).join('  ');
}
