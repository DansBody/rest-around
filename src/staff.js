// Staff brain: claim jobs from the board and run them as scripted action sequences.
// Energy drains while working; at zero the staff member finishes nothing new and naps until
// rested (slowly) or fed a snack (instantly).
import { Agent } from './agent.js';
import { roleLook } from './looks.js';
import { JOB_LABEL } from './jobs.js';
import { dishById, furnitureById, ROLES, STAFF_NAMES, SPEED, ENERGY, SKILL, skillLevel } from './data.js';
import { choice, rand, randInt, manhattan, uid } from './util.js';

export function makeStaff(game, role, name) {
  const used = new Set(game.staff.map((s) => s.name));
  const free = STAFF_NAMES.filter((n) => !used.has(n));
  return new Staff(game, role, name || choice(free.length ? free : STAFF_NAMES), roleLook(role));
}

export class Staff extends Agent {
  constructor(game, role, name, look) {
    super(game, 'staff', name, look);
    this.role = role;
    this.energy = 100;
    this.speed = SPEED.staff * rand(0.95, 1.05);
    this.job = null;
    this.napping = false;
    this.staffId = uid();
    this.skills = {}; // role -> XP
  }

  // ---------------- skill ----------------
  xpIn(role = this.role) { return this.skills[role] || 0; }
  skillLv(role = this.role) { return skillLevel(this.xpIn(role)); }
  get skillMul() { return SKILL.mul[this.skillLv() - 1]; }
  /** Scaled duration of a timed action (skilled staff work faster). */
  dur(sec) { return sec / this.skillMul; }
  gainXp(n) {
    const before = this.skillLv();
    this.skills[this.role] = this.xpIn() + n;
    const lv = this.skillLv();
    if (lv > before) {
      const g = this.game;
      g.toast(`${this.name} is now ${/^[AEIOU]/.test(SKILL.titles[lv - 1]) ? 'an' : 'a'} ${SKILL.titles[lv - 1]} ${this.roleName}! (+${Math.round((SKILL.mul[lv - 1] - 1) * 100)}% speed)`, 'good');
      g.fx.sparkle(g.at(this.x + 0.5, this.y + 0.5, 60), 10, '#ffd86b');
      this.emote('emote_sparkle', 2);
      this.hop();
      g.sfx('levelup');
      g.changed('staff');
    }
  }
  /** Switch job. The current task goes back on the board; experience in every role is kept. */
  changeRole(role) {
    if (role === this.role || !ROLES[role]) return;
    if (this.job) this.abortJob(true);
    this.role = role;
    if (role === 'chef') this.look.roleHat = 'chef';
    else if (this.look.roleHat === 'chef') this.look.roleHat = null;
    this.game.refreshCharacter(this);
    this.game.fx.sparkle(this.game.at(this.x + 0.5, this.y + 0.5, 60), 12, '#bfe3ff');
    this.emote('emote_sparkle', 2);
    this.hop();
  }

  canNudge() { return !this.job && !this.napping; }
  stateLabel() { return `${this.task} ⚡${Math.round(this.energy)}`; }
  get roleName() { return ROLES[this.role].name; }

  update(dt) {
    if (this.job && this.job.canceled) this.abortJob();
    this.speedMul = this.skillMul;
    super.update(dt);
    if (this.job) this.energy = Math.max(0, this.energy - ENERGY.drainPerSec * dt);
  }

  think() {
    const g = this.game;
    if (this.napping) return;
    if (this.energy <= 0) return this.startNap();
    const j = g.jobs.pick(this);
    if (j) return this.startJob(j);
    this.idle();
  }

  // ---------------- idle ----------------
  home() {
    const w = this.game.world;
    const kinds = { chef: 'stove', bartender: 'bar', cleaner: null, waiter: 'table' };
    const k = kinds[this.role];
    const list = k ? w.byKind(k) : [];
    if (list.length) { const f = list[randInt(0, list.length - 1)]; return { x: f.x, y: f.y }; }
    return { x: randInt(0, w.size - 1), y: randInt(0, w.size - 1) };
  }
  idle() {
    const g = this.game;
    this.task = 'Idle';
    if (Math.random() < 0.55) {
      const h = this.home();
      const t = g.freeTileNear(h.x, h.y, true, (x, y) => manhattan(x, y, h.x, h.y) <= 3 && Math.random() < 0.6) || g.freeTileNear(this.tx, this.ty);
      if (t && (t.x !== this.tx || t.y !== this.ty)) this.walk(t.x, t.y, { onFail: () => {} });
    }
    this.wait(rand(1.5, 4), null, { until: () => g.jobs.pending(this.role).some((j) => j.type !== 'cook' && j.type !== 'drink' || g.jobs.freeStation(j.type === 'cook' ? 'stove' : 'bar', this)) });
  }

  // ---------------- jobs ----------------
  startJob(j) {
    this.job = j;
    this.task = JOB_LABEL[j.type];
    const g = this.game, w = g.world;
    const fail = () => this.abortJob(true);
    const seatGoals = (seat) => w.accessFor(seat.chair);
    const alive = (f) => w.furniture.includes(f);
    switch (j.type) {
      case 'order': {
        const c = j.customer, seat = j.seat;
        this.walk(0, 0, { goals: seatGoals(seat), onFail: fail });
        this.face({ x: seat.chair.x, y: seat.chair.y });
        this.wait(this.dur(1.0), 'talk');
        this.do(() => {
          if (c.state === 'waitOrder') c.takeOrder(this);
          // take everyone else's order at this table in the same visit
          const others = (seat.table.seats || []).map((s2) => s2.customer).filter((o) => o && o !== c && o.state === 'waitOrder' && o.orderJob && !o.orderJob.assignee);
          for (const o of others) { g.jobs.cancel(o.orderJob); o.orderJob = null; }
          if (others.length) {
            this.wait(this.dur(0.5 * others.length), 'talk');
            this.do(() => { for (const o of others) if (o.state === 'waitOrder') o.takeOrder(this); this.finishJob(); });
          } else this.finishJob();
        });
        break;
      }
      case 'cook':
      case 'drink': {
        // chefs cook at a stove, bartenders mix at the bar; the result waits on the counter for a waiter
        const st = j.station, isDrink = j.type === 'drink';
        this.walk(0, 0, { goals: w.accessFor(st), onFail: fail });
        this.face({ x: st.x, y: st.y });
        this.do(() => {
          const t = j.ticket;
          if (!alive(st) || t.state !== 'queued') return fail();
          st.cooking = t; st.cookT = 0; st.cookTotal = this.dur(dishById[t.dish].cook / (furnitureById[st.type].speed || 1));
          t.state = 'cooking'; t.station = st;
          if (isDrink) this.held = { id: 'held_shaker' };
          g.sfx(isDrink ? 'shake' : 'sizzle');
        });
        this.wait(0, isDrink ? 'shake' : 'cook', {
          until: () => st.cookT >= st.cookTotal,
          every: (dt) => { st.cookT += dt; if (!isDrink && Math.random() < dt * 3) g.fx.puff(g.at(st.x + st.fp[0] / 2, st.y + st.fp[1] / 2, 60), '#ffffff'); },
        });
        this.do(() => {
          const t = j.ticket;
          st.cooking = null; st.ready = t; st.reservedBy = null; t.state = 'ready';
          t.deliverJob = g.jobs.add('deliver', { ticket: t, stove: st, customer: t.customer });
          this.held = null;
          g.sfx('ding');
          this.finishJob();
        });
        break;
      }
      case 'deliver': {
        const st = j.stove, t = j.ticket;
        this.walk(0, 0, { goals: w.accessFor(st), onFail: fail });
        this.face({ x: st.x, y: st.y });
        this.do(() => {
          if (st.ready !== t) return fail();
          st.ready = null; t.state = 'carrying';
          this.held = { id: 'held_tray', dish: dishById[t.dish].asset };
        });
        this.walk(0, 0, { goals: seatGoals(t.seat), onFail: fail });
        this.face({ x: t.seat.chair.x, y: t.seat.chair.y });
        this.wait(0.25, 'carry');
        this.do(() => { this.held = null; t.customer.receive(t); this.finishJob(); });
        break;
      }
      case 'clear': {
        const seat = j.seat;
        this.walk(0, 0, { goals: seatGoals(seat), onFail: fail });
        this.face({ x: seat.table.x, y: seat.table.y });
        this.wait(this.dur(0.9), 'cook');
        this.do(() => {
          seat.dirty = false;
          g.fx.sparkle(g.at(seat.table.x + 0.5, seat.table.y + 0.5, 40), 5, '#ffffff');
          this.held = { id: 'held_tray', dish: 'dirty_plate' };
        });
        this.wait(0.35, 'carry');
        this.do(() => { this.held = null; this.finishJob(); });
        break;
      }
      case 'sweep': {
        const tr = j.trash;
        tr.claimed = this;
        this.walk(tr.x, tr.y, { onFail: fail });
        this.do(() => { this.held = { id: 'held_broom' }; g.sfx('sweep'); });
        this.wait(this.dur(1.5), 'sweep', { every: (dt) => { if (Math.random() < dt * 5) g.fx.puff(g.at(tr.x + 0.5, tr.y + 0.5, 4), '#e8ddd0'); } });
        this.do(() => {
          g.world.removeTrash(tr);
          g.fx.sparkle(g.at(tr.x + 0.5, tr.y + 0.5, 10), 6, '#fff6c2');
          this.held = null;
          this.finishJob();
        });
        break;
      }
      case 'repair': {
        const f = j.target;
        this.walk(0, 0, { goals: w.accessFor(f), onFail: fail });
        this.face({ x: f.x, y: f.y });
        this.do(() => { this.held = { id: 'held_wrench' }; g.sfx('repair'); });
        this.wait(this.dur(3), 'repair', { every: (dt) => { if (Math.random() < dt * 4) g.fx.sparkle(g.at(f.x + 0.5, f.y + 0.5, 50), 2, '#ffd86b'); } });
        this.do(() => {
          if (alive(f)) g.eco.repairFacility(f);
          this.held = null;
          this.finishJob();
        });
        break;
      }
    }
  }

  finishJob() {
    const j = this.job;
    if (j) { this.game.jobs.finish(j); j.assignee = null; }
    if (j && j.role === this.role) this.gainXp(SKILL.xp[j.type] || 1);
    this.job = null;
    this.task = 'Idle';
    this.waitMode = null;
  }

  /** Stop the current job. retry=true hands it back to the board (e.g. path failure). */
  abortJob(retry = false) {
    const g = this.game;
    const j = this.job;
    this.clearQueue();
    this.waitMode = null;
    if (this.held) {
      g.fx.puff(g.at(this.x, this.y, 50), '#efe6dc', 3);
      this.held = null;
    }
    if (j) {
      const st = j.station;
      if (st && st.reservedBy === this) {
        st.reservedBy = null;
        if (j.ticket && st.cooking === j.ticket) { st.cooking = null; st.cookT = 0; }
      }
      if (j.trash && j.trash.claimed === this) j.trash.claimed = null;
      j.assignee = null;
      j.station = null;
      if (retry && !j.canceled) {
        j.fails = (j.fails || 0) + 1;
        if (j.fails > 4) g.jobs.cancel(j);
        // a ticket that was already picked up can't be retried by someone else
        if (j.type === 'deliver' && j.ticket.state === 'carrying') { j.ticket.state = 'ready'; if (j.stove && !j.stove.ready) j.stove.ready = j.ticket; }
        if (j.type === 'drink' && j.ticket.state !== 'queued') j.ticket.state = 'queued';
      }
    }
    this.job = null;
    this.task = 'Idle';
    if (retry) this.wait(0.8);
  }

  // ---------------- energy ----------------
  startNap() {
    const g = this.game;
    this.napping = true; this.task = 'Napping (out of energy)';
    const t = g.freeTileNear(this.tx, this.ty);
    if (t && (t.x !== this.tx || t.y !== this.ty)) this.walk(t.x, t.y, { onFail: () => {} });
    this.do(() => { this.bubble = { icon: 'emote_zzz', t0: g.renderTime, until: Infinity }; g.sfx('yawn'); });
    this.wait(0, 'nap', { until: () => this.energy >= ENERGY.wakeAt, every: (dt) => { this.energy = Math.min(100, this.energy + ENERGY.napRegen * dt); } });
    this.do(() => this.wake());
  }
  wake() {
    this.napping = false;
    this.bubble = null;
    this.task = 'Idle';
    this.hop();
  }
  feed(snack) {
    this.energy = Math.min(100, this.energy + snack.energy);
    if (this.napping && this.energy >= 10) { this.clearQueue(); this.waitMode = null; this.wake(); }
    this.emote('emote_heart', 1.5);
    this.hop();
  }

}
