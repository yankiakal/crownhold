// Every player action in one place, as pure state functions.
// The browser dispatches these for local play; the server dispatches the SAME
// table for authoritative online play. One list, no chance of the two forking.

import {
  startUpgrade, startTraining, finishBuildNow, finishTrainNow, startResearch, finishResearchNow, claimEvent, claimDaily, startHealing, finishHealNow,
  expedition, setCaravan, setStance, setDefStance, setCaptain, seatHero, useOrder, raiseShield,
  chooseOption, rerollChoice, promote, saveFormation, deleteFormation, setArenaTeam,
} from './logic.js';
import { startMarch } from './world.js';
import { TROOPS } from './defs.js';

/* Marches arrive as flat form fields (`t_spearman=120`) so the same params
   object survives a POST to the server unchanged. */
function troopsFrom(p){
  const t = {};
  for(const k of Object.keys(TROOPS)) t[k] = Number(p['t_'+k]) || 0;
  return t;
}
function partyFrom(p){
  return String(p.heroes || '').split(',').filter(Boolean).slice(0, 3);
}

export const GAME_ACTIONS = {
  upgrade:      (s,p,now)      => startUpgrade(s, p.key, now),
  train:        (s,p,now)      => startTraining(s, p.key, Number(p.n)||1, now),
  finishBuild:  (s,p,now)      => finishBuildNow(s, now, p.key),
  research:     (s,p,now)      => startResearch(s, p.key, now),
  finishResearch:(s,p,now)     => finishResearchNow(s, now),
  claimEvent:   (s,p,now)      => claimEvent(s, now),
  claimDaily:   (s,p,now)      => claimDaily(s, now),
  heal:         (s,p,now)      => startHealing(s, now),
  finishHeal:   (s,p,now)      => finishHealNow(s, now),
  finishTrain:  (s,p,now)      => finishTrainNow(s, now, p.key),
  expedition:   (s,p,now,rand) => expedition(s, p.key, now, rand),
  caravan:      (s,p,now)      => setCaravan(s, p.key, now),
  stance:       (s,p,now)      => setStance(s, p.key, now),
  defStance:    (s,p,now)      => setDefStance(s, p.key, now),
  captain:      (s,p,now)      => setCaptain(s, p.key, now),
  seat:         (s,p,now)      => seatHero(s, p.key, now),
  arenaTeam:    (s,p,now)      => setArenaTeam(s, p.key, now),
  order:        (s,p,now)      => useOrder(s, p.key, now),
  raiseShield:  (s,p,now)      => raiseShield(s, now),
  choose:       (s,p,now)      => chooseOption(s, Number(p.i), now),
  rerollChoice: (s,p,now,rand) => rerollChoice(s, now, rand),
  promote:      (s,p,now)      => promote(s, p.key, now),
  march:        (s,p,now)      => startMarch(s, Number(p.idx), troopsFrom(p), now, p.long === '1', partyFrom(p)),
  saveForm:     (s,p,now)      => saveFormation(s, p.key, partyFrom(p), troopsFrom(p), now),
  deleteForm:   (s,p,now)      => deleteFormation(s, p.key, now),
  intro:        (s)            => { s.seenIntro = true; return true; },
};

export function isGameAction(name){ return Object.hasOwn(GAME_ACTIONS, name); }

export function applyAction(s, name, params, now, rand=Math.random){
  if(!isGameAction(name)) return false;
  return !!GAME_ACTIONS[name](s, params || {}, now, rand);
}
