// Playing online (see ONLINE.md). The server holds the real save: opening the game signs in (anonymously
// at first) and logs in to the `game` Edge Function, which settles the time away and hands back the café;
// while playing, a heartbeat uploads the save every HEARTBEAT seconds and as the tab is hidden, and the
// server holds each upload against what the café could have earned. Only one device plays at a time: a
// newer login turns the older one away.
//
// When the server cannot be reached the game plays on from this browser's copy (save.js load()); that
// progress stays on this device, the cloud save wins at the next login.
import { SUPABASE_URL, SUPABASE_KEY, GAME_FN } from './cloud_config.js';
import { BALANCE_VERSION } from './data.js';
import { serialize, apply, readLocal, writeLocal } from './save.js';

export const HEARTBEAT = 45;   // seconds between uploads while playing

class Cloud {
  constructor() {
    this.online = false;   // logged in to the server and allowed to write
    this.sb = null; this.token = null; this.user = null;
    this.session = null; this.rev = 0;
    this.busy = false;
    this.onStop = null;    // (reason: 'session' | 'version' | 'rev') → the game can no longer write; tell the player
  }

  /** Sign in (reusing the session kept in this browser, else as a new anonymous player). */
  async connect() {
    const { createClient } = await import('@supabase/supabase-js');
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'refillit.auth' } });
    let { data } = await this.sb.auth.getSession();
    if (!data.session) {
      const r = await this.sb.auth.signInAnonymously();
      if (r.error) throw r.error;
      data = r.data;
    }
    this.token = data.session.access_token;
    this.user = data.session.user;
    this.sb.auth.onAuthStateChange((_e, s) => { if (s) { this.token = s.access_token; this.user = s.user; } });
  }

  async call(body, keepalive = false) {
    const r = await fetch(GAME_FN, {
      method: 'POST', keepalive,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: BALANCE_VERSION, ...body }),
    });
    let json = {};
    try { json = await r.json(); } catch { /* empty body */ }
    return { status: r.status, body: json };
  }

  /**
   * Open the café from the server. `fresh` makes a new game's save, used only if this player has never
   * been online and this browser has no save of its own.
   * @returns 'loaded' | 'new'; throws when the server cannot be reached (play offline then)
   */
  async login(game, fresh) {
    await this.connect();
    const local = readLocal();
    const r = await this.call({ op: 'login', local: typeof local === 'object' ? local.data : fresh() });
    if (r.status === 426) { this.stop('version'); throw new Error('version'); }
    if (r.status !== 200) throw new Error(`login ${r.status} ${r.body.error || ''}`);
    apply(game, r.body.save);
    game.awayReport = r.body.report || null;
    writeLocal(r.body.save);
    this.session = r.body.session; this.rev = r.body.rev;
    this.online = true;
    return r.body.created && typeof local !== 'object' ? 'new' : 'loaded';
  }

  /** Upload the save. `final` is the last one as the tab is hidden or closed (sent even if the page goes away). */
  async beat(game, final = false) {
    if (!this.online || game.resetting || (this.busy && !final)) return;
    this.busy = true;
    try {
      const save = serialize(game);
      const r = await this.call({ op: 'beat', session: this.session, rev: this.rev, save }, final);
      if (r.status === 200) {
        this.rev = r.body.rev;
        const c = r.body.corrected;
        if (c) this.correct(game, c);
        writeLocal(c || save);
      } else if (r.status === 409) this.stop(r.body.error === 'session' ? 'session' : 'rev');
      else if (r.status === 426) this.stop('version');
      else if (r.status === 422) this.stop('rev');   // the upload could not be used: start again from the server's save
      // anything else (network, 5xx): keep playing, the next heartbeat tries again
    } catch (e) {
      console.warn('Heartbeat failed', e);
    } finally {
      this.busy = false;
    }
  }

  /** The server took back what the upload claimed beyond the ceiling: the coins, points, rating and staff skills it sent back. */
  correct(game, c) {
    const s = game.state;
    s.coins = c.state.coins; s.points = c.state.points; s.rating = c.state.rating;
    for (const a of game.staff) {
      const sd = (c.staff || []).find((x) => x.look && a.look && x.look.model === a.look.model);
      if (sd) a.skills = { ...(sd.skills || {}) };
    }
    game.changed('coins'); game.changed('points');
  }

  /** "Reset game": the server swaps the save for a brand-new café. */
  async reset(save) {
    const r = await this.call({ op: 'reset', session: this.session, save });
    if (r.status !== 200) throw new Error(`reset ${r.status} ${r.body.error || ''}`);
    this.rev = r.body.rev;
  }

  stop(reason) {
    if (!this.online && reason !== 'version') return;
    this.online = false;
    if (this.onStop) this.onStop(reason);
  }
}

export const cloud = new Cloud();
