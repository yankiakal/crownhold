// First Light — the game teaching itself, one rule at a time.
//
// The 36 quests already onboard the ECONOMY well: build the Farm, train five troops, repel a
// raid. What nothing teaches is combat, and combat is where every rule we care most about
// lives — cover, the counter triangle, load, supply, the pace gate. A player can reach Town
// Hall 10 without ever learning that a battlemage with no line in front of it is worth half,
// which makes the deepest system in the game invisible.
//
// Four decisions about the shape:
//
//   1. TRIGGERED, NOT SEQUENCED. Each lesson fires the moment its subject becomes true about
//      your hold — the supply lesson when supply starts to bite, the cover lesson when you
//      first own a line that needs covering. A fixed tutorial sequence teaches things before
//      they matter and is therefore forgotten by the time they do.
//   2. `when` READS STATE THE GAME ALREADY KEEPS, exactly as the Muster Roll's tasks and the
//      achievements do. No new counters, nothing to thread through resolveWave, no way for a
//      lesson to silently fail to fire because someone forgot to increment something.
//   3. ONE AT A TIME, and only ever after the intro. Two cards at once is a wall of text at
//      the worst possible moment, and the first four are marked `hold` because a player who
//      dismisses "armies eat" without reading it will starve.
//   4. NOTHING IS BLOCKED. Whiteout Survival's tutorial seizes the screen and will not let go
//      until you tap the glowing thing, because a longer funnel sells more. We have nothing
//      to sell, so a lesson is a card you close — the `hold` ones simply sit in the middle of
//      the screen rather than the corner.
//
// Every lesson is re-readable in the Codex afterwards, and the whole thing can be switched
// off in Settings. Order in this array is the tiebreak when two become true at once, so the
// more fundamental rule is listed first.

import { TROOPS, SUPPLY_RES } from './defs.js';

export const LESSONS = [
  {
    id: 'upkeep', hold: true, icon: '🌾', title: 'An army eats',
    when: s => sum(s.t) >= 8,
    body: 'Every soldier draws food every second, for as long as you keep them. Your Farms set '
        + 'the ceiling on how large a muster you can hold — and an unfed army deserts, so the '
        + 'muster you can afford matters more than the one you can afford to train.',
  },
  {
    id: 'pace', hold: true, icon: '🏛️', title: 'The hold climbs together',
    /* Needs townhallReq, which lives in logic.js — and logic.js imports this file, so
       reaching back for it would make the cycle. The caller passes it in instead. */
    when: (s, ctx) => (s.b.townhall || 0) >= 2 && ctx.thBlocked === true,
    body: 'The Town Hall will not rise past the rest of your hold. Each level names two '
        + 'buildings that must have kept pace, plus a count of any others — so a keep with a '
        + 'village of huts behind it is not a thing you can build. The road panel lists exactly '
        + 'what to raise, cheapest first, with the two named ones marked required.',
  },
  {
    id: 'cover', hold: true, icon: '🛡️', title: 'Some troops need a line in front',
    when: s => (s.t.archer || 0) + (s.t.ballista || 0) >= 10,
    body: 'Archers and battlemages fight at a fraction of their worth with nobody standing in '
        + 'front of them — a battlemage in the open is worth 50% of one behind a line. '
        + 'Spearmen hold that line, which is why the cheapest unit in the game is what makes '
        + 'the dearest one work. The march builder shows your cover before you commit.',
  },
  {
    id: 'load', hold: true, icon: '⚖️', title: 'A column carries weight, not bodies',
    when: s => (s.marches || []).length > 0 || (s.b.command || 0) >= 1,
    body: 'A battlemage takes four soldiers\' worth of a column and a spearman takes one, so '
        + 'capacity is weight rather than headcount. That is deliberate: it means no single '
        + 'troop type is simply better per slot, and composition becomes a real question '
        + 'instead of arithmetic with one answer.',
  },
  {
    id: 'triangle', icon: '⚔️', title: 'Pikes, horses, arrows',
    when: s => (s.wavesWon || 0) >= 2 && countTypes(s) >= 2,
    body: 'Spearmen stop cavalry, cavalry runs down archers, archers shoot the slow line. '
        + 'Bringing the counter to what you are facing is worth up to 30% — and the frontier '
        + 'shows you what garrisons each camp holds before you march, so this is knowledge you '
        + 'can act on rather than a dice roll.',
  },
  {
    id: 'supply', icon: '🏹', title: 'Arrows, shafts and shoes',
    when: s => (s.b.townhall || 0) >= 4 && sum(s.t) >= 20,
    body: 'Past a certain size a muster draws timber and iron as well as food — archers run on '
        + 'wood, cavalry on iron. Run dry and those troops fight weaker until the mines catch '
        + 'up; nobody dies of it. It is what keeps the Lumberyard and the Iron Mine worth '
        + 'raising all game, and why your army shape and your economy shape have to agree.',
  },
  {
    id: 'valor', icon: '✦', title: 'Valor is the only currency that matters',
    when: s => (s.valor || 0) >= 20,
    body: 'Valor finishes any timer instantly, and it cannot be bought — not now, not later, '
        + 'not by anyone. It comes from repelling raids, finishing quests and holding the '
        + 'frontier. Everything Kingshot sells for money, this game pays out for playing well.',
  },
  {
    id: 'tiers', icon: '🎓', title: 'The same soldier, forged better',
    when: s => (s.b.academy || 0) >= 1,
    body: 'The Drillfield opens a troop tier every third level and drills your whole muster '
        + 'harder at every level. Reforging a line lifts every soldier in it and every recruit '
        + 'after — it costs per head and takes the forges time, so it is a commitment rather '
        + 'than a button.',
  },
  {
    id: 'wall', icon: '🧱', title: 'A wall that has been hit needs stone',
    when: s => (s.wallWear || 0) > 0.02,
    body: 'Every assault knocks part of your wall loose, and the masons draw stone to mend it. '
        + 'A wall never falls below half and nothing is ever destroyed — but a hold with a big '
        + 'wall and a small Quarry fights on rubble. This is what the Quarry is for.',
  },
  {
    id: 'writ', icon: '📜', title: 'Losing buys peace, free',
    when: s => (s.shields || 0) >= 1,
    body: 'Lose a raid and you are handed a Writ of Peace and a grace window, automatically. '
        + 'In the games this one is modelled on, that moment is a purchase prompt — fear of '
        + 'loss is the product. Here a beaten hold cannot be farmed, and it costs nothing.',
  },
  {
    id: 'spoils', icon: '🏆', title: 'Warbands pay in spoils',
    when: s => (s.warbandsWon || 0) >= 1,
    body: 'Every fifth raid is a Warband, and beating one offers three permanent upgrades to '
        + 'pick from. They stack, so a long campaign compounds — and like heroes, they are '
        + 'drafted rather than gambled for. No banners, no pity timers.',
  },
  {
    id: 'decree', icon: '📯', title: 'A decree is a trade',
    when: s => (s.valor || 0) >= 45,
    body: 'A standing order changes how your hold runs for a while, paid in Valor. Every one '
        + 'gives something and takes something on a different axis — faster marches for a '
        + 'lighter haul, cheaper upkeep for slower drilling. There is no strictly best decree, '
        + 'only the one that suits what you are doing this hour.',
  },
];

function sum(o){ let n = 0; for(const k in o) n += o[k] || 0; return n; }
function countTypes(s){ return Object.keys(TROOPS).filter(k => (s.t[k] || 0) > 0).length; }

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map(l => [l.id, l]));

/* The next thing worth teaching, or null. Pure: it decides, the caller records. */
export function nextLesson(s, ctx = {}){
  if(!s.seenIntro) return null;              // one wall of text at a time
  if(s.lesson) return null;                  // a card is already up
  for(const l of LESSONS){
    if((s.taught || {})[l.id]) continue;
    let due = false;
    try { due = !!l.when(s, ctx); } catch { due = false; }
    if(due) return l;
  }
  return null;
}
