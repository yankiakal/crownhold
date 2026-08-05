// The Frontier: the world map around the hold. Tiles, marches, camp battles.
// Same contract as logic.js — pure state functions, injectable time and rng.
// tickWorld() is called from the main loop and the sim alongside logic.tick().

import { TROOPS, TIME_SCALE } from './defs.js';
import { scoreDeed } from './events.js';
import { takeCasualties } from './logic.js';
import {
  tierPower, heroBonus, spoilBonus, perk, wavePower,
  gainRes, gainValor, gainShield, gainMastery, pushLog, showBanner, fmt, ftime,
} from './logic.js';

export const MAP_W = 11, MAP_H = 7, CX = 5, CY = 3;
export const TRAVEL_MS_PER_TILE = 12000, GATHER_MS = 60000, RUIN_MS = 25000;
export const RESPAWN_MS = 240000;
/* The long haul: send a column out for hours and they work the node properly.
   This is the thing to set going before you close the game — the troops are
   away the whole time and cannot defend the wall, so it is a real wager. */
export const LONG_HAUL_WORK = GATHER_MS * 6 * TIME_SCALE, LONG_HAUL_YIELD = 9;

export const TILE_TYPES = {
  woods:    {icon:'🌲', name:'Deep Woods',  kind:'gather', res:'wood'},
  farmstead:{icon:'🌾', name:'Farmstead',   kind:'gather', res:'food'},
  quarry:   {icon:'⛰️', name:'Stone Cut',   kind:'gather', res:'stone'},
  ironvein: {icon:'⚒️', name:'Iron Vein',   kind:'gather', res:'iron'},
  camp:     {icon:'🏴', name:'Bandit Camp', kind:'camp'},
  ruin:     {icon:'🏛️', name:'Ancient Ruin',kind:'ruin'},
};

// deterministic PRNG so a save's map is stable
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function genWorld(seed){
  const rng = mulberry32(seed);
  const spots = [];
  for(let y=0; y<MAP_H; y++) for(let x=0; x<MAP_W; x++){
    if(Math.abs(x-CX)<=1 && Math.abs(y-CY)<=1) continue; // keep the hold's doorstep clear
    spots.push({x,y});
  }
  for(let i=spots.length-1; i>0; i--){ const j=Math.floor(rng()*(i+1)); [spots[i],spots[j]]=[spots[j],spots[i]]; }
  const kinds = ['woods','woods','woods','woods','farmstead','farmstead','farmstead',
                 'quarry','quarry','quarry','ironvein','ironvein',
                 'camp','camp','camp','camp','ruin','ruin'];
  const tiles = kinds.map((type,i)=>({
    x:spots[i].x, y:spots[i].y, type,
    lvl:1+Math.floor(rng()*3), respawnAt:0,
  }));
  return { seed, tiles };
}

export function tileDist(t){ return Math.max(Math.abs(t.x-CX), Math.abs(t.y-CY)); }
/* The Command Center is what lets you field more columns at once, and move them
   faster — march capacity is its whole job. */
export function marchSlots(s){
  return 1 + Math.floor((s.b.command || 0) / 6) + (s.b.townhall >= 10 ? 1 : 0);
}
export function marchSpeed(s){ return Math.max(0.5, 1 - 0.02 * (s.b.command || 0)); }
export function tileBusy(s, idx){ return (s.marches||[]).some(m => m.tile===idx); }

export function marchPower(s, troops){
  let p = 0;
  for(const k of Object.keys(TROOPS)) p += tierPower(s,k) * (troops[k]||0);
  return Math.round(p * (1 + heroBonus(s,'troopPower') + spoilBonus(s,'troopPower'))
    * (1 + (perk(s,2)?0.06:0) + (perk(s,8)?0.08:0) + (perk(s,10)?0.15:0)
         + (perk(s,12)?0.08:0) + (perk(s,20)?0.20:0)));
}
export function campPower(s, tile){
  return Math.round(wavePower(Math.max(3, s.wave-3)) * (0.45 + 0.3*tile.lvl));
}
export function gatherYield(s, tile){
  const th = s.b.townhall;
  const base = (35 + 18*tile.lvl) * th;
  const scale = {wood:1, food:1, stone:0.55, iron:0.3}[TILE_TYPES[tile.type].res];
  return Math.round(base * scale);
}

export function startMarch(s, idx, frac, now, longHaul){
  s.now = now;
  const tile = s.world.tiles[idx];
  if(!tile || tile.respawnAt || tileBusy(s, idx)) return false;
  if((s.marches||[]).length >= marchSlots(s)) return false;
  const kind = TILE_TYPES[tile.type].kind;
  const long = !!longHaul && kind === 'gather';   // only nodes can be worked for hours
  const troops = {};
  let total = 0;
  for(const k of Object.keys(TROOPS)){
    const n = Math.floor(s.t[k]*frac);
    if(n>0){ troops[k]=n; total+=n; }
  }
  if(total===0) return false;
  for(const [k,n] of Object.entries(troops)) s.t[k] -= n;
  const travel = tileDist(tile)*TRAVEL_MS_PER_TILE*marchSpeed(s);
  const work = kind==='gather' ? (long ? LONG_HAUL_WORK : GATHER_MS) : kind==='ruin' ? RUIN_MS : 0;
  s.marches.push({
    tile:idx, troops, long,
    arriveAt: now+travel, homeAt: now+travel+work+travel,
    resolved:false,
  });
  pushLog(s, '🚩 '+total+' troops march on the '+TILE_TYPES[tile.type].name
    + (long ? ' to work it through the night ('+ftime(travel+work+travel)+' round trip).'
            : ' ('+ftime(travel)+' out).'));
  return true;
}

function resolveArrival(s, m, now, rand){
  const tile = s.world.tiles[m.tile];
  const tt = TILE_TYPES[tile.type];
  m.resolved = true;
  if(tt.kind==='camp'){
    const enemy = campPower(s, tile) * (0.88 + rand()*0.24);
    const mine = marchPower(s, m.troops);
    if(mine >= enemy){
      const ratio = enemy/Math.max(mine,1);
      const lf = 0.25*ratio*ratio;
      // the fallen from a march are counted when the column gets home
      m.hurt = 0;
      for(const k of Object.keys(m.troops)){
        const l = Math.round(m.troops[k]*lf);
        m.troops[k] = Math.max(0, m.troops[k]-l);
        m.woundedBack = m.woundedBack || {};
        m.woundedBack[k] = (m.woundedBack[k]||0) + l;
      }
      const L = Math.round(enemy*1.1);
      m.loot = {food:Math.round(L*0.4), wood:Math.round(L*0.4), stone:Math.round(L*0.15), iron:Math.round(L*0.08)};
      m.valor = 10+5*tile.lvl; m.mxp = 20+10*tile.lvl;
      m.report = '⚔️ The camp is burned ('+mine+' vs '+Math.round(enemy)+')';
      s.campsBurned = (s.campsBurned||0) + 1;
      scoreDeed(s, 'camp', 1, now);
      tile.respawnAt = now + RESPAWN_MS;
    }else{
      m.woundedBack = {};
      for(const k of Object.keys(m.troops)){
        const l = m.troops[k] - Math.floor(m.troops[k]*0.65);
        m.troops[k] = Math.floor(m.troops[k]*0.65);
        m.woundedBack[k] = (m.woundedBack[k]||0) + l;
      }
      m.loot = null; m.valor = 2; m.mxp = 8;
      m.report = '🔥 The camp held ('+mine+' vs '+Math.round(enemy)+') — the survivors fall back';
      m.homeAt = now + tileDist(tile)*TRAVEL_MS_PER_TILE;
    }
  }else if(tt.kind==='gather'){
    const mult = m.long ? LONG_HAUL_YIELD : 1;
    m.loot = {[tt.res]: Math.round(gatherYield(s, tile) * mult)};
    m.valor = m.long ? 8 : 0; m.mxp = m.long ? 30 : 6;
    m.report = m.long ? '⛏ The '+tt.name+' is stripped to the bedrock' : '⛏ The '+tt.name+' is worked clean';
    scoreDeed(s, m.long ? 'longHaul' : 'gathered', 1, now);
    tile.respawnAt = now + RESPAWN_MS;
  }else{ // ruin
    m.loot = {food: 10*tile.lvl*s.b.townhall};
    m.valor = 12; m.mxp = 20+8*tile.lvl;
    m.writ = rand() < 0.20;
    m.report = '🏛️ The ruin gives up its secrets';
    s.ruinsRaided = (s.ruinsRaided||0) + 1;
    scoreDeed(s, 'ruin', 1, now);
    tile.respawnAt = now + RESPAWN_MS;
  }
}

function resolveReturn(s, m, now){
  let home = 0;
  for(const [k,n] of Object.entries(m.troops)){ s.t[k] += n; home += n; }
  // losses on the road are settled here, so the Infirmary can take its share
  let dead = 0, hurt = 0;
  for(const [k,n] of Object.entries(m.woundedBack || {})){
    s.t[k] = (s.t[k]||0) + n;                    // put them back, then count them properly
    const r = takeCasualties(s, k, n);
    dead += r.dead; hurt += r.hurt;
  }
  let txt = m.report+'. '+home+' return'+(dead||hurt ? ' ('+dead+' fell'+(hurt?', '+hurt+' wounded':'')+')' : '');
  if(m.loot){
    for(const [r,v] of Object.entries(m.loot)) gainRes(s, r, v);
    txt += ' with '+Object.entries(m.loot).map(([r,v])=>'+'+fmt(v)+' '+r).join(', ');
  }
  if(m.valor){ gainValor(s, m.valor); txt += ', +'+m.valor+' Valor'; }
  if(m.mxp) gainMastery(s, m.mxp, now);
  if(m.writ){ gainShield(s, 1); txt += ', and a sealed Writ of Peace'; }
  pushLog(s, txt+'.', m.loot ? 'win' : 'loss');
  showBanner(s, '🚩 March returned — '+m.report.toLowerCase(), m.loot?'win':'loss', now);
}

export function tickWorld(s, now, rand=Math.random){
  if(!s.world) return;
  for(const m of s.marches){
    if(!m.resolved && now >= m.arriveAt) resolveArrival(s, m, now, rand);
  }
  for(let i = s.marches.length-1; i >= 0; i--){
    if(s.marches[i].resolved && now >= s.marches[i].homeAt){
      resolveReturn(s, s.marches[i], now);
      s.marches.splice(i,1);
    }
  }
  // worked-out tiles regrow, sometimes richer
  for(const t of s.world.tiles){
    if(t.respawnAt && now >= t.respawnAt){
      t.respawnAt = 0;
      t.lvl = 1 + Math.floor(rand()*3);
    }
  }
}
