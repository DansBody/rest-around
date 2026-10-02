// The game's server (see ONLINE.md). One function, two calls:
//
//   { op: 'login', version, local }            opening the game: starts a new session (the old device is
//        → { session, rev, save, report }       logged out), settles the time away with offline.js and
//                                               stores the result before returning it. `local` (the save in
//                                               the browser) is only used when the player has no cloud
//                                               save yet: the first time online.
//   { op: 'beat', version, session, rev, save } while playing, every ~45 s and when the tab closes: checks
//        → { rev, corrected }                   the session and the revision, holds the upload against the
//                                               earnings ceiling (authority.js) and stores it.
//   { op: 'reset', version, session, save }    "Reset game": replaces the save with a brand-new café.
//        → { rev }
//
// Errors: 401 not signed in, 409 { error: 'session' | 'rev' } another device or a stale upload (reload),
// 422 { error: 'rejected', save, rev } an upload that could not be repaired (carry on from `save`),
// 426 { error: 'version' } the game is older than the server (reload).
//
// The shared game rules are bundled in from src/ by tools/deploy_functions.js; never edit them here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { settleOffline } from '../../../src/offline.js';
import { capCheck, badShape, wealth, isFreshSave } from '../../../src/authority.js';
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

async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data || !data.claims || data.claims.role !== 'authenticated') return null;
  return data.claims.sub as string;
}

async function flag(user: string, rev: number, rejected: boolean, flags: string[], claimed: unknown, allowed: unknown) {
  const { error } = await db.from('cap_flags').insert({ user_id: user, rev, rejected, flags, claimed, allowed });
  if (error) console.error('flag insert failed', error);
}

async function login(user: string, body: any, tries = 0): Promise<Response> {
  if (tries > 3) return reply(409, { error: 'rev' });
  const now = Date.now(), iso = new Date(now).toISOString();
  const session = crypto.randomUUID();
  const { data: row, error } = await db.from('saves').select('*').eq('user_id', user).maybeSingle();
  if (error) throw error;

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
    await flag(user, 1, false, ['migrated'], { wealth: Math.round(wealth(local)), points: local.state.points }, null);
    return reply(200, { session, rev: 1, save: local, report: null, now, created: true });
  }

  // the time away, by the server's clock, from the last thing it heard
  let data = row.data, report = null;
  const elapsed = (now - Date.parse(row.last_seen)) / 1000;
  if (elapsed >= OFFLINE.minSeconds) {
    const away = settleOffline(data, elapsed, now, { seedBase: Date.parse(row.server_saved_at) });
    if (away) { data = away.data; report = away.report; }
  }
  data.savedAt = now;
  // stored before it is returned, so the same stretch is never paid twice
  const { data: upd, error: e3 } = await db.from('saves')
    .update({ data, rev: row.rev + 1, server_saved_at: iso, last_seen: iso, balance_version: BALANCE_VERSION, active_session: session })
    .eq('user_id', user).eq('rev', row.rev).select('rev').maybeSingle();
  if (e3) throw e3;
  if (!upd) return login(user, body, tries + 1);   // a heartbeat landed in between: settle again from that
  return reply(200, { session, rev: upd.rev, save: data, report, now, created: false });
}

async function beat(user: string, body: any) {
  const now = Date.now(), iso = new Date(now).toISOString();
  const { data: row, error } = await db.from('saves').select('*').eq('user_id', user).maybeSingle();
  if (error) throw error;
  if (!row || row.active_session !== body.session) return reply(409, { error: 'session' });
  if (body.rev !== row.rev) return reply(409, { error: 'rev', rev: row.rev });

  const wall = (now - Date.parse(row.server_saved_at)) / 1000;
  const r = capCheck(row.data, body.save, wall);
  if (r.reject) {
    await flag(user, row.rev, true, r.flags, null, null);
    return reply(422, { error: 'rejected', save: row.data, rev: row.rev });
  }
  const data = r.data;
  data.savedAt = now;
  const { data: upd, error: e2 } = await db.from('saves')
    .update({ data, rev: row.rev + 1, server_saved_at: iso, last_seen: iso, balance_version: BALANCE_VERSION })
    .eq('user_id', user).eq('rev', row.rev).eq('active_session', body.session).select('rev').maybeSingle();
  if (e2) throw e2;
  if (!upd) return reply(409, { error: 'rev' });
  if (r.flags.length) await flag(user, upd.rev, false, r.flags, r.claimed, r.allowed);
  return reply(200, { rev: upd.rev, now, corrected: r.flags.length ? data : null });
}

async function reset(user: string, body: any) {
  const iso = new Date().toISOString();
  if (!isFreshSave(body.save)) return reply(400, { error: 'not_fresh' });
  const { data: row, error } = await db.from('saves').select('rev, active_session').eq('user_id', user).maybeSingle();
  if (error) throw error;
  if (!row || row.active_session !== body.session) return reply(409, { error: 'session' });
  body.save.savedAt = Date.now();
  const { data: upd, error: e2 } = await db.from('saves')
    .update({ data: body.save, rev: row.rev + 1, server_saved_at: iso, last_seen: iso, balance_version: BALANCE_VERSION })
    .eq('user_id', user).eq('rev', row.rev).eq('active_session', body.session).select('rev').maybeSingle();
  if (e2) throw e2;
  if (!upd) return reply(409, { error: 'rev' });
  return reply(200, { rev: upd.rev });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const user = await userOf(req);
    if (!user) return reply(401, { error: 'auth' });
    const text = await req.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'too_big' });
    const body = JSON.parse(text);
    if (body.version !== BALANCE_VERSION) return reply(426, { error: 'version', version: BALANCE_VERSION });
    if (body.op === 'login') return await login(user, body);
    if (body.op === 'beat') return await beat(user, body);
    if (body.op === 'reset') return await reset(user, body);
    return reply(400, { error: 'op' });
  } catch (e) {
    console.error(e);
    return reply(500, { error: 'server' });
  }
});
