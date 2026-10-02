// Playing online (see ONLINE.md). The server holds the real save: opening the game signs in (anonymously
// at first) and logs in to the `game` Edge Function, which settles the time away and hands back the café;
// while playing, a heartbeat uploads the save every HEARTBEAT seconds and as the tab is hidden, and the
// server holds each upload against what the café could have earned. Only one device plays at a time: a
// newer login turns the older one away.
//
// When the server cannot be reached the game plays on from this browser's copy (save.js load()); that
// progress stays on this device, the cloud save wins at the next login.
//
// Accounts: every player starts anonymous. Linking Google or an email + password to that same account
// (same user id, so the save stays put) lets them carry on on another device; signing in to an account
// that already has a café leaves this device's anonymous one behind. Google and email confirmation both
// leave the page and come back: what happened is read from the URL on the way back (`returned`).
import { SUPABASE_URL, SUPABASE_KEY, GAME_FN } from './cloud_config.js';
import { BALANCE_VERSION } from './data.js';
import { serialize, apply, readLocal, writeLocal, clearSave } from './save.js';

export const HEARTBEAT = 45;   // seconds between uploads while playing

class Cloud {
  constructor() {
    this.online = false;   // logged in to the server and allowed to write
    this.sb = null; this.token = null; this.user = null;
    this.session = null; this.rev = 0;
    this.busy = false;
    this.onStop = null;    // (reason: 'session' | 'version' | 'rev') → the game can no longer write; tell the player
    this.onAccount = null; // the signed-in user changed (linked, email confirmed…): redraw what shows it
    this.onIncoming = null;   // (help) friends helped out: tell the player
    this.incoming = [];
    this.returned = {};
  }

  /**
   * Sign in, reusing the session kept in this browser. Without one, `choose` (the start screen) lets the
   * player sign in to an account they already have, or carry on as a guest: a new anonymous player.
   */
  async connect(choose) {
    this.returned = readReturn();
    const { createClient } = await import('@supabase/supabase-js');
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'refillit.auth' } });
    let { data } = await this.sb.auth.getSession();
    if (!data.session && choose) {
      await choose();   // resolves once signed in by email or the guest button was pressed (Google leaves the page)
      ({ data } = await this.sb.auth.getSession());
    }
    if (!data.session) {
      const r = await this.sb.auth.signInAnonymously();
      if (r.error) throw r.error;
      data = r.data;
    }
    this.token = data.session.access_token;
    this.user = data.session.user;
    this.sb.auth.onAuthStateChange((e, s) => {
      if (s) { this.token = s.access_token; this.user = s.user; }
      if (e === 'PASSWORD_RECOVERY') this.returned = { ...this.returned, type: 'recovery' };
      if (this.onAccount) this.onAccount();
    });
    if (this.returned.type || this.returned.error || this.returned.came) history.replaceState(null, '', location.pathname);   // tidy the URL
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
   * been online and this browser has no save of its own; `choose` is the start screen (see connect).
   * @returns 'loaded' | 'new'; throws when the server cannot be reached (play offline then)
   */
  async login(game, fresh, choose) {
    await this.connect(choose);
    // this browser's save goes up only if it is this player's (or from before going online), never another account's
    const local = readLocal();
    const mine = typeof local === 'object' && (!local.owner || local.owner === this.user.id);
    const r = await this.call({ op: 'login', local: mine ? local.data : fresh() });
    if (r.status === 426) { this.stop('version'); throw new Error('version'); }
    if (r.status !== 200) throw new Error(`login ${r.status} ${r.body.error || ''}`);
    apply(game, r.body.save);
    game.awayReport = r.body.report || null;
    writeLocal(r.body.save, this.user.id);
    this.incoming = r.body.incoming || [];   // friends' help, already in the save: the game only tells the player
    this.session = r.body.session; this.rev = r.body.rev;
    this.online = true;
    return r.body.created && !mine ? 'new' : 'loaded';
  }

  /** Upload the save. `final` is the last one as the tab is hidden or closed (sent even if the page goes away). */
  beat(game, final = false) {
    if (!this.online || game.resetting || (this.busy && !final)) return Promise.resolve();
    return (this.inflight = this.upload(game, final));
  }
  async upload(game, final) {
    this.busy = true;
    try {
      const save = serialize(game);
      const r = await this.call({ op: 'beat', session: this.session, rev: this.rev, save }, final);
      if (r.status === 200) {
        this.rev = r.body.rev;
        const c = r.body.corrected;
        if (c) this.correct(game, c);
        if (r.body.incoming && r.body.incoming.length) this.receive(game, r.body.incoming);
        writeLocal(c || save, this.user.id);
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

  /**
   * Help a friend (`req`: { kind, snack?, staff?, items? }, see social.js planHelp). The server checks and
   * charges the last save it accepted and restarts its clock from there, so the café is uploaded first: what
   * it earned since the last heartbeat is then counted, not clipped by the next ceiling check. A heartbeat
   * slipping in between makes the revision stale once: upload again and retry.
   * @returns { status, body } (200: { rev, save, points, hearts, left }); the game applies the cost itself.
   */
  async help(game, id, req) {
    if (!this.online) return { status: 0, body: { error: 'offline' } };
    for (let attempt = 0; ; attempt++) {
      while (this.busy) await this.inflight;
      await this.beat(game);
      if (!this.online) return { status: 409, body: { error: 'session' } };
      const r = await this.api('help', { id, session: this.session, rev: this.rev, ...req });
      if (r.status === 200) { this.rev = r.body.rev; return r; }
      if (r.status === 409 && r.body.error === 'rev' && attempt === 0) continue;
      if (r.status === 409) this.stop(r.body.error === 'session' ? 'session' : 'rev');
      return r;
    }
  }

  /** A friends call (see the `game` function): { status, body }; status 0 when the server cannot be reached. */
  async api(op, body = {}) {
    if (!this.user) return { status: 0, body: { error: 'offline' } };
    try { return await this.call({ op, ...body }); } catch (e) { console.warn(op, e); return { status: 0, body: { error: 'offline' } }; }
  }

  /** Friends' help the server just merged into the stored save: do the same to the café that is running. */
  receive(game, incoming) {
    const w = game.world;
    for (const d of incoming) {
      if (d.kind === 'clean') {
        const loose = w.trash.filter((t) => !t.claimed).concat(w.trash.filter((t) => t.claimed));
        for (const t of loose.slice(0, d.n || 0)) w.removeTrash(t);
      } else if (d.kind === 'snack') {
        const a = game.staff.find((x) => x.look && x.look.model === d.staff);
        if (a) a.energy = Math.min(100, a.energy + (d.energy || 0));
        else game.state.snacks[d.snack] = (game.state.snacks[d.snack] || 0) + 1;
      } else if (d.kind === 'gift') {
        for (const [id, n] of Object.entries(d.items || {})) game.state.inv[id] = (game.state.inv[id] || 0) + n;
      }
    }
    game.changed('inv');
    if (this.onIncoming) this.onIncoming(incoming);
  }

  /** "Reset game": the server swaps the save for a brand-new café. */
  async reset(save) {
    const r = await this.call({ op: 'reset', session: this.session, save });
    if (r.status !== 200) throw new Error(`reset ${r.status} ${r.body.error || ''}`);
    this.rev = r.body.rev;
  }

  // ---------------- accounts ----------------
  get linked() { return !!this.user && !this.user.is_anonymous; }
  get email() { return (this.user && this.user.email) || ''; }
  get pendingEmail() { return (this.user && this.user.new_email) || ''; }
  hasProvider(p) { return !!this.user && (this.user.identities || []).some((i) => i.provider === p); }
  /** Linked by email but no password chosen yet (the confirmation link comes first, the password after). */
  get needsPassword() { return this.hasProvider('email') && !(this.user.user_metadata || {}).has_password; }

  /** Link a Google account to this player (leaves the page; `returned` tells how it went). */
  async linkGoogle(game) {
    await this.beat(game);
    const { error } = await this.sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: here() } });
    if (error) throw error;
  }
  /** Link an email: a confirmation link is sent there. @returns 'sent' | 'taken' */
  async linkEmail(email) {
    const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: here() });
    if (error && (error.code === 'email_exists' || /already/i.test(error.message))) return 'taken';
    if (error) throw error;
    return 'sent';
  }
  async setPassword(password) {
    const { error } = await this.sb.auth.updateUser({ password, data: { has_password: true } });
    if (error) throw error;
  }
  /** Open the café of another account: this device's anonymous one is left behind. */
  async signInGoogle(game) {
    await this.beat(game);
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } });
    if (error) throw error;
  }
  async signInEmail(game, email, password) {
    await this.beat(game);
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    location.reload();
  }
  /** From the start screen (nothing to leave behind yet): sign in to an existing account. */
  async startGoogle() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } });
    if (error) throw error;
  }
  async startEmail(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async sendPasswordReset(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: here() });
    if (error) throw error;
  }
  /** Sign out of a linked account: this browser forgets the café (it is safe in the account). */
  async signOut(game) {
    await this.beat(game);
    game.resetting = true;
    await this.sb.auth.signOut();
    clearSave();
    location.reload();
  }

  stop(reason) {
    if (!this.online && reason !== 'version') return;
    this.online = false;
    if (this.onStop) this.onStop(reason);
  }
}

/** Where Google and the confirmation emails send the player back to: this page, without any old query. */
const here = () => location.origin + location.pathname;

/** What a trip to Google or an email link left in the URL: { type, error, errorCode, came }. */
function readReturn() {
  const p = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
  return { type: p.get('type') || '', error: p.get('error_description') || p.get('error') || '', errorCode: p.get('error_code') || '', came: p.has('access_token') || p.has('code') };
}

export const cloud = new Cloud();
