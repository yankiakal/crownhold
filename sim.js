// Crownhold balance simulator — mirrors index.html's formulas exactly and plays
// a session as a competent active player. Run: node sim.js
// Flags reported: lost waves, build-queue starvation, storage-cap waste.

const BUILDINGS = {
  townhall:  {cost:{wood:120,stone:90}, time:20, max:10},
  farm:      {prod:'food', rate:2.0, cost:{wood:30},          time:8,  max:10},
  lumberyard:{prod:'wood', rate:1.6, cost:{food:30},          time:8,  max:10},
  quarry:    {prod:'stone',rate:1.0, cost:{wood:60,food:40},  time:12, max:10},
  ironmine:  {prod:'iron', rate:0.7, cost:{wood:80,stone:60}, time:15, max:10, th:3},
  barracks:  {cost:{wood:60,stone:30}, time:15, max:10},
  wall:      {cost:{stone:90,wood:40}, time:18, max:10, th:2},
  watchtower:{cost:{wood:120,stone:80,iron:20}, time:20, max:6, th:3},
};
const COST_MULT=1.55, TH_COST_MULT=1.7, TIME_MULT=1.42;
const TROOPS = {
  spearman:{power:3, upkeep:0.06, cost:{food:25,wood:10}, time:4,  barracks:1},
  archer:  {power:5, upkeep:0.10, cost:{food:20,wood:25}, time:6,  barracks:2},
  knight:  {power:11,upkeep:0.22, cost:{food:60,iron:20}, time:12, barracks:4},
  ballista:{power:24,upkeep:0.50, cost:{wood:80,iron:40}, time:20, barracks:6},
};
const MASTERY=[60,190,400,700,1100,1600,2200,2900,3700,4600];
const RES=['food','wood','stone','iron'];
const WAVE=75, FIRST_WAVE=120, PATROL=25;

function makeState(){ return {
  res:{food:120,wood:120,stone:60,iron:0}, valor:0,
  b:{townhall:1,farm:1,lumberyard:1,quarry:0,ironmine:0,barracks:0,wall:0,watchtower:0},
  t:{spearman:8,archer:0,knight:0,ballista:0},
  heroes:{marshal:0,steward:0,warden:0,quartermaster:0},
  bq:null, tq:null, wave:1, nextWave:FIRST_WAVE, wavesWon:0, warbandsWon:0,
  trained:0, mxp:0, shields:0, questIdx:0, patrolReady:0, famine:0, streak:0,
};}

const mLvl = s => MASTERY.filter(n=>s.mxp>=n).length;
const perk = (s,n) => mLvl(s)>=n;
const cap  = s => Math.round(800*Math.pow(s.b.townhall,1.35)*(perk(s,4)?1.15:1));
const heroOn = {
  marshal:s=>s.b.townhall>=2, steward:s=>s.b.townhall>=3,
  warden:s=>s.wavesWon>=7,    quartermaster:s=>mLvl(s)>=6,
};
function heroLvl(s,k){
  if(!heroOn[k](s)) return 0;
  let lvl=1, xp=s.heroes[k];
  while(lvl<10 && xp>=Math.round(50*Math.pow(lvl,1.4))){ xp-=Math.round(50*Math.pow(lvl,1.4)); lvl++; }
  return lvl;
}
function prod(s,r){
  let p=0;
  for(const [k,d] of Object.entries(BUILDINGS)) if(d.prod===r) p+=d.rate*s.b[k];
  return p*(1+0.06*heroLvl(s,'steward')+(perk(s,1)?0.06:0)+(perk(s,8)?0.08:0));
}
const upkeep = s => Object.entries(TROOPS).reduce((u,[k,d])=>u+d.upkeep*s.t[k],0);
const bCost = (s,k)=>Object.fromEntries(Object.entries(BUILDINGS[k].cost).map(([r,v])=>
  [r,Math.round(v*Math.pow(k==='townhall'?TH_COST_MULT:COST_MULT,s.b[k]))]));
const bTime = (s,k)=>Math.min(300, BUILDINGS[k].time*Math.pow(TIME_MULT,s.b[k])*(perk(s,5)?0.88:1));
const afford = (s,c)=>Object.entries(c).every(([r,v])=>s.res[r]>=v);
const pay = (s,c)=>{ for(const [r,v] of Object.entries(c)) s.res[r]-=v; };
const trainMult = s=>Math.max(0.3,(1-0.08*Math.max(0,s.b.barracks-1)-0.04*heroLvl(s,'warden'))*(perk(s,5)?0.88:1));
function armyPower(s){
  let p=0; for(const [k,d] of Object.entries(TROOPS)) p+=d.power*s.t[k];
  p*=(1+0.04*heroLvl(s,'marshal'))*(1+(perk(s,2)?0.06:0)+(perk(s,8)?0.08:0)+(perk(s,10)?0.15:0));
  return Math.round(p+18*s.b.wall);
}
const wavePower = w=>Math.round(10*Math.pow(w,1.3)+5*w);
// each consecutive loss bloodies the band too: 85% strength per loss, floor ~61%
const enemyAt = (s,w,rng)=>wavePower(w)*(w%5===0?1.6:1)*rng
  *(1-Math.min(0.3,0.05*s.b.watchtower))*Math.pow(0.85,Math.min(s.streak||0,3));
const gainRes=(s,r,v)=>{ s.res[r]=Math.min(s.res[r]+v,cap(s)); };
const gainM=(s,v)=>{ s.mxp+=v; };
const gainShield=(s,v)=>{ s.shields=Math.min(2+(perk(s,7)?1:0), s.shields+v); };

const QUESTS=[
  s=>s.b.farm>=2,        s=>s.b.lumberyard>=2,  s=>s.b.quarry>=1,     s=>s.b.townhall>=2,
  s=>s.b.barracks>=1,    s=>s.trained>=5,       s=>s.wavesWon>=1,     s=>s.b.wall>=1,
  s=>s.wavesWon>=3,      s=>s.b.townhall>=3,    s=>s.b.ironmine>=1,   s=>s.b.watchtower>=1,
  s=>s.t.knight>0||s.trained>=30, s=>s.warbandsWon>=1, s=>s.wavesWon>=8, s=>s.b.townhall>=4,
  s=>mLvl(s)>=3,         s=>s.b.townhall>=5,    s=>s.t.ballista>0,    s=>s.wavesWon>=15,
  s=>s.b.townhall>=7,    s=>mLvl(s)>=6,         s=>s.wavesWon>=25,    s=>s.b.townhall>=10,
];
const QREWARD=[
  {wood:60},{food:60},{wood:80},{valor:5},{food:80,valor:2},{valor:4},{stone:60,valor:3},
  {valor:4},{valor:6},{valor:8},{food:120},{valor:5},{valor:6},{valor:10,shield:1},{valor:10},
  {valor:20},{valor:8},{valor:12,shield:1},{valor:12},{valor:15,shield:1},{valor:25},
  {valor:15},{valor:25},{valor:50},
];

function simulate(minutes, rng, label){
  const s = makeState();
  const ev=[];  const T=minutes*60;
  let idleBuild=0, cappedTime=0, valorEarned=0, valorSpent=0, lostWaves=0, deserted=0;
  const mm=t=>String(Math.floor(t/60)).padStart(3,' ')+':'+String(t%60).padStart(2,'0');
  const note=(t,txt)=>ev.push(mm(t)+'  '+txt);

  for(let t=0;t<T;t++){
    for(const r of RES) gainRes(s,r,prod(s,r));
    // upkeep + famine desertion
    s.res.food -= upkeep(s);
    if(s.res.food < 0){
      s.res.food = 0; s.famine++;
      if(s.famine>=10){
        s.famine=0;
        for(const k of Object.keys(TROOPS)){ const l=Math.ceil(s.t[k]*0.02); if(s.t[k]>0){ s.t[k]-=l; deserted+=l; } }
      }
    } else s.famine=0;
    if(RES.some(r=>s.res[r]>=cap(s)-1)) cappedTime++;

    if(s.bq && t>=s.bq.end){
      s.b[s.bq.key]++; s.valor+=2; valorEarned+=2; gainM(s,6);
      if(s.bq.key==='townhall') note(t,'Town Hall → '+s.b.townhall);
      s.bq=null;
    }
    if(s.tq && t>=s.tq.end){ s.t[s.tq.key]+=s.tq.n; s.trained+=s.tq.n; gainM(s,s.tq.n); s.tq=null; }

    if(t>=s.patrolReady){
      s.patrolReady=t+PATROL-(perk(s,3)?8:0);
      const m=perk(s,9)?2:1, th=s.b.townhall;
      gainRes(s,'food',(12+6*th)*m); gainRes(s,'wood',(12+6*th)*m);
      gainRes(s,'stone',0.25*(10+4*th)*m);
      s.valor+=2; valorEarned+=2; gainM(s,3);
    }

    if(t>=s.nextWave){
      const w=s.wave, wb=w%5===0, enemy=enemyAt(s,w,rng), mine=armyPower(s);
      s.nextWave=t+WAVE;
      if(mine>=enemy){
        const ratio=enemy/Math.max(mine,1), lf=0.30*ratio*ratio;
        for(const k of Object.keys(TROOPS)) s.t[k]=Math.max(0,s.t[k]-Math.round(s.t[k]*lf));
        const lm=(wb?2:1)*(1+0.03*heroLvl(s,'quartermaster'));
        gainRes(s,'food',15*Math.pow(w,0.8)*lm); gainRes(s,'wood',15*Math.pow(w,0.8)*lm);
        gainRes(s,'stone',6*Math.pow(w,0.8)*lm); gainRes(s,'iron',3*Math.pow(w,0.8)*lm);
        const v=(5+Math.min(w,15))*(wb?2:1); s.valor+=v; valorEarned+=v;
        for(const k of Object.keys(s.heroes)) s.heroes[k]+=(12+3*w)*(wb?2:1);
        gainM(s,(8+2*w)*(wb?2:1));
        s.wavesWon++; s.wave++; s.streak=0;
        if(wb){ s.warbandsWon++; gainShield(s,1); note(t,'WARBAND '+w+' won ('+mine+' vs '+Math.round(enemy)+')'); }
      }else{
        lostWaves++; s.streak++;
        s.nextWave=t+WAVE*2;                       // longer breather after a loss
        for(const k of Object.keys(TROOPS)) s.t[k]=Math.floor(s.t[k]*0.8);
        for(const r of RES) s.res[r]=Math.floor(s.res[r]*0.85);
        s.valor+=2; valorEarned+=2; gainM(s,3); gainShield(s,1);
        note(t,(wb?'WARBAND':'raid')+' '+w+' LOST ('+mine+' vs '+Math.round(enemy)+') streak '+s.streak);
      }
    }

    while(s.questIdx<QUESTS.length && QUESTS[s.questIdx](s)){
      const r=QREWARD[s.questIdx];
      for(const [k,v] of Object.entries(r)){
        if(k==='valor'){ s.valor+=v; valorEarned+=v; }
        else if(k==='shield') gainShield(s,v);
        else gainRes(s,k,v);
      }
      gainM(s,12);
      s.questIdx++;
    }
    const ml=mLvl(s);
    if(ml>(s._ml||0)){ note(t,'Mastery → '+ml); s._ml=ml; }

    // ── bot decisions ──
    if(s.bq && s.bq.end-t>15){ const c=Math.max(1,Math.ceil((s.bq.end-t)/4)); if(s.valor>=c){ s.valor-=c; valorSpent+=c; s.bq.end=t; } }
    if(s.tq && s.tq.end-t>15){ const c=Math.max(1,Math.ceil((s.tq.end-t)/4)); if(s.valor>=c){ s.valor-=c; valorSpent+=c; s.tq.end=t; } }

    if(!s.bq){
      const eligible=k=>{
        const d=BUILDINGS[k], lvl=s.b[k];
        if(lvl>=d.max) return false;
        if(k!=='townhall' && lvl>=s.b.townhall) return false;
        if(d.th && s.b.townhall<d.th) return false;
        return afford(s,bCost(s,k));
      };
      let pick=null;
      if(eligible('townhall')) pick='townhall';
      else if(s.b.quarry===0 && eligible('quarry')) pick='quarry';
      else if(s.b.barracks===0 && eligible('barracks')) pick='barracks';
      else {
        const prodOf={food:'farm',wood:'lumberyard',stone:'quarry',iron:'ironmine'};
        const order=[...RES].sort((a,b)=>s.res[a]/cap(s)-s.res[b]/cap(s));
        for(const r of order){ const k=prodOf[r]; if(eligible(k)){ pick=k; break; } }
        if(!pick && s.b.wall<s.b.townhall && eligible('wall')) pick='wall';
        if(!pick && s.b.barracks<s.b.townhall && eligible('barracks')) pick='barracks';
        if(!pick && s.b.watchtower<3 && eligible('watchtower')) pick='watchtower';
      }
      if(pick){ pay(s,bCost(s,pick)); s.bq={key:pick,end:t+bTime(s,pick)}; }
      else idleBuild++;
    }

    // training: keep ahead of the next wave, but never beyond food sustainability
    if(!s.tq && s.b.barracks>0){
      const target=1.4*enemyAt(s,s.wave,1.12);
      const deficit=target-armyPower(s);
      const best=['ballista','knight','archer','spearman'].find(k=>s.b.barracks>=TROOPS[k].barracks);
      const dump=s.res.food>0.8*cap(s);
      if(deficit>0 || dump){
        const d=TROOPS[best];
        const headroom=prod(s,'food')*0.85 - upkeep(s);       // food/s available for new mouths
        const maxSustain=Math.max(0,Math.floor(headroom/d.upkeep));
        const maxAfford=Math.min(...Object.entries(d.cost).map(([r,v])=>Math.floor(s.res[r]/v)));
        const want=deficit>0?Math.ceil(deficit/d.power):5;
        const n=Math.max(0,Math.min(25,maxAfford,want,maxSustain));
        if(n>0){ const c={}; for(const [r,v] of Object.entries(d.cost)) c[r]=v*n; pay(s,c);
                 s.tq={key:best,n,end:t+d.time*n*trainMult(s)}; }
      }
    }
  }

  console.log('══ '+label+' ══');
  console.log(ev.join('\n'));
  console.log('-- end state: TH'+s.b.townhall+' wave '+s.wave+' won '+s.wavesWon+' lost '+lostWaves
    +' | army '+armyPower(s)+' (upkeep '+upkeep(s).toFixed(1)+'/s, food prod '+prod(s,'food').toFixed(1)+'/s) | mastery '+mLvl(s)+' | quests '+s.questIdx+'/24');
  console.log('-- buildings: '+Object.entries(s.b).map(([k,v])=>k+':'+v).join(' '));
  console.log('-- valor earned '+valorEarned+' spent '+valorSpent+' | deserted '+deserted
    +' | build-idle '+Math.round(100*idleBuild/T)+'% | at-cap '+Math.round(100*cappedTime/T)+'%');
  console.log('');
}

simulate(90, 1.0,  '90 min, average luck');
simulate(90, 1.12, '90 min, worst-case raid rolls');
simulate(240, 1.0, '4 hours, average luck');
