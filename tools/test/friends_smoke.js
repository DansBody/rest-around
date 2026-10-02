// End-to-end check of friends, visits and helping on the deployed `game` function, with two throwaway players.
//   node tools/test/friends_smoke.js setup   → signs up A and B (anonymous), checks that adding friends needs
//                                              a linked account, saves their tokens, prints their ids
//   (mark both as linked: update auth.users set is_anonymous = false where id in (…))
//   node tools/test/friends_smoke.js run     → friend codes, invite + accept, visit, the three kinds of help,
//                                              daily limits, and B receiving it all at the next heartbeat
// Leaves two test users behind; delete them from Authentication → Users when done.
import { readFileSync, writeFileSync } from 'node:fs';
import { SUPABASE_URL, SUPABASE_KEY, GAME_FN } from '../../src/cloud_config.js';
import { BALANCE_VERSION } from '../../src/data.js';
import * as fx from './fixtures.js';

const STATE = new URL('../../build/friends_smoke.json', import.meta.url);
let fail = 0;
const ok = (cond, msg, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra ? '  ' + extra : '')); if (!cond) fail++; };
const auth = (path, body) => fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const call = async (p, body) => {
  const r = await fetch(GAME_FN, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: BALANCE_VERSION, ...body }) });
  return { status: r.status, body: await r.json() };
};

if (process.argv[2] === 'setup') {
  const players = {};
  for (const [name, make] of [['A', fx.grown], ['B', fx.starter]]) {
    const s = await auth('signup', {});
    const p = { id: s.user.id, token: s.access_token, refresh: s.refresh_token };
    const save = make(); save.state.name = `Test ${name}`;
    const r = await call(p, { op: 'login', local: save });
    ok(r.status === 200, `${name} signs in and opens a café`, p.id);
    players[name] = p;
  }
  const code = (await call(players.B, { op: 'friends' })).body.me.code;
  ok(/^[A-Z2-9]{8}$/.test(code || ''), 'B has a friend code', code);
  const r = await call(players.A, { op: 'friend_add', code });
  ok(r.status === 403 && r.body.error === 'link', 'an unlinked player cannot add friends');
  writeFileSync(STATE, JSON.stringify(players));
  console.log(`\nnow mark them linked: update auth.users set is_anonymous = false where id in ('${players.A.id}', '${players.B.id}');`);
} else {
  const players = JSON.parse(readFileSync(STATE, 'utf8'));
  for (const p of Object.values(players)) {   // a fresh token picks up is_anonymous = false
    const s = await auth('token?grant_type=refresh_token', { refresh_token: p.refresh });
    p.token = s.access_token; p.refresh = s.refresh_token;
  }
  const { A, B } = players;
  const la = await call(A, { op: 'login', local: null }), lb = await call(B, { op: 'login', local: null });
  A.session = la.body.session; A.rev = la.body.rev; B.session = lb.body.session; B.rev = lb.body.rev;
  const bSave = lb.body.save;

  const codeB = (await call(B, { op: 'friends' })).body.me.code;
  ok((await call(A, { op: 'friend_add', code: 'NOPE2345' })).status === 404, 'an unknown code → 404');
  ok((await call(A, { op: 'friend_add', code: (await call(A, { op: 'friends' })).body.me.code })).body.error === 'self', 'cannot befriend yourself');
  let pr = await call(A, { op: 'profile_set', nickname: '  Annie\u0007 the barista,  with a long name ', avatar: { model: 'heehee', bg: '#c9e8d4' } });
  ok(pr.status === 200 && pr.body.me.name === 'Annie the barist' && pr.body.me.avatar.model === 'heehee', 'A sets a nickname (cleaned, 16 characters) and an avatar', pr.body.me && JSON.stringify(pr.body.me.name));
  ok((await call(A, { op: 'profile_set', nickname: 'x', avatar: { model: 'dragon', bg: '#000000' } })).body.error === 'avatar', 'an unknown avatar is refused');
  pr = await call(A, { op: 'profile_set', nickname: '安妮' });
  ok(pr.body.me.name === '安妮' && pr.body.me.avatar.model === 'heehee', 'changing only the nickname keeps the avatar');
  let r = await call(A, { op: 'friend_add', code: codeB.toLowerCase().replace(/(....)/, '$1-') });
  ok(r.status === 200 && r.body.status === 'pending', 'A invites B (code typed in lower case with a dash)');
  ok((await call(A, { op: 'visit', id: B.id })).status === 404, 'no visiting before B accepts');
  r = await call(B, { op: 'friends' });
  ok(r.body.incoming.length === 1 && r.body.incoming[0].name === '安妮' && r.body.incoming[0].cafe === 'Test A' && r.body.incoming[0].avatar.model === 'heehee', 'B sees the invite from 安妮 (Test A), with her avatar');
  ok((await call(B, { op: 'friend_accept', id: A.id })).status === 200, 'B accepts');
  r = await call(A, { op: 'friends' });
  const fr = r.body.friends[0];
  ok(fr && fr.id === B.id && fr.hearts === 1 && fr.left.gift === 2, 'A has B as a friend at 1 heart', JSON.stringify(fr && fr.left));

  r = await call(A, { op: 'visit', id: B.id });
  ok(r.status === 200 && r.body.save.state.name === 'Test B', 'A visits B and gets the café');

  const help = async (req) => { const x = await call(A, { op: 'help', id: B.id, session: A.session, rev: A.rev, ...req }); if (x.status === 200) A.rev = x.body.rev; return x; };
  r = await help({ kind: 'clean' });
  ok(r.status === 200 && r.body.points === 1, 'A picks up litter in B’s café', `friendship ${r.body.points}`);
  ok((await help({ kind: 'clean' })).body.error === 'limit', 'a second clean-up today is over the limit');
  r = await help({ kind: 'snack', snack: 'cookie', staff: 'mochalatte' });
  ok(r.status === 200 && r.body.save.state.snacks.cookie === 2 && r.body.points === 3, 'A feeds B’s Mocha Latte a cookie (A has one fewer)');
  r = await help({ kind: 'gift', items: { beans: 2 } });
  ok(r.status === 200 && r.body.left.gift === 0, 'A gifts two beans, that is today’s gifts used up');
  ok((await help({ kind: 'gift', items: { milk: 1 } })).body.error === 'limit', 'a third item today is over the limit');
  ok((await call(A, { op: 'help', id: B.id, session: A.session, rev: A.rev - 1, kind: 'clean' })).status === 409, 'help on a stale revision → 409');

  // B is playing: the next heartbeat brings it all in
  const before = bSave.staff.find((s) => s.look.model === 'mochalatte').energy;
  r = await call(B, { op: 'beat', session: B.session, rev: B.rev, save: bSave });
  const inc = r.body.incoming || [];
  ok(r.status === 200 && inc.length === 3, 'B’s next heartbeat brings three helping hands', inc.map((d) => d.kind).join(','));
  ok(inc.every((d) => d.from === '安妮'), 'each is signed by 安妮');
  B.rev = r.body.rev;
  const lb2 = await call(B, { op: 'login', local: null });
  const s2 = lb2.body.save;
  ok(s2.state.inv.beans === (bSave.state.inv.beans || 0) + 2, 'B’s pantry has the beans');
  ok(s2.staff.find((x) => x.look.model === 'mochalatte').energy === Math.min(100, before + 30), 'B’s Mocha Latte is rested');
  ok((s2.world.trash || []).length + (s2.world.extraTrash || 0) < (bSave.world.trash || []).length, 'B’s café has less litter');
  ok((lb2.body.incoming || []).length === 0, 'nothing is delivered twice');

  ok((await call(B, { op: 'friend_remove', id: A.id })).status === 200, 'B removes A');
  ok((await call(A, { op: 'friends' })).body.friends.length === 0, 'and A no longer has B');
  console.log(`\nusers to clean up: ${A.id}, ${B.id}`);
}
process.exit(fail ? 1 : 0);
