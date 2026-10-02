// End-to-end check of the deployed `game` Edge Function: signs in a throwaway anonymous player and walks
// through login, heartbeats, an edited save, a second device and an old game version.
//   node tools/test/server_smoke.js
// Leaves one anonymous user behind (its id is printed); delete it from Authentication → Users when done.
import { SUPABASE_URL, SUPABASE_KEY, GAME_FN } from '../../src/cloud_config.js';
import { BALANCE_VERSION } from '../../src/data.js';
import * as fx from './fixtures.js';

let fail = 0;
const ok = (cond, msg, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra ? '  ' + extra : '')); if (!cond) fail++; };

const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
const auth = await signup.json();
ok(signup.ok && auth.access_token, 'anonymous sign-in', signup.ok ? `user ${auth.user.id}` : JSON.stringify(auth));
if (!auth.access_token) process.exit(1);
const call = async (body) => {
  const r = await fetch(GAME_FN, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: BALANCE_VERSION, ...body }) });
  return { status: r.status, body: await r.json() };
};

let r = await fetch(GAME_FN, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
ok(r.status === 401, 'no token → 401', String(r.status));

const local = fx.starter();
r = await call({ op: 'login', local });
ok(r.status === 200 && r.body.created && r.body.rev === 1, 'first login uploads the local save as rev 1', JSON.stringify({ s: r.status, rev: r.body.rev }));
const s1 = r.body.session;
let rev = r.body.rev, save = r.body.save;

const next = JSON.parse(JSON.stringify(save)); next.state.coins += 20; next.state.points += 5;
r = await call({ op: 'beat', session: s1, rev, save: next });
ok(r.status === 200 && r.body.rev === 2 && !r.body.corrected, 'honest heartbeat accepted', JSON.stringify(r.body).slice(0, 80));
rev = r.body.rev; save = next;

const cheat = JSON.parse(JSON.stringify(save)); cheat.state.coins += 1e6;
r = await call({ op: 'beat', session: s1, rev, save: cheat });
ok(r.status === 200 && r.body.corrected && r.body.corrected.state.coins < save.state.coins + 2000, '+1,000,000 coins cut back', `coins ${r.body.corrected && r.body.corrected.state.coins}`);
rev = r.body.rev; save = r.body.corrected;

r = await call({ op: 'beat', session: s1, rev: rev - 1, save });
ok(r.status === 409 && r.body.error === 'rev', 'stale revision → 409 rev');

r = await call({ op: 'beat', version: BALANCE_VERSION - 1, session: s1, rev, save });
ok(r.status === 426, 'old game version → 426');

r = await call({ op: 'login', local: fx.grown() });
ok(r.status === 200 && !r.body.created && r.body.save.state.coins === save.state.coins, 'second device logs in to the cloud save (local ignored)', `rev ${r.body.rev}`);
const s2 = r.body.session;
r = await call({ op: 'beat', session: s1, rev: r.body.rev, save });
ok(r.status === 409 && r.body.error === 'session', 'first device is logged out → 409 session');

const fresh = fx.starter(); fresh.state.points = 0; fresh.state.coins = 200;
const rich = fx.grown(); rich.state.points = 0;   // nothing earned, but far too rich for a new game
r = await call({ op: 'reset', session: s2, save: rich });
ok(r.status === 400, 'reset refuses a save that is not brand new');
r = await call({ op: 'reset', session: s2, save: fresh });
ok(r.status === 200, 'reset to a new café', `rev ${r.body.rev}`);
r = await call({ op: 'login', local: null });
ok(r.status === 200 && r.body.save.state.points === 0, 'after the reset the server hands out the new café');

console.log(`\nuser to clean up: ${auth.user.id} (second session ${s2.slice(0, 8)})`);
process.exit(fail ? 1 : 0);
