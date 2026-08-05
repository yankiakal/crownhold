// The Arena: asynchronous hold-versus-hold battles.
//
// Design stance — this is the system where Kingshot hurts most, so the rules are
// deliberately different:
//   · Opponents are bracketed by power. You never see a hold you cannot fight.
//   · Winners take NO resources, buildings, or troops from the loser. Only
//     Laurels (rating), Valor and Mastery change hands. Nobody gets farmed.
//   · A defender loses no troops at all — they are fighting from a snapshot —
//     and only half the rating an attacker would, because they were not there.
//   · Losing costs the attacker some of the force they committed, and rating.
//     It never costs stores. Tilt is cheap; skill is what compounds.
//
// Skill lives in three reads: the stance triangle, your army composition against
// theirs, and how much of your army you dare commit (casualties here weaken the
// wall that has to hold the next raid).

import { TROOPS, HERO_POOL } from './defs.js';
import {
  armyBreakdown, tierPower, gainValor, gainMastery, pushLog, showBanner, fmt,
  arenaTeam, affinity, leadTotal, addDeeds,
} from './logic.js';
import { scoreDeed } from './events.js';
import { takeCasualties } from './logic.js';

export const ARENA_CD = 90000, START_LAURELS = 1000, ELO_K = 24;
// A hold fighting at home is dug in and ready; on top of that sits the wall it
// paid for. So an even fight is the attacker's to lose — they have to bring a
// read (stance, composition, siege) rather than just an equal army.
export const PREPARED = 1.12;
// wide enough that no matchup is decided before the dice, narrow enough that
// the reads still dominate over many fights
export const ROLL_LOW = 0.78, ROLL_SPAN = 0.44;

// pike stops cavalry, cavalry rides down archers, archers outrange pike
export const STANCE_BEATS = { charge:'volley', volley:'shieldwall', shieldwall:'charge' };
// what to bring against a hold built on each class
export const CLASS_ANSWER = { knight:'spearman', archer:'knight', spearman:'archer', ballista:'knight' };

export function stanceMult(attStance, defStance){
  if(attStance === 'balanced' || defStance === 'balanced') return 1;
  if(STANCE_BEATS[attStance] === defStance) return 1.15;
  if(STANCE_BEATS[defStance] === attStance) return 0.88;
  return 1;
}

/* power a hold puts on the field, by class — the shape of an army */
export function composition(s){
  const parts = {};
  let total = 0;
  for(const k of Object.keys(TROOPS)){
    const p = tierPower(s, k) * (s.t[k] || 0);
    parts[k] = p; total += p;
  }
  return { parts, total };
}
export function dominantClass(s){
  const { parts } = composition(s);
  let best = null, bestP = -1;
  for(const [k,p] of Object.entries(parts)) if(p > bestP){ bestP = p; best = k; }
  return bestP > 0 ? best : null;
}

/* bringing the answer to their dominant class, scaled by how much of it you field */
export function answerBonusForClass(attState, dom){
  const answer = dom ? CLASS_ANSWER[dom] : null;
  if(!answer) return 0;
  const { parts, total } = composition(attState);
  if(!total) return 0;
  return Math.min(0.15, 0.5 * (parts[answer] / total));
}
export function answerBonus(attState, defState){
  return answerBonusForClass(attState, dominantClass(defState));
}

/* A wall stops a surprise raid cold, but a besieger arrives prepared: in the
   arena it counts for half — and ballistas are what a wall really fears. */
export const WALL_IN_SIEGE = 0.5, SIEGE_MAX = 0.4;
export function wallFactor(attState, troops){
  const { total } = composition(attState);
  let siege = 0;
  if(total > 0 && troops.ballista) siege = (tierPower(attState,'ballista') * troops.ballista) / total;
  return Math.max(0.1, WALL_IN_SIEGE - SIEGE_MAX * Math.min(1, siege));
}
export function armyOnly(s){
  const bd = armyBreakdown(s);
  return bd.base * bd.mult;
}
/* what the ladder shows and brackets on: a prepared army plus the wall's siege value */
export function defensePower(s){
  const bd = defenceWithHeroes(s);
  return Math.round(bd.base * bd.mult * PREPARED + bd.wall * WALL_IN_SIEGE);
}

/* the force you send: a fraction of each class, power computed without your wall */
export function committedTroops(s, frac){
  const troops = {};
  for(const k of Object.keys(TROOPS)){
    const n = Math.floor((s.t[k] || 0) * frac);
    if(n > 0) troops[k] = n;
  }
  return troops;
}
/* Five heroes ride with a sortie. Their class affinity lifts the troops they
   know, exactly as it does on a march, so the same roster knowledge pays off in
   both places — and the line you bring is a real choice, not a stat check. */
export function forcePower(s, troops, team){
  const bd = armyBreakdown(s);
  const five = team || arenaTeam(s);
  let base = 0;
  for(const [k,n] of Object.entries(troops)) base += tierPower(s, k) * n * (1 + affinity(s, five, k));
  return { base, mult: bd.mult * (1 + leadTotal(s, five, 'power')) };
}
/* A defender's five answer from the walls whether or not anyone is watching. */
export function defenceWithHeroes(s){
  const bd = armyBreakdown(s);
  const five = arenaTeam(s);
  let base = 0;
  for(const k of Object.keys(TROOPS)) base += tierPower(s, k) * (s.t[k]||0) * (1 + affinity(s, five, k));
  return { base, mult: bd.mult * (1 + leadTotal(s, five, 'power')), wall: bd.wall };
}

export function elo(attL, defL, won){
  const expected = 1 / (1 + Math.pow(10, (defL - attL) / 400));
  return Math.round(ELO_K * ((won ? 1 : 0) - expected));
}

/* Resolve an attack. Mutates both states; returns a report object.
   `att` and `def` are full hold states; the defender is never asked to be online. */
export function resolveArena(att, def, opts, now, rand = Math.random){
  const frac = Math.min(1, Math.max(0.1, Number(opts.frac) || 1));
  const attStance = opts.stance || 'balanced';
  const defStance = def.defStance || 'shieldwall';

  const troops = committedTroops(att, frac);
  const sent = Object.values(troops).reduce((a,b) => a+b, 0);
  if(!sent) return { error: 'You have no troops to send.' };

  const attFive = arenaTeam(att), defFive = arenaTeam(def);
  const sm = stanceMult(attStance, defStance);
  const ab = answerBonus(att, def);
  const f = forcePower(att, troops, attFive);
  const attackPower = Math.round(f.base * f.mult * sm * (1 + ab) * (ROLL_LOW + rand()*ROLL_SPAN));
  const wf = wallFactor(att, troops);
  const defBd = defenceWithHeroes(def);
  const defPower = Math.round(defBd.base * defBd.mult * PREPARED + defBd.wall * wf);
  const won = attackPower >= defPower;

  // casualties: only the committed force, only the attacker
  const ratio = defPower / Math.max(attackPower, 1);
  const lossFrac = Math.min(won ? 0.06 : 0.14, (won ? 0.05 : 0.12) * ratio * ratio + 0.01);
  let fallen = 0, hurt = 0;
  for(const [k,n] of Object.entries(troops)){
    const l = Math.round(n * lossFrac * (0.7 + rand()*0.6));
    const r = takeCasualties(att, k, l);
    fallen += r.dead; hurt += r.hurt;
  }

  const attL = att.laurels ?? START_LAURELS, defL = def.laurels ?? START_LAURELS;
  const delta = elo(attL, defL, won);
  att.laurels = Math.max(0, attL + delta);
  def.laurels = Math.max(0, defL - Math.round(delta / 2));   // absent defenders risk less

  if(won) scoreDeed(att, 'arenaWin', 1, now);
  if(won){ att.arenaWins = (att.arenaWins||0)+1; def.arenaLosses = (def.arenaLosses||0)+1; gainValor(att, 15); gainMastery(att, 25, now); }
  else   { att.arenaLosses = (att.arenaLosses||0)+1; def.arenaWins = (def.arenaWins||0)+1; gainValor(att, 3); gainMastery(att, 8, now); }
  att.arenaReady = now + ARENA_CD;
  // both sides' fives earn from the fight — defending counts, even asleep
  addDeeds(att, attFive, won ? 'arenaWin' : 'arena', now);
  addDeeds(def, defFive, won ? 'arena' : 'arenaWin', now);
  for(const id of attFive) if(att.heroes[id]) att.heroes[id].xp += won ? 60 : 25;
  for(const id of defFive) if(def.heroes[id]) def.heroes[id].xp += won ? 25 : 60;

  const stanceNote = sm > 1 ? ' Your ' + attStance + ' broke their ' + defStance + '.'
                   : sm < 1 ? ' Their ' + defStance + ' answered your ' + attStance + '.' : '';
  const answerNote = ab >= 0.08 ? ' Your line was built to counter theirs (+' + Math.round(ab*100) + '%).' : '';
  const siegeNote = defBd.wall > 0 && wf < WALL_IN_SIEGE - 0.05
    ? ' Your ballistas broke down their wall.' : '';

  const report = {
    won, attackPower, defPower, sent, fallen, delta,
    laurels: att.laurels, opponent: def.name || 'a rival hold',
    stance: attStance, defStance, text:
      (won ? '🏆 Victory over ' + (def.name||'a rival hold') : '🛡 ' + (def.name||'A rival hold') + ' held')
      + ' — ' + fmt(attackPower) + ' vs ' + fmt(defPower) + '.' + stanceNote + answerNote + siegeNote
      + ' ' + (fallen || hurt ? fallen + ' of ' + sent + ' fell'
          + (hurt ? ', ' + hurt + ' carried back wounded' : '') + '. ' : 'No losses. ')
      + (delta >= 0 ? '+' : '') + delta + ' Laurels'
      + (won ? ', +15 Valor.' : '.') + ' No stores changed hands.',
  };
  att.arenaLast = report;
  pushLog(att, report.text, won ? 'win' : 'loss');
  showBanner(att, (won ? '🏆 Arena won — ' : '🛡 Arena lost — ') + (delta>=0?'+':'') + delta + ' Laurels', won?'win':'loss', now);

  // the defender learns of it when they next return
  pushLog(def, (won ? '🛡 ' + (att.name||'A rival') + ' broke your defence' : '🏆 Your defence held against ' + (att.name||'a rival'))
    + ' — ' + fmt(attackPower) + ' vs ' + fmt(defPower) + '. Laurels ' + (won?'-'+Math.round(delta/2):'+'+Math.abs(Math.round(delta/2)))
    + '. Nothing was taken.', won ? 'loss' : 'win');

  return report;
}

/* Matchmaking: only holds you can actually fight — power bracket first, rating
   second, widening until there are enough names to choose from. */
export function pickOpponents(meState, pool, limit = 5){
  const myPower = Math.max(defensePower(meState), 1);
  const myL = meState.laurels ?? START_LAURELS;
  for(const [powWin, lWin] of [[0.35, 250], [0.6, 500], [1.2, 1200], [99, 9999]]){
    const found = pool.filter(o => {
      const r = o.power / myPower;
      return r >= 1 - powWin && r <= 1 + powWin
        && Math.abs((o.laurels ?? START_LAURELS) - myL) <= lWin;
    });
    if(found.length >= Math.min(3, pool.length) || powWin === 99){
      return found
        .sort((a,b) => Math.abs((a.laurels??START_LAURELS)-myL) - Math.abs((b.laurels??START_LAURELS)-myL))
        .slice(0, limit);
    }
  }
  return [];
}
