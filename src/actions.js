// Every player action in one place, as pure state functions.
// The browser dispatches these for local play; the server dispatches the SAME
// table for authoritative online play. One list, no chance of the two forking.

import {
  startUpgrade, startTraining, finishBuildNow, finishTrainNow, startResearch, finishResearchNow, claimEvent, claimDaily, startHealing, finishHealNow,
  expedition, setCaravan, setStance, setDefStance, setCaptain, seatHero, useOrder, raiseShield,
  chooseOption, rerollChoice, promote,
} from './logic.js';
import { startMarch } from './world.js';

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
  order:        (s,p,now)      => useOrder(s, p.key, now),
  raiseShield:  (s,p,now)      => raiseShield(s, now),
  choose:       (s,p,now)      => chooseOption(s, Number(p.i), now),
  rerollChoice: (s,p,now,rand) => rerollChoice(s, now, rand),
  promote:      (s,p,now)      => promote(s, p.key, now),
  march:        (s,p,now)      => startMarch(s, Number(p.idx), Number(p.frac), now, p.long === '1', p.hero || null),
  intro:        (s)            => { s.seenIntro = true; return true; },
};

export function isGameAction(name){ return Object.hasOwn(GAME_ACTIONS, name); }

export function applyAction(s, name, params, now, rand=Math.random){
  if(!isGameAction(name)) return false;
  return !!GAME_ACTIONS[name](s, params || {}, now, rand);
}
