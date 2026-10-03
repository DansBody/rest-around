// Round cycle, on the wall clock (see clock.js): every 2 real hours the café opens at 08:00, goes through the
// brunch and tea-time rushes, closes at 22:00 (wages and rent, and a receipt for the round) and has a short
// night in which the team rests, until the next round opens. Nothing waits for the player: when the game
// was not running (build mode, a hidden tab, a mini-game) it catches up to the wall clock (Game.catchUp).
import { DAY, NIGHT, ENERGY, COSTS } from './data.js';
import { clamp } from './util.js';
import { t } from './i18n.js';
import { hourAt, roundAt, clockAt, localDay, localTz, wallSec } from './clock.js';

export class DayCycle {
  constructor(game) {
    this.game = game;
    this.nextSpawn = 3;
    this.lingerT = 0;
  }

  freshStats() {
    const s = this.game.state;
    return { served: 0, lost: 0, noSeat: 0, coins: 0, points: 0, ratingStart: s.rating, levelStart: s.level, spent: 0, restocked: 0, wages: 0, rent: 0, soldOut: 0, dashed: 0, closed: false, open: 0 };
  }

  get hour() { return hourAt(this.game.state.clock); }
  get phase() {
    const h = this.hour;
    if (h >= DAY.endHour) return NIGHT;
    let p = DAY.phases[0];
    for (const ph of DAY.phases) if (h >= ph.from) p = ph;
    return p;
  }
  get isOpen() { return this.hour < DAY.lastCallHour; }
  get isNight() { return this.game.state.clock >= DAY.length; }

  /** Where the wall clock says this café is, as absolute sim seconds (round × DAY.round + clock). */
  wallPos(now = Date.now()) { return wallSec(now, this.game.state.tz) + (this.game.clockSkew || 0); }
  pos() { const s = this.game.state; return s.round * DAY.round + s.clock; }

  /** Expected arrivals per sim second. */
  arrivalRate() {
    const g = this.game;
    const seats = Math.max(1, g.world.seats.length);
    const perHour = (0.6 + g.state.rating * 0.78) * this.phase.mult * (0.55 + 0.45 * Math.sqrt(Math.min(seats, 24) / 4));
    return perHour / DAY.pace;
  }

  update(dt) {
    const g = this.game, s = g.state;
    s.clock += dt;
    if (s.clock < DAY.length) s.stats.open = (s.stats.open || 0) + dt;   // opening hours traded live: what payday charges for
    if (this.isOpen) {
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0) {
        const c = g.spawnCustomer();
        if (c) {
          const r = this.arrivalRate();
          // exponential inter-arrival, capped so the room never feels dead
          this.nextSpawn = clamp(-Math.log(1 - Math.random()) / r, 1.5, g.customers.length ? 26 : 12);
        } else this.nextSpawn = 0.6; // doorway busy, retry shortly
      }
    }
    if (s.clock >= DAY.length && !s.stats.closed) {
      // closing: wait for the last guests (they always leave via patience), then close the books
      this.lingerT += dt;
      if (!g.customers.length || this.lingerT > 90) this.closeRound();
    }
    if (this.isNight) for (const st of g.staff) {   // the team rests through the night
      st.energy = Math.min(100, st.energy + ENERGY.napRegen * dt);
      if (st.napping && st.energy >= 100) { st.clearQueue(); st.wake(); }
    } else {
      // the old 8-minute day ended in a night's rest (ENERGY.overnight) every DAY.pace × 14 seconds; a round
      // keeps that rest, spread over the opening hours, so the team lasts as long per real minute as it did
      const rest = ENERGY.overnight / (DAY.pace * (DAY.endHour - DAY.startHour)) * dt;
      for (const st of g.staff) st.energy = Math.min(100, st.energy + rest);
    }
    if (s.clock >= DAY.round) this.openRound();
  }

  /** 22:00 and the last guest gone: pay the team and the landlord, and hand the player the round's receipt. */
  closeRound() {
    const g = this.game, s = g.state;
    for (const c of g.customers) { c.cancelOrders(); c.gone = true; c.releaseAll(); }
    g.agents = g.agents.filter((a) => !a.gone);
    g.eco.payDay(Math.min(1, (s.stats.open || 0) / DAY.length));
    s.stats.closed = true;
    const summary = { round: s.round, ...s.stats, ratingEnd: s.rating, levelEnd: s.level, owed: s.unpaid };
    s.totals.rounds = (s.totals.rounds || 0) + 1;
    this.lingerT = 0;
    if (g.fastForwarding) (g.ffRounds || (g.ffRounds = [])).push(summary);
    g.emit('roundEnd', summary);
    if (!g.fastForwarding) g.sfx('fanfare');
  }

  /** The next round opens at 08:00. */
  openRound() {
    const g = this.game, s = g.state;
    if (!s.stats.closed) this.closeRound();   // never skip payday
    s.round++;
    s.clock = Math.max(0, s.clock - DAY.round);
    this.fresh();
    g.eco.autoRestock();
    this.nextSpawn = 4;
    g.emit('roundStart', s.round);
    g.changed('day');
  }

  /** What every new round starts with (also after jumping the clock forward). */
  fresh() {
    const g = this.game, s = g.state;
    s.stats = this.freshStats();
    g.troubles.newDay();
    g.eco.checkDate();
    if (s.unpaid) {   // payday came up short: the team is grumpy and starts the round tired
      for (const st of g.staff) st.energy = Math.max(10, st.energy - COSTS.unpaidEnergy);
      s.unpaid = false;
      g.toast(t('Wages went unpaid last round — the team starts tired.'), 'bad');
    }
    g.timeStopT = 0; g.spotlight = null;
    for (const st of g.staff) st.resetKit();
    g.jobs.list = g.jobs.list.filter((j) => j.type === 'sweep' || j.type === 'repair' || j.type === 'clear');
  }

  /**
   * Put the café straight onto the wall clock without playing the time in between (a save just settled by
   * offline.js, a friend's café, a clock that ran ahead). A new round starts fresh; the time skipped earns nothing.
   */
  snap(now = Date.now()) {
    const g = this.game, s = g.state;
    s.tz = g.visit ? s.tz : localTz();
    const round = roundAt(now + (g.clockSkew || 0) * 1000, s.tz), clock = clockAt(now + (g.clockSkew || 0) * 1000, s.tz);
    const newRound = round !== s.round;
    s.round = round; s.clock = clock;
    if (newRound) {
      for (const c of g.customers) { c.cancelOrders(); c.gone = true; c.releaseAll(); }
      g.agents = g.agents.filter((a) => !a.gone);
      this.fresh();
      if (this.isNight) s.stats.closed = true;   // closed while nobody watched: no payday owed
    }
    this.lingerT = 0;
    this.nextSpawn = 3;
    g.changed('day');
  }

  /** The player's calendar day now (for the daily goal and gift). */
  today(now = Date.now()) { return localDay(now, this.game.state.tz); }
}
