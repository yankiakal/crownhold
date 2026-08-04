// Crownhold state: fresh-state shape, persistence, save migration.

import { RES_META, FIRST_WAVE_MS } from './defs.js';
import { prodPerSec, upkeepPerSec, storageCap, pushLog, fmt } from './logic.js';

export const SAVE_KEY = 'crownhold-save-v1';

// single mutable slot so every module sees the same state object (reset swaps it)
export const store = { s: null };

export function freshState(now){
  return {
    res:{food:120,wood:120,stone:60,iron:0},
    valor:0,
    b:{townhall:1,farm:1,lumberyard:1,quarry:0,ironmine:0,barracks:0,wall:0,watchtower:0},
    t:{spearman:8,archer:0,knight:0,ballista:0},
    heroes:{}, spoils:{},
    choice:null, choiceQueue:[], offersDone:0,
    stance:'balanced', captain:null, orderCd:{}, mods:null,
    waveType:'rabble', upkeepPauseUntil:0, trainFastNext:false, expedBoost:false,
    bq:null, tq:null,
    wave:1, nextWave:now+FIRST_WAVE_MS, wavesWon:0, wavesLost:0,
    trained:0, trainedBy:{},
    mxp:0, shields:0, shieldUntil:0, warbandsWon:0, streak:0, famineAcc:0,
    questIdx:0,
    patrolReady:0,
    log:[], banner:null,
    seenIntro:false,
    now, lastSeen:now,
  };
}

export function load(now){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return freshState(now);
    const s = JSON.parse(raw);
    s.now = now;
    // migration: backfill fields that older saves lack
    if(s.mxp==null) s.mxp = 0;
    if(s.shields==null) s.shields = 0;
    if(s.shieldUntil==null) s.shieldUntil = 0;
    if(s.warbandsWon==null) s.warbandsWon = 0;
    if(s.streak==null) s.streak = 0;
    if(s.wavesLost==null) s.wavesLost = 0;
    if(s.famineAcc==null) s.famineAcc = 0;
    if(s.t.ballista==null) s.t.ballista = 0;
    // v0.5: heroes moved from fixed {on,lvl,xp} slots to a drafted roster
    if(s.heroes && Object.values(s.heroes).some(h => h && typeof h.on === 'boolean')){
      const owned = {};
      for(const [k,h] of Object.entries(s.heroes)) if(h.on) owned[k] = {lvl:h.lvl||1, xp:h.xp||0};
      s.heroes = owned;
    }
    if(s.heroes==null) s.heroes = {};
    if(s.spoils==null) s.spoils = {};
    if(s.choiceQueue==null) s.choiceQueue = [];
    if(s.choice===undefined) s.choice = null;
    if(s.offersDone==null) s.offersDone = Object.keys(s.heroes).length;
    // v0.7 command layer
    if(s.stance==null) s.stance = 'balanced';
    if(s.captain===undefined) s.captain = null;
    if(s.orderCd==null) s.orderCd = {};
    if(s.mods===undefined) s.mods = null;
    if(s.waveType==null) s.waveType = 'rabble';
    if(s.upkeepPauseUntil==null) s.upkeepPauseUntil = 0;
    if(s.trainFastNext==null) s.trainFastNext = false;
    if(s.expedBoost==null) s.expedBoost = false;
    // offline production (capped at 2 hours), net of army upkeep
    const away = Math.min(Math.max(now - (s.lastSeen||now), 0), 7200000);
    if(away > 60000){
      const gained = [];
      for(const r of Object.keys(RES_META)){
        let g = prodPerSec(s, r) * away/1000;
        if(r==='food') g -= upkeepPerSec(s) * away/1000;   // the muster ate while you were gone
        if(g >= 1){ s.res[r] = Math.min(s.res[r]+g, storageCap(s)); gained.push('+'+fmt(g)+' '+RES_META[r].lbl.toLowerCase()); }
        else if(g < 0) s.res[r] = Math.max(0, s.res[r]+g); // drain, but no desertion offline
      }
      if(gained.length) pushLog(s, 'While you were away, the hold produced '+gained.join(', ')+' (after feeding the muster).', 'gold');
    }
    if(s.nextWave < now) s.nextWave = now + 60000;
    if(s.banner) s.banner = null;
    return s;
  }catch(e){ return freshState(now); }
}

export function save(s, now){
  s.lastSeen = now;
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){}
}
