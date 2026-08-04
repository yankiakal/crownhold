import './styles.css';
import { store, load, save } from './state.js';
import { tick } from './logic.js';
import { tickWorld } from './world.js';
import { render, wire } from './ui.js';

// PWA: register the service worker on real hosting (no-op inside the artifact sandbox)
if('serviceWorker' in navigator && !location.hostname.endsWith('claude.ai')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

store.s = load(Date.now());
wire();
render();

let lastTick = Date.now(), lastSave = 0;
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick)/1000;
  lastTick = now;
  tick(store.s, now, dt);
  tickWorld(store.s, now);
  if(now - lastSave > 5000){ save(store.s, now); lastSave = now; }
  render();
}, 250);

window.addEventListener('pagehide', () => save(store.s, Date.now()));
