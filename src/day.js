// Day cycle: compressed day (8 real minutes at 1x) with opening, lunch rush, afternoon, dinner rush
// and closing; customer arrivals scale with rating, phase and seating; end-of-day summary.
import { DAY, ENERGY, COSTS } from './data.js';
import { clamp } from './util.js';
import { t } from './i18n.js';

export class DayCycle {
  constructor(game) {
    this.game = game;
    this.nextSpawn = 3;
    this.closing = false;
    this.lingerT = 0;
  }

  freshStats() {
    const s = this.game.state;
    return { served: 0, lost: 0, noSeat: 0, coins: 0, points: 0, ratingStart: s.rating, levelStart: s.level, spent: 0, restocked: 0, wages: 0, rent: 0, soldOut: 0, dashed: 0 };
  }

  get hour() { return DAY.startHour + (this.game.state.clock / DAY.length) * (DAY.endHour - DAY.startHour); }
  get phase() {
    const h = this.hour;
    let p = DAY.phases[0];
    for (const ph of DAY.phases) if (h >= ph.from) p = ph;
    return p;
  }
  get isOpen() { return this.hour < DAY.lastCallHour; }

  /** Expected arrivals per sim second. */
  arrivalRate() {
    const g = this.game;
    const seats = Math.max(1, g.world.seats.length);
    const perHour = (0.6 + g.state.rating * 0.78) * this.phase.mult * (0.55 + 0.45 * Math.sqrt(Math.min(seats, 24) / 4));
    const simSecPerHour = DAY.length / (DAY.endHour - DAY.startHour);
    return perHour / simSecPerHour;
  }

  update(dt) {
    const g = this.game, s = g.state;
    if (g.paused) return;
    s.clock += dt;
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
    if (s.clock >= DAY.length) {
      // closing: wait for the last guests (they always leave via patience) then summarize
      this.lingerT += dt;
      if (!g.customers.length || this.lingerT > 90) this.endDay();
    }
  }

  endDay() {
    const g = this.game, s = g.state;
    for (const c of g.customers) { c.cancelOrders(); c.gone = true; c.releaseAll(); }
    g.agents = g.agents.filter((a) => !a.gone);
    g.eco.payDay();
    const summary = { day: s.day, ...s.stats, ratingEnd: s.rating, levelEnd: s.level, owed: s.unpaid };
    s.totals.days++;
    g.paused = true;
    this.lingerT = 0;
    g.emit('dayEnd', summary);
    g.sfx('fanfare');
  }

  startNextDay() {
    const g = this.game, s = g.state;
    s.day++;
    s.clock = 0;
    s.stats = this.freshStats();
    g.eco.rollQuest();
    g.troubles.newDay();
    if (s.unpaid) {   // payday came up short: the team is grumpy and starts the day tired
      for (const st of g.staff) st.energy = Math.max(10, st.energy - COSTS.unpaidEnergy);
      s.unpaid = false;
      g.toast(t('Wages went unpaid yesterday — the team starts the day tired.'), 'bad');
    }
    g.eco.autoRestock();
    g.timeStopT = 0; g.spotlight = null;
    for (const st of g.staff) { st.resetKit(); st.energy = Math.min(100, st.energy + ENERGY.overnight); if (st.napping && st.energy >= ENERGY.wakeAt) { st.clearQueue(); st.wake(); } }
    g.jobs.list = g.jobs.list.filter((j) => j.type === 'sweep' || j.type === 'repair' || j.type === 'clear');
    this.nextSpawn = 4;
    g.paused = false;
    g.emit('dayStart', s.day);
    g.changed('day');
  }
}
