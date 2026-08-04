import './styles.css';
import { store, load, save } from './state.js';
import { tick } from './logic.js';
import { tickWorld } from './world.js';
import { render, renderAccount, wire } from './ui.js';
import * as net from './net.js';

// PWA: register the service worker on real hosting (no-op inside the artifact sandbox)
if('serviceWorker' in navigator && !location.hostname.endsWith('claude.ai')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

store.s = load(Date.now());
wire();
render();

// if a session is stored, the server's hold replaces the local one
net.resume().then(s => {
  if(s){
    store.s = s; render();
    net.refreshLeaderboard().then(render);
    net.refreshArena().then(render);
  }
}).catch(()=>{});

let lastTick = Date.now(), lastSave = 0, lastPull = 0, lastBoard = 0;
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick)/1000;
  lastTick = now;

  // tick locally either way: offline this IS the game, online it keeps the
  // display moving between syncs (the server's state always wins on arrival)
  tick(store.s, now, dt);
  tickWorld(store.s, now);

  if(net.isOnline()){
    if(now - lastPull > 10000){
      lastPull = now;
      net.pullState().then(s => { store.s = s; }).catch(()=>{});
    }
    if(now - lastBoard > 30000){
      lastBoard = now;
      net.refreshLeaderboard();
      net.refreshArena();
    }
  }else if(now - lastSave > 5000){
    save(store.s, now); lastSave = now;
  }

  render();
}, 250);

window.addEventListener('pagehide', () => { if(!net.isOnline()) save(store.s, Date.now()); });
