// Day cycle: compressed day (8 real minutes at 1x) with opening, lunch rush, afternoon, dinner rush
// and closing; customer arrivals scale with rating, phase and seating; end-of-day summary.
import { DAY, ENERGY } from './data.js';
import { bus, clamp } from './util.js';

export class DayCycle {
  constructor(game) {
    this.game = game;
    this.nextSpawn = 3;
    this.closing = false;
    this.lingerT = 0;
  }

  freshStats() {
    const s = this.game.state;
    return { served: 0, lost: 0, noSeat: 0, coins: 0, points: 0, ratingStart: s.rating, levelStart: s.level, spent: 0 };
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
    const perHour = (1.1 + g.state.rating * 1.05) * this.phase.mult * (0.7 + 0.3 * Math.min(seats, 20) / 4);
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
    const summary = { day: s.day, ...s.stats, ratingEnd: s.rating, levelEnd: s.level };
    s.totals.days++;
    g.paused = true;
    this.lingerT = 0;
    bus.emit('dayEnd', summary);
    g.sfx('fanfare');
  }

  startNextDay() {
    const g = this.game, s = g.state;
    s.day++;
    s.clock = 0;
    s.stats = this.freshStats();
    for (const st of g.staff) { st.energy = Math.min(100, st.energy + ENERGY.overnight); if (st.napping && st.energy >= ENERGY.wakeAt) { st.clearQueue(); st.wake(); } }
    g.jobs.list = g.jobs.list.filter((j) => j.type === 'sweep' || j.type === 'repair' || j.type === 'clear');
    this.nextSpawn = 4;
    g.paused = false;
    bus.emit('dayStart', s.day);
    g.changed('day');
  }
}
