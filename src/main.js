import './styles.css';
import { store, load, save } from './state.js';
import { tick } from './logic.js';
import { render, wire } from './ui.js';

store.s = load(Date.now());
wire();
render();

let lastTick = Date.now(), lastSave = 0;
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick)/1000;
  lastTick = now;
  tick(store.s, now, dt);
  if(now - lastSave > 5000){ save(store.s, now); lastSave = now; }
  render();
}, 250);

window.addEventListener('pagehide', () => save(store.s, Date.now()));
