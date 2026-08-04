// Puts a handful of rival holds on the server so the Arena has someone to fight
// before real players exist. Safe to re-run: it only adds names that are missing.
//   node server/seed-rivals.js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { freshState } from '../src/state.js';
import { defensePower } from '../src/arena.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'data', 'accounts.json');

const RIVALS = [
  { name:'Thornwatch', t:{spearman:9},                              wall:0, stance:'shieldwall', laurels:960 },
  { name:'Grayfen',    t:{spearman:6, archer:3},                    wall:0, stance:'volley',     laurels:1000 },
  { name:'Duskvale',   t:{spearman:12, archer:5},                   wall:1, stance:'charge',     laurels:1040 },
  { name:'Ironmere',   t:{spearman:8, archer:6, knight:12},         wall:2, stance:'shieldwall', laurels:1120 },
  { name:'Stagholt',   t:{spearman:40, archer:20, knight:10, ballista:3}, wall:4, stance:'volley', laurels:1250 },
];

let db = { users: {} };
if(existsSync(FILE)){ try{ db = JSON.parse(readFileSync(FILE,'utf8')); }catch(e){} }

const now = Date.now();
for(const r of RIVALS){
  const key = r.name.toLowerCase();
  if(db.users[key]){ console.log(r.name + ' already stands.'); continue; }
  const s = freshState(now);
  s.seenIntro = true;
  s.t = { spearman:0, archer:0, knight:0, ballista:0, ...r.t };
  s.b.barracks = 6; s.b.wall = r.wall; s.b.townhall = 4;
  s.b.farm = 4; s.b.lumberyard = 4; s.b.quarry = 3;
  s.defStance = r.stance;
  s.laurels = r.laurels;
  s.wavesWon = 4 + Math.floor(defensePower(s) / 40);
  const salt = randomBytes(16).toString('hex');
  db.users[key] = {
    name: r.name, salt,
    hash: scryptSync('rival-hold-' + key, salt, 64).toString('hex'),
    token: randomBytes(24).toString('hex'),
    state: s, created: now,
  };
  console.log(r.name.padEnd(11) + ' defence ' + String(defensePower(s)).padStart(4)
    + ' · ' + r.laurels + ' Laurels · stands in ' + r.stance);
}

mkdirSync(join(HERE,'data'), { recursive: true });
writeFileSync(FILE, JSON.stringify(db));
console.log('\n' + Object.keys(db.users).length + ' holds on the server.');
