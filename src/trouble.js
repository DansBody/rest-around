// Trouble in the café: rude guests and dine-and-dashers (see TROUBLE / CLUBS in data.js). This decides when
// trouble starts, keeps the day's count, and sends a trained staff member on its own, a moment after the
// trouble starts (or as soon as someone trained is free). The guests' own behaviour lives in customer.js,
// the responders' in staff.js.
import { CLUBS, TROUBLE } from './data.js';
import { chance, manhattan } from './util.js';
import { t } from './i18n.js';

/** Which club handles which kind of trouble. */
export const CLUB_FOR = Object.fromEntries(Object.values(CLUBS).map((c) => [c.trouble, c.id]));

export class Troubles {
  constructor(game) { this.game = game; this.today = { dash: 0, rude: 0 }; }

  newDay() { this.today = { dash: 0, rude: 0 }; }

  /** Guests making trouble right now (rude, or running off with the bill). */
  get active() { return this.game.customers.filter((c) => c.trouble && !c.trouble.over); }

  /** Can a new incident of `kind` start now? */
  allowed(kind) {
    const g = this.game, T = TROUBLE[kind];
    if (g.visit || g.state.level < T.level || this.today[kind] >= T.perDay) return false;
    return !this.game.customers.some((c) => (c.trouble ? !c.trouble.over && c.trouble.kind === kind : kind === 'rude' && c.rude));
  }
  roll(kind) {
    if (!this.allowed(kind) || !chance(TROUBLE[kind].chance)) return false;
    this.today[kind]++;
    return true;
  }
  /** A guest walking in turns out to be rude. */
  rollRude() { return this.roll('rude'); }
  /** A guest who just finished eating decides to run off without paying. */
  rollDash() { return this.roll('dash'); }

  /** An incident started: tell the player (with a nudge to train someone if nobody can help). */
  started(c, kind) {
    const g = this.game;
    g.sfx('error');
    const club = CLUBS[CLUB_FOR[kind]];
    const trained = g.staff.some((s) => s.clubLv(club.id) > 0);
    const msg = kind === 'rude' ? t('A rude guest is pushing your staff around!') : t('{name} is sneaking off without paying!', { name: c.name });
    g.toast(trained ? msg : msg + ' ' + t('Nobody can stop them yet: train someone at the {club} (Training tab).', { club: club.name }), 'bad');
    g.changed('trouble');
  }

  /** Staff who could deal with this troublemaker now, nearest first. */
  responders(c) {
    const club = CLUB_FOR[c.trouble.kind];
    return this.game.staff
      .filter((s) => s.clubLv(club) > 0 && !s.napping && !s.trouble && s.x >= 0)
      .sort((a, b) => manhattan(a.tx, a.ty, c.tx, c.ty) - manhattan(b.tx, b.ty, c.tx, c.ty));
  }

  /** Every step: whoever trained for it goes after each troublemaker, after a moment to notice. */
  update(dt) {
    for (const c of this.active) {
      const tr = c.trouble;
      if (tr.by && !this.game.staff.includes(tr.by)) tr.by = null;   // let go mid-chase
      if (tr.by || (tr.seen = (tr.seen || 0) + dt) < TROUBLE.react) continue;
      const who = this.responders(c)[0];
      if (!who) continue;   // nobody trained, or they're all napping or busy: try again next step
      tr.by = who;
      if (tr.kind === 'rude') who.goBat(c); else who.goChase(c);
      this.game.changed('trouble');
    }
  }
}
