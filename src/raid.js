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
//   1. NOBODY DIES. Every casualty on both sides is a wound. Wounds heal at the
//      Infirmary for resources and time — both earnable, neither sellable. Permanent
//      troop loss is what makes a player reach for a wallet.
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
         showBanner, gainValor, gainMastery } from './logic.js';
import { scoreDeed } from './events.js';

/* Travel is what makes a raid a decision rather than a button: the troops you send
   are not at your own wall while they are gone. */
export const RAID_TRAVEL_MS = 4 * 60 * 1000;
export const RAID_COOLDOWN_MS = 8 * 60 * 1000;
/* A beaten hold cannot be hit again for this long. Automatic, free, and not for
   sale — this window is the single most monetized object in the genre. */
export const RAID_GRACE_MS = 30 * 60 * 1000;
export const RAID_LOOT_FRAC = 0.16;          // of what the Warehouse leaves exposed
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
  const mine = Math.max(1, Math.round((col.base || 0) * (col.mult || 1)));
  const theirs = Math.max(1, d.total);
  const won = mine > theirs;
  const ratio = won ? theirs / mine : mine / theirs;

  /* Wounds on both sides, scaled by how close it was. A rout costs the loser little
     because there was no fight; a near thing costs everybody. */
  const attFrac = (won ? 0.14 : 0.30) * (0.5 + ratio);
  const defFrac = (won ? 0.30 : 0.14) * (0.5 + ratio);

  let attHurt = 0;
  const survivors = {};
  for(const k of Object.keys(TROOPS)){
    const n = col.troops[k] || 0;
    if(n <= 0) continue;
    const h = Math.min(n, Math.round(n * attFrac * (0.75 + rand() * 0.5)));
    survivors[k] = n - h;
    attHurt += h;
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
      + '. ' + attHurt + ' came back wounded.', 'win');
    pushLog(def, '🔥 ' + attName + ' broke through (' + mine + ' vs ' + theirs + ')'
      + (hauled ? ' and carried off part of your stores' : '')
      + '. Nobody died — ' + (defHurt + watchHurt) + ' wounded. A Writ of Peace is granted, and no one '
      + 'may strike you again for a while.', 'loss');
    showBanner(def, '🔥 ' + attName + ' raided your hold — you are under grace now', 'loss', now);
    gainValor(att, 6); gainMastery(att, 10, now);
    scoreDeed(att, 'camp', 1, now);
  }else{
    pushLog(att, '🛡️ ' + defName + ' held their wall against you (' + mine + ' vs ' + theirs
      + '). ' + attHurt + ' came home wounded, and nothing was taken.', 'loss');
    pushLog(def, '🛡️ You threw back ' + attName + ' (' + theirs + ' vs ' + mine + ')'
      + (watchHurt ? ', the Watch bleeding beside you' : '')
      + '. ' + (defHurt + watchHurt) + ' wounded, none lost.', 'win');
    showBanner(def, '🛡️ You held the wall against ' + attName, 'win', now);
    gainValor(def, 8); gainMastery(def, 12, now);
  }

  return { won, mine, theirs, loot, hauled, attHurt, defHurt, watchHurt, survivors,
           lifted: d.lifted, watchers: d.watchers };
}

/* Refined and carried goods are unlootable by construction — asserted in the suite so
   a future resource cannot quietly become raidable by being added to the wrong list. */
export function unlootable(){
  return Object.keys(RES_META).filter(r => !LOOTABLE.includes(r));
}
