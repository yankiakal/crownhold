import './styles.css';
import { store, load, save } from './state.js';
import { tick } from './logic.js';
import { tickWorld } from './world.js';
import { render, renderAccount, renderChat, wire } from './ui.js';
import { forget as forgetSound } from './audio.js';
import * as net from './net.js';

/* PWA: register the service worker on real hosting (no-op inside the artifact sandbox).
   The reload matters as much as the register. A new worker calls skipWaiting and claims the open
   pages, but claiming does not re-render them — so the tab keeps running the JS it already loaded
   and the player stays on the old build until they happen to close every tab. Reported from a real
   browser as "refreshing opens the old version". One reload, guarded so it can only ever happen
   once per page, is the whole fix. */
if('serviceWorker' in navigator && !location.hostname.endsWith('claude.ai')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(reloaded) return;                 // a loop here would be far worse than a stale page
    reloaded = true;
    location.reload();
  });
}

store.s = load(Date.now());
wire();
render();

// if a session is stored, the server's hold replaces the local one
net.resume().then(s => {
  if(s){
    // the server's hold is a different hold: reset the sound baseline before drawing it,
    // or every difference between it and the local save rings a bell
    forgetSound();
    store.s = s; render();
    net.refreshLeaderboard().then(render);
    net.refreshArena().then(render);
    net.refreshAlliance().then(render);
    net.refreshMuster().then(render);
    net.refreshWatch().then(render);
    net.refreshRaid().then(render);
    net.refreshRealm().then(render);
    net.refreshChat().then(() => renderChat());
  }
}).catch(()=>{});

let lastTick = Date.now(), lastSave = 0, lastPull = 0, lastBoard = 0, lastChat = 0;
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
      net.refreshAlliance();
      net.refreshMuster();
      net.refreshWatch();
      net.refreshRaid();
      net.refreshRealm();
    }
    if(now - lastChat > 5000){ lastChat = now; net.refreshChat().then(() => renderChat()); }
  }else if(now - lastSave > 5000){
    save(store.s, now); lastSave = now;
  }

  render();
  renderChat();
}, 250);

window.addEventListener('pagehide', () => { if(!net.isOnline()) save(store.s, Date.now()); });
