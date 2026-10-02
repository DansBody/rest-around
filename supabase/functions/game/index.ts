// The game's server (see ONLINE.md). One function; the body's `op` says what to do.
//
// The café:
//   { op: 'login', version, local }            opening the game: starts a new session (the old device is
//        → { session, rev, save, report,        logged out), settles the time away with offline.js, merges
//            incoming }                         the inbox, and stores the result before returning it.
//                                               `local` (the save in the browser) is only used when the
//                                               player has no cloud save yet: the first time online.
//   { op: 'beat', version, session, rev, save } while playing, every ~45 s and when the tab closes: checks
//        → { rev, corrected, incoming }         the session and the revision, holds the upload against the
//                                               earnings ceiling (authority.js), merges the inbox, stores it.
//   { op: 'reset', version, session, save }    "Reset game": replaces the save with a brand-new café.
//        → { rev }
//
// Friends (linked accounts only for adding and helping; see social.js):
//   { op: 'friends' }                          → { me, linked, friends, incoming, outgoing }
//   { op: 'profile_set', nickname, avatar? }   → { me }   (anyone signed in; avatar per social.js AVATAR)
//   { op: 'friend_add', code }                 → { status: 'pending' | 'accepted' | 'already' }
//   { op: 'friend_accept', id }                → { ok }
//   { op: 'friend_remove', id }                → { ok }   (decline, cancel or unfriend)
//   { op: 'visit', id }                        → { save, name, level, hearts, points, left }
//   { op: 'help', id, session, rev, kind, …}   → { rev, save, points, hearts, left }
//
// `incoming` is the friends' help just merged into the save (the game applies it to the café it is running).
// Errors: 401 not signed in, 403 { error: 'link' } needs a linked account, 409 { error: 'session' | 'rev' }
// another device or a stale save (reload), 422 { error: 'rejected', save, rev } an upload that could not be
// repaired, 426 { error: 'version' } the game is older than the server (reload); friend ops answer 400/404
// with an `error` code the game turns into a message.
//
// The shared game rules are bundled in from src/ by tools/build_functions.js; never edit them here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { settleOffline, levelFor } from '../../../src/offline.js';
import { capCheck, badShape, wealth, isFreshSave } from '../../../src/authority.js';
import { FRIENDS, heartsFor, leftToday, planHelp, applyDeliveries, HELP_KINDS, cleanNick, validAvatar } from '../../../src/social.js';
import { BALANCE_VERSION, OFFLINE } from '../../../src/data.js';

const secret = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return undefined; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(Deno.env.get('SUPABASE_URL')!, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const MAX_BODY = 400_000;   // a big café saves to ~30 KB

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const today = () => new Date().toISOString().slice(0, 10);   // the server's UTC date: when daily limits reset
const pair = (x: string, y: string) => (x < y ? { a: x, b: y } : { a: y, b: x });
const must = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

type Me = { id: string; linked: boolean };
async function userOf(req: Request): Promise<Me | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data || !data.claims || data.claims.role !== 'authenticated') return null;
  return { id: data.claims.sub as string, linked: !data.claims.is_anonymous };
}

async function flag(user: string, rev: number, rejected: boolean, flags: string[], claimed: unknown, allowed: unknown) {
  const { error } = await db.from('cap_flags').insert({ user_id: user, rev, rejected, flags, claimed, allowed });
  if (error) console.error('flag insert failed', error);
}

/** Store a save over `oldRev` (for `session`, if given), mark inbox items delivered, refresh the profile. */
async function commit(user: string, oldRev: number, session: string | null, setSession: string | null, data: any, delivered: number[] = []) {
  return must(await db.rpc('game_commit', {
    p_user: user, p_old_rev: oldRev, p_session: session, p_set_session: setSession, p_data: data, p_balance: BALANCE_VERSION,
    p_delivered: delivered, p_name: typeof data.state.name === 'string' ? data.state.name : '', p_level: levelFor(data.state.points || 0),
  })) as number | null;
}

/** Friends' help waiting for this player, merged into `data`. */
async function withInbox(user: string, data: any) {
  const rows = must(await db.from('deliveries').select('id, kind, payload, from_user').eq('to_user', user).is('delivered_at', null).order('id').limit(50)) as any[];
  if (!rows.length) return { data, applied: [], ids: [] };
  const names = await namesOf(rows.map((r) => r.from_user).filter(Boolean));
  const merged = applyDeliveries(data, rows.map((r) => ({ ...r, from_name: names[r.from_user] || '' })));
  return { ...merged, ids: rows.map((r) => r.id) };
}
async function namesOf(ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const rows = must(await db.from('profiles').select('user_id, cafe_name, nickname').in('user_id', [...new Set(ids)])) as any[];
  return Object.fromEntries(rows.map((r) => [r.user_id, r.nickname || r.cafe_name]));
}

// ---------------------------------------------------------------- the café
async function login(user: string, body: any, tries = 0): Promise<Response> {
  if (tries > 3) return reply(409, { error: 'rev' });
  const now = Date.now(), iso = new Date(now).toISOString();
  const session = crypto.randomUUID();
  const row = must(await db.from('saves').select('*').eq('user_id', user).maybeSingle()) as any;

  if (!row) {
    // first time online: the browser's save becomes revision 1 (trusted once, but logged)
    const local = body.local;
    const bad = badShape(local);
    if (bad) return reply(400, { error: 'bad_save', detail: bad });
    local.savedAt = now;
    const { error: e2 } = await db.from('saves').insert({
      user_id: user, data: local, rev: 1, server_saved_at: iso, last_seen: iso, balance_version: BALANCE_VERSION, active_session: session,
    });
    if (e2) {
      if (e2.code === '23505') return login(user, { ...body, local: null }, tries + 1);   // another tab won the race: log in to that one
      throw e2;
    }
    must(await db.from('profiles').upsert({ user_id: user, cafe_name: String(local.state.name || 'Sunny Café').slice(0, 24), level: levelFor(local.state.points || 0) }, { onConflict: 'user_id' }));
    await flag(user, 1, false, ['migrated'], { wealth: Math.round(wealth(local)), points: local.state.points }, null);
    return reply(200, { session, rev: 1, save: local, report: null, incoming: [], now, created: true });
  }

  // the time away, by the server's clock, from the last thing it heard
  let data = row.data, report = null;
  const elapsed = (now - Date.parse(row.last_seen)) / 1000;
  if (elapsed >= OFFLINE.minSeconds) {
    const away = settleOffline(data, elapsed, now, { seedBase: Date.parse(row.server_saved_at) });
    if (away) { data = away.data; report = away.report; }
  }
  const inbox = await withInbox(user, data);
  data = inbox.data;
  data.savedAt = now;
  // stored before it is returned, so the same stretch is never paid twice
  const rev = await commit(user, row.rev, null, session, data, inbox.ids);
  if (rev == null) return login(user, body, tries + 1);   // a heartbeat landed in between: settle again from that
  return reply(200, { session, rev, save: data, report, incoming: inbox.applied, now, created: false });
}

async function beat(user: string, body: any) {
  const now = Date.now();
  const row = must(await db.from('saves').select('*').eq('user_id', user).maybeSingle()) as any;
  if (!row || row.active_session !== body.session) return reply(409, { error: 'session' });
  if (body.rev !== row.rev) return reply(409, { error: 'rev', rev: row.rev });

  const wall = (now - Date.parse(row.server_saved_at)) / 1000;
  const r = capCheck(row.data, body.save, wall);
  if (r.reject) {
    await flag(user, row.rev, true, r.flags, null, null);
    return reply(422, { error: 'rejected', save: row.data, rev: row.rev });
  }
  // friends' help goes in after the check: it is not the player's own earnings
  const inbox = await withInbox(user, r.data);
  const data = inbox.data;
  data.savedAt = now;
  const rev = await commit(user, row.rev, body.session, null, data, inbox.ids);
  if (rev == null) return reply(409, { error: 'rev' });
  if (r.flags.length) await flag(user, rev, false, r.flags, r.claimed, r.allowed);
  return reply(200, { rev, now, corrected: r.flags.length ? data : null, incoming: inbox.applied });
}

async function reset(user: string, body: any) {
  if (!isFreshSave(body.save)) return reply(400, { error: 'not_fresh' });
  const row = must(await db.from('saves').select('rev, active_session').eq('user_id', user).maybeSingle()) as any;
  if (!row || row.active_session !== body.session) return reply(409, { error: 'session' });
  body.save.savedAt = Date.now();
  const rev = await commit(user, row.rev, body.session, null, body.save);
  if (rev == null) return reply(409, { error: 'rev' });
  return reply(200, { rev });
}

// ---------------------------------------------------------------- friends
const PROFILE = 'user_id, friend_code, cafe_name, level, nickname, avatar';
/** This player's profile (made on first use: that is when the friend code is drawn). */
async function myProfile(user: string) {
  let p = must(await db.from('profiles').select(PROFILE).eq('user_id', user).maybeSingle()) as any;
  if (!p) p = must(await db.from('profiles').upsert({ user_id: user }, { onConflict: 'user_id' }).select(PROFILE).single());
  return p;
}
/** How a player looks to others: the nickname (or the café name), the café, the level, the avatar. */
const face = (p: any) => ({ name: (p && (p.nickname || p.cafe_name)) || '', cafe: (p && p.cafe_name) || '', level: (p && p.level) || 1, avatar: (p && p.avatar) || null });
const meOf = (p: any) => ({ code: p.friend_code, nickname: p.nickname, ...face(p) });
async function friendship(me: string, other: string) {
  const { a, b } = pair(me, other);
  return must(await db.from('friendships').select('*').eq('a', a).eq('b', b).maybeSingle()) as any;
}
/** Today's help from `me`, per friend and kind (gifts count items). */
async function usedToday(me: string, targets: string[]) {
  const used: Record<string, Record<string, number>> = {};
  if (!targets.length) return used;
  const rows = must(await db.from('help_log').select('target, kind, amount').eq('helper', me).eq('day', today()).in('target', targets)) as any[];
  for (const r of rows) { used[r.target] = used[r.target] || {}; used[r.target][r.kind] = (used[r.target][r.kind] || 0) + r.amount; }
  return used;
}
const leftFor = (hearts: number, used: Record<string, number> = {}) => Object.fromEntries(HELP_KINDS.map((k) => [k, leftToday(k, hearts, used[k])]));

async function friends(me: Me) {
  const mine = await myProfile(me.id);
  const rows = must(await db.from('friendships').select('*').or(`a.eq.${me.id},b.eq.${me.id}`)) as any[];
  const others = rows.map((r) => (r.a === me.id ? r.b : r.a));
  const profs = others.length ? Object.fromEntries((must(await db.from('profiles').select(PROFILE).in('user_id', others)) as any[]).map((p) => [p.user_id, p])) : {};
  const used = await usedToday(me.id, others);
  const card = (r: any) => {
    const id = r.a === me.id ? r.b : r.a, hearts = heartsFor(r.points);
    return { id, ...face(profs[id]), points: r.points, hearts, left: leftFor(hearts, used[id]) };
  };
  return reply(200, {
    me: meOf(mine), linked: me.linked, max: FRIENDS.max,
    friends: rows.filter((r) => r.status === 'accepted').map(card),
    incoming: rows.filter((r) => r.status === 'pending' && r.requested_by !== me.id).map(card),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requested_by === me.id).map(card),
  });
}

async function profileSet(me: Me, body: any) {
  await myProfile(me.id);
  const patch: Record<string, unknown> = { nickname: cleanNick(body.nickname) };
  if (body.avatar !== undefined) {
    if (!validAvatar(body.avatar)) return reply(400, { error: 'avatar' });
    patch.avatar = { model: body.avatar.model, bg: body.avatar.bg };
  }
  const p = must(await db.from('profiles').update(patch).eq('user_id', me.id).select(PROFILE).single());
  return reply(200, { me: meOf(p) });
}

async function friendAdd(me: Me, body: any) {
  if (!me.linked) return reply(403, { error: 'link' });
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const p = must(await db.from('profiles').select('user_id').eq('friend_code', code).maybeSingle()) as any;
  if (!p) return reply(404, { error: 'code' });
  if (p.user_id === me.id) return reply(400, { error: 'self' });
  const f = await friendship(me.id, p.user_id);
  if (f && f.status === 'accepted') return reply(200, { status: 'already' });
  if (f && f.requested_by === me.id) return reply(200, { status: 'pending' });
  if (f) {   // they had already asked: this accepts
    must(await db.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('a', f.a).eq('b', f.b));
    return reply(200, { status: 'accepted' });
  }
  const count = async (id: string) => (await db.from('friendships').select('a', { count: 'exact', head: true }).or(`a.eq.${id},b.eq.${id}`)).count || 0;
  if (await count(me.id) >= FRIENDS.max) return reply(400, { error: 'full' });
  if (await count(p.user_id) >= FRIENDS.max) return reply(400, { error: 'their_full' });
  must(await db.from('friendships').insert({ ...pair(me.id, p.user_id), requested_by: me.id }));
  return reply(200, { status: 'pending' });
}

async function friendAccept(me: Me, body: any) {
  if (!me.linked) return reply(403, { error: 'link' });
  const f = await friendship(me.id, String(body.id || ''));
  if (!f || f.status !== 'pending' || f.requested_by === me.id) return reply(404, { error: 'invite' });
  must(await db.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('a', f.a).eq('b', f.b));
  return reply(200, { ok: true });
}

async function friendRemove(me: Me, body: any) {
  const f = await friendship(me.id, String(body.id || ''));
  if (!f) return reply(404, { error: 'friend' });
  must(await db.from('friendships').delete().eq('a', f.a).eq('b', f.b));
  return reply(200, { ok: true });
}

async function visit(me: Me, body: any) {
  const id = String(body.id || '');
  const f = await friendship(me.id, id);
  if (!f || f.status !== 'accepted') return reply(404, { error: 'friend' });
  const row = must(await db.from('saves').select('data').eq('user_id', id).maybeSingle()) as any;
  if (!row) return reply(404, { error: 'save' });
  const p = must(await db.from('profiles').select(PROFILE).eq('user_id', id).maybeSingle());
  const hearts = heartsFor(f.points);
  const used = await usedToday(me.id, [id]);
  return reply(200, { save: row.data, ...face(p), hearts, points: f.points, left: leftFor(hearts, used[id]) });
}

async function help(me: Me, body: any) {
  if (!me.linked) return reply(403, { error: 'link' });
  const id = String(body.id || '');
  const f = await friendship(me.id, id);
  if (!f || f.status !== 'accepted') return reply(404, { error: 'friend' });
  const mine = must(await db.from('saves').select('data, rev, active_session').eq('user_id', me.id).maybeSingle()) as any;
  if (!mine || mine.active_session !== body.session) return reply(409, { error: 'session' });
  if (body.rev !== mine.rev) return reply(409, { error: 'rev', rev: mine.rev });
  const theirs = must(await db.from('saves').select('data').eq('user_id', id).maybeSingle()) as any;
  if (!theirs) return reply(404, { error: 'save' });
  const hearts = heartsFor(f.points);
  const used = (await usedToday(me.id, [id]))[id] || {};
  const plan = planHelp(mine.data, theirs.data, body, hearts, used[body.kind]);
  if (plan.error) return reply(400, { error: plan.error });
  plan.data.savedAt = Date.now();
  const gain = FRIENDS.friendship[body.kind as 'clean' | 'snack' | 'gift'];
  const rev = must(await db.rpc('game_help', {
    p_helper: me.id, p_old_rev: mine.rev, p_session: body.session, p_data: plan.data, p_target: id,
    p_kind: body.kind, p_amount: plan.amount, p_payload: plan.payload, p_friendship: gain,
  })) as number | null;
  if (rev == null) return reply(409, { error: 'rev' });
  const points = f.points + gain, h = heartsFor(points);
  used[body.kind] = (used[body.kind] || 0) + plan.amount;
  return reply(200, { rev, save: plan.data, points, hearts: h, left: leftFor(h, used) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const me = await userOf(req);
    if (!me) return reply(401, { error: 'auth' });
    const text = await req.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'too_big' });
    const body = JSON.parse(text);
    if (body.version !== BALANCE_VERSION) return reply(426, { error: 'version', version: BALANCE_VERSION });
    switch (body.op) {
      case 'login': return await login(me.id, body);
      case 'beat': return await beat(me.id, body);
      case 'reset': return await reset(me.id, body);
      case 'friends': return await friends(me);
      case 'profile_set': return await profileSet(me, body);
      case 'friend_add': return await friendAdd(me, body);
      case 'friend_accept': return await friendAccept(me, body);
      case 'friend_remove': return await friendRemove(me, body);
      case 'visit': return await visit(me, body);
      case 'help': return await help(me, body);
      default: return reply(400, { error: 'op' });
    }
  } catch (e) {
    console.error(e);
    return reply(500, { error: 'server' });
  }
});
