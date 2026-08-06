// Hold against hold. The attack side the Watch was built to defend against.
//
// This is the system Whiteout Survival monetizes hardest, so it is the one where the
// anti-P2W line has to be drawn in code rather than in a document. WoS does not sell
// power to attackers — it sells RELIEF TO VICTIMS: shields, teleports, instant
// healing, resource protection, all bought in a panic in the ten minutes after
// someone burned your city. Fear of loss is the product.
//
// Four rules remove the fear without removing the fight. Each is a line here:
//
//   1. A DEFENDER NEVER DIES; AN ATTACKER DOES. This asymmetry is the whole design, and
//      the first version of it was wrong: I made both sides wounds-only, which meant
//      attacking cost nothing you could not heal, so raiding was free and the right play
//      was to raid constantly.
//
//      The funnel in WoS is VICTIM desperation — troops destroyed while you slept, by an
//      attack you did not choose, and then a healing pack for sale. That is what has to
//      go. An attacker's losses are a risk they opted into, and aggression that costs no
//      blood is not a decision. So: a share of an attacker's casualties are dead for
//      good, and a FAILED assault buries far more of them than a successful one. Your
//      wall is survivable; your ambition is not.
//   2. ONLY THE FOUR BASE STORES CAN BE TAKEN, and only a share of what the Warehouse
//      leaves exposed. Steel, runestone, rations and Truegold — the scarce spine of the
//      economy — cannot be carted off at all.
//   3. A COLUMN CARRIES WHAT IT CAN CARRY. Loot is capped by the size of the column
//      that came for it, so no single raid empties a hold however strong the attacker.
//   4. LOSING BUYS PEACE, FREE. A beaten hold gets a Writ and a grace window
//      automatically. In WoS that window is the checkout page.
//
// Attacks are bracketed by defensive power using the SAME rule the arena already
// uses, so a maxed hold cannot farm a beginner. One bracket rule in this codebase,
// not two.

import { TROOPS, RES_META } from './defs.js';
import { armyBreakdown, takeWounds, pushLog, gainShield, watchCasualties,
         showBanner, gainValor, gainMastery, powerShares, matchupEdge, watchTroops } from './logic.js';
import { scoreDeed } from './events.js';

/* Travel is what makes a raid a decision rather than a button: the troops you send
   are not at your own wall while they are gone. */
export const RAID_TRAVEL_MS = 4 * 60 * 1000;
export const RAID_COOLDOWN_MS = 8 * 60 * 1000;
/* A beaten hold cannot be hit again for this long. Automatic, free, and not for
   sale — this window is the single most monetized object in the genre. */
export const RAID_GRACE_MS = 30 * 60 * 1000;
export const RAID_LOOT_FRAC = 0.16;          // of what the Warehouse leaves exposed
/* Both sides' casualties are CONTINUOUS in how outmatched the attacker was, and neither
   curve looks at who won. Switching on the outcome put a cliff at the boundary: winning
   51-to-49 cost the attacker 6% of the column permanently and losing 49-to-51 cost 24%,
   a fourfold jump across an infinitesimal difference in power. A coin-flip should not
   change the bill fourfold — it makes the result feel arbitrary rather than earned.

   `odds` below is theirs÷mine — how badly outgunned the column was — normalised at 1.6
   and clamped, so everything past "half again my strength" is equally hopeless. */
export const ODDS_FLOOR = 0.16, ODDS_SPAN = 0.26;    // attacker casualty rate
export const DEATH_FLOOR = 0.40, DEATH_SPAN = 0.22;  // and how many of those are final
export const DEF_FLOOR = 0.12, DEF_SPAN = 0.26;      // the defender's wounded rate
export function oddsOf(mine, theirs){ return Math.min(1, (theirs / Math.max(1, mine)) / 1.6); }
export const CARRY_PER_TROOP = 55;           // a column can only cart off so much
export const LOOTABLE = ['food', 'wood', 'stone', 'iron'];

/* Same bracket as the arena. Stated once, used by both. */
export function inBracket(mine, theirs){ return theirs <= mine * 2.2 && theirs >= mine * 0.3; }

export function raidShielded(s, now){
  return (s.shieldUntil || 0) > now || (s.graceUntil || 0) > now;
}
export function protectedShare(s){ return Math.min(0.6, 0.04 * (s.b.warehouse || 0)); }

/* What a hold is worth defending with. Deliberately armyBreakdown, which since v1.36
   counts the Watch and applies the best captain at the wall to everyone standing at
   it — so a garrison an ally posted is felt here, which is the entire point of having
   built it. */
export function defenceOf(s){ return armyBreakdown(s); }

/* Resolve an arrival. Pure over the two states, so it can be tested without a server.
   `col` is the column as it left home: troops, and the base/mult its owner's tiers and
   heroes produced at that moment — not recomputed here, because the attacker's heroes
   may have ridden out elsewhere since, and a column should not weaken in transit. */
export function resolveRaid(att, def, col, now, rand = Math.random){
  const d = defenceOf(def);
  /* The triangle. Before this, a raid compared two totals and never asked what either
     side was made of, so composition was irrelevant in PvP and a mono army had no
     predator anywhere in the game. */
  const wall = watchTroops(def);
  const theirTroops = { ...def.t };
  for(const [k, n] of Object.entries(wall)) theirTroops[k] = (theirTroops[k] || 0) + n;
  const edge = matchupEdge(powerShares(att, col.troops), powerShares(def, theirTroops));
  const mine = Math.max(1, Math.round((col.base || 0) * (col.mult || 1) * (1 + edge)));
  const theirs = Math.max(1, d.total);
  const won = mine > theirs;

  /* One axis: how outmatched the attacker was. Nothing here asks who won, so the bill
     changes smoothly through the boundary instead of stepping at it. A crushing win is
     cheap, a near thing is dear whichever way it fell, and charging a fortress is dearer
     still — but not seven times dearer, which is what the stepped version made it. */
  const odds = oddsOf(mine, theirs);
  const attFrac = ODDS_FLOOR + ODDS_SPAN * odds;
  const deathShare = DEATH_FLOOR + DEATH_SPAN * odds;
  // the defender's wounded rise with the weight of what hit them, on the same shape
  const defFrac = DEF_FLOOR + DEF_SPAN * Math.min(1, (mine / Math.max(1, theirs)) / 1.6);

  /* The attacker's casualties split. Dead are gone — no bed, no Infirmary, no healing —
     because a raid you chose has to cost something you cannot get back, or the correct
     play is to raid every cooldown forever. */
  let attHurt = 0, attDead = 0;
  const survivors = {};
  for(const k of Object.keys(TROOPS)){
    const n = col.troops[k] || 0;
    if(n <= 0) continue;
    const h = Math.min(n, Math.round(n * attFrac * (0.75 + rand() * 0.5)));
    const dead = Math.min(h, Math.round(h * deathShare));
    survivors[k] = n - h;
    attDead += dead;
    attHurt += h - dead;
  }

  let defHurt = 0;
  for(const k of Object.keys(TROOPS)){
    const n = def.t[k] || 0;
    if(n <= 0) continue;
    const h = Math.round(n * defFrac * (0.75 + rand() * 0.5));
    // takeWounds, not takeCasualties: the Infirmary's size must not decide whether a
    // defender's soldiers survive being attacked by another player
    const r = takeWounds(def, k, h);
    defHurt += r.hurt;
  }
  // the Watch bleeds beside the wall it came to hold
  const watchHurt = watchCasualties(def, defFrac * 0.8, rand);

  /* Loot. Only the four base stores, only the share the Warehouse leaves exposed, and
     never more than the column can carry. */
  const loot = {};
  let hauled = 0;
  if(won){
    const exposed = 1 - protectedShare(def);
    let carry = Object.values(survivors).reduce((a, b) => a + b, 0) * CARRY_PER_TROOP;
    for(const r of LOOTABLE){
      if(carry <= 0) break;
      const take = Math.min(Math.floor((def.res[r] || 0) * RAID_LOOT_FRAC * exposed), carry);
      if(take <= 0) continue;
      def.res[r] -= take;
      loot[r] = take;
      carry -= take;
      hauled += take;
    }
  }

  /* Losing buys peace, free. The grace window and the Writ are both automatic — in
     Whiteout Survival this moment is a purchase prompt. */
  if(won){
    def.graceUntil = now + RAID_GRACE_MS;
    gainShield(def, 1);
  }

  const attName = att.name || 'A rival hold';
  const defName = def.name || 'a rival hold';
  if(won){
    pushLog(att, '⚔️ Your column broke ' + defName + ' (' + mine + ' vs ' + theirs + ')'
      + (hauled ? ' and hauled off ' + Object.entries(loot).map(([r, v]) => v + ' ' + r).join(', ') : '')
      + '. ' + attDead + ' fell and ' + attHurt + ' came back wounded.', 'win');
    pushLog(def, '🔥 ' + attName + ' broke through (' + mine + ' vs ' + theirs + ')'
      + (hauled ? ' and carried off part of your stores' : '')
      + '. Nobody died — ' + (defHurt + watchHurt) + ' wounded. A Writ of Peace is granted, and no one '
      + 'may strike you again for a while.', 'loss');
    showBanner(def, '🔥 ' + attName + ' raided your hold — you are under grace now', 'loss', now);
    gainValor(att, 6); gainMastery(att, 10, now);
    scoreDeed(att, 'camp', 1, now);
  }else{
    pushLog(att, '🛡️ ' + defName + ' held their wall against you (' + mine + ' vs ' + theirs
      + '). A broken assault is dear: ' + attDead + ' fell, ' + attHurt
      + ' came home wounded, and nothing was taken.', 'loss');
    pushLog(def, '🛡️ You threw back ' + attName + ' (' + theirs + ' vs ' + mine + ')'
      + (watchHurt ? ', the Watch bleeding beside you' : '')
      + '. ' + (defHurt + watchHurt) + ' wounded, none lost.', 'win');
    showBanner(def, '🛡️ You held the wall against ' + attName, 'win', now);
    gainValor(def, 8); gainMastery(def, 12, now);
  }

  return { won, mine, theirs, loot, hauled, attHurt, attDead, defHurt, watchHurt, survivors,
           edge, lifted: d.lifted, watchers: d.watchers };
}

/* Refined and carried goods are unlootable by construction — asserted in the suite so
   a future resource cannot quietly become raidable by being added to the wrong list. */
export function unlootable(){
  return Object.keys(RES_META).filter(r => !LOOTABLE.includes(r));
}
