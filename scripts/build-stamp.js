// The build stamp, in one place because two things need it and they must agree: the
// footer the player reads, and the service worker's cache name.
//
// It exists because there was no way to tell WHICH build was on screen. Testing against a
// local server that had cached an older page showed a hold still full of ballistae hours
// after the Battlemage shipped, and nothing visible could settle it. A version you can read
// is the difference between "the change did not work" and "I am not looking at the change".
import { execSync } from 'node:child_process';

const git = c => { try { return execSync(c, { encoding:'utf8' }).trim(); } catch { return ''; } };

/* The commit, plus a "+" when the tree has uncommitted edits — which is the normal state
   while developing, and exactly when knowing you are on an unshipped build matters most. */
export function sha(){
  return (git('git rev-parse --short HEAD') || 'nogit') + (git('git status --porcelain') ? '+' : '');
}

export function stamp(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return sha() + ' · ' + d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate())
       + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
