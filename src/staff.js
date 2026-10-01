// Staff brain: claim jobs from the board and run them as scripted action sequences.
// Energy drains while working; at zero the staff member finishes nothing new and naps until
// rested (slowly) or fed a snack (instantly).
import { Agent } from './agent.js';
import { staffLook, nextCast } from './looks.js';
import { JOB_LABEL } from './jobs.js';
import { dishById, furnitureById, ROLES, UNIQUE_NAMES, SPEED, ENERGY, SKILL, skillLevel, ABILITIES, ABILITY_UNLOCK_LV, ABILITY } from './data.js';
import { rand, randInt, manhattan, uid, bus } from './util.js';
import { t, titledRole } from './i18n.js';

/** A new staff member: `model` (or the next original character nobody wears), named after it. Null when the cast is used up. */
export function makeStaff(game, role, model) {
  model = model || nextCast(new Set(game.staff.map((s) => s.look.model)));
  return model ? new Staff(game, role, UNIQUE_NAMES[model], staffLook(model, role)) : null;
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
    this.charge = 0;     // 0..1 ability charge
    this.fullT = 0;      // seconds the ability has been sitting fully charged
    this.windup = 0;     // >0 while gathering power right before release
    this.spinT = 0;      // whirlwind spin (visual)
    this.boostT = 0;     // seconds left on a timed ability (dash / showtime / juggle)
    this.boostRole = null;
  }

  // ---------------- ability (charges while working, fires by itself) ----------------
  get ability() { return ABILITIES[this.role]; }
  abilityUnlocked() { return this.skillLv() >= ABILITY_UNLOCK_LV; }
  /** Seconds of work to charge fully (faster for Expert/Master). */
  chargeTime() { return this.ability.charge * (1 - ABILITY.chargePerLv * Math.max(0, this.skillLv() - ABILITY_UNLOCK_LV)); }
  boosted() { return this.boostT > 0 && this.boostRole === this.role; }
  /** Multiplier on how fast timed work (cooking, mixing, talking…) progresses. */
  workMul() {
    const ab = this.ability;
    return this.skillMul * (this.boosted() ? (ab.work || ab.speed || 1) : 1);
  }
  updateAbility(dt) {
    const g = this.game;
    if (this.spinT > 0) this.spinT = Math.max(0, this.spinT - dt);
    if (this.windup > 0) {
      this.windup -= dt;
      if (Math.random() < dt * 30) g.fx.gather(g.at(this.x, this.y, 45), this.ability.color, 1);
      if (this.windup <= 0) { this.windup = 0; this.useAbility(); }
      return;
    }
    if (!this.abilityUnlocked() || this.napping || g.paused || this.boosted()) return;
    if (this.charge < 1) {
      this.charge = Math.min(1, this.charge + (dt / this.chargeTime()) * (this.job ? 1 : ABILITY.idleCharge));
      this.fullT = 0;
      return;
    }
    this.fullT += dt;
    if (this.goodMoment(this.fullT > ABILITY.impatientAfter)) {
      // gather power for a moment (visible build-up), then release
      this.windup = ABILITY.windup;
      g.sfx('charge');
      bus.emit('abilityWindup', this);
    }
  }
  /** Is now worth spending the charge? `eager` lowers the bar after waiting a while. */
  goodMoment(eager) {
    const g = this.game, ab = this.ability, j = this.job;
    switch (ab.id) {
      case 'dash': {
        if (!j || !['order', 'deliver', 'clear'].includes(j.type)) return false;
        const queued = g.jobs.pending('waiter').length;
        const c = j.customer || (j.ticket && j.ticket.customer);
        return eager || queued >= 2 || (c && c.showPatience && c.patience < 0.5);
      }
      case 'showtime':
      case 'juggle': {
        const st = j && j.station;
        return !!(st && st.cooking && st.cookTotal > 0 && st.cookT / st.cookTotal < (eager ? 0.8 : 0.5));
      }
      case 'whirlwind':
        return this.trashNear().length >= (eager ? 1 : 2);
    }
    return false;
  }
  trashNear() { const r = this.ability.radius || 0; return this.game.world.trash.filter((t) => Math.abs(t.x - this.tx) + Math.abs(t.y - this.ty) <= r); }
  useAbility() {
    const g = this.game, ab = this.ability;
    this.charge = 0; this.fullT = 0; this.windup = 0;
    const at = g.at(this.x, this.y, 60);
    if (ab.dur) { this.boostT = ab.dur; this.boostRole = this.role; }
    if (ab.boost) {
      // push the dish/drink currently on the station ahead
      const st = this.job && this.job.station;
      if (st && st.cooking) { st.cookT = Math.min(st.cookTotal, st.cookT + st.cookTotal * ab.boost); g.fx.puff(g.at(st.x + st.fp[0] / 2, st.y + st.fp[1] / 2, 60), ab.color, 6); }
    }
    bus.emit('ability', this);
    if (ab.id === 'whirlwind') {
      this.spinT = 0.8;
      const near = this.trashNear();
      for (const t of near) {
        g.world.removeTrash(t);
        g.fx.puff(g.at(t.x + 0.5, t.y + 0.5, 6), '#e8ddd0', 3);
        g.fx.sparkle(g.at(t.x + 0.5, t.y + 0.5, 12), 5, '#fff6c2');
      }
      if (near.length) this.gainXp(near.length * (SKILL.xp.sweep || 1));
      g.fx.title(g.at(this.x, this.y, 95), t('{ability}!', { ability: ab.name }) + (near.length > 1 ? ` ×${near.length}` : ''), ab.color);
    } else g.fx.title(g.at(this.x, this.y, 95), t('{ability}!', { ability: ab.name }), ab.color);
    g.fx.sparkle(at, 22, ab.color);
    g.fx.sparkle(at, 10, '#ffffff');
    this.emote('emote_sparkle', 1.5);
    this.hop();
    g.sfx('ability');
    g.sfx(ab.id === 'whirlwind' ? 'sweep' : ab.id === 'showtime' ? 'sizzle' : ab.id === 'juggle' ? 'shake' : 'pop');
  }

  // ---------------- skill ----------------
  xpIn(role = this.role) { return this.skills[role] || 0; }
  skillLv(role = this.role) { return skillLevel(this.xpIn(role)); }
  get skillMul() { return SKILL.mul[this.skillLv() - 1]; }
  /** Scaled duration of a timed action (skilled staff work faster). */
  dur(sec) { return sec / this.workMul(); }
  gainXp(n) {
    const before = this.skillLv();
    this.skills[this.role] = this.xpIn() + n;
    const lv = this.skillLv();
    if (lv > before) {
      const g = this.game;
      const title = titledRole(SKILL.titles[lv - 1], this.roleName);
      g.toast(t(/^[AEIOU]/.test(title) ? '{name} is now an {title}! (+{n}% speed)' : '{name} is now a {title}! (+{n}% speed)', { name: this.name, title, n: Math.round((SKILL.mul[lv - 1] - 1) * 100) }), 'good');
      g.fx.sparkle(g.at(this.x, this.y, 60), 10, '#ffd86b');
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
    this.charge = 0; this.fullT = 0;
    if (role === 'chef') this.look.roleHat = 'chef';
    else if (this.look.roleHat === 'chef') this.look.roleHat = null;
    this.game.refreshCharacter(this);
    this.game.fx.sparkle(this.game.at(this.x, this.y, 60), 12, '#bfe3ff');
    this.emote('emote_sparkle', 2);
    this.hop();
  }

  canNudge() { return !this.job && !this.napping; }
  stateLabel() { return `${this.task} ⚡${Math.round(this.energy)}`; }
  get roleName() { return ROLES[this.role].name; }

  update(dt) {
    if (this.job && this.job.canceled) this.abortJob();
    this.updateAbility(dt);
    if (this.boostT > 0) {
      this.boostT = Math.max(0, this.boostT - dt);
      const g = this.game;
      if (this.boosted() && Math.random() < dt * 8) g.fx.puff(g.at(this.x, this.y, this.role === 'waiter' ? 4 : 50), this.ability.color, 1);
    }
    this.speedMul = this.skillMul * (this.boosted() && this.ability.speed ? this.ability.speed : 1);
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
          st.cooking = t; st.cookT = 0; st.cookTotal = dishById[t.dish].cook / (furnitureById[st.type].speed || 1) / this.skillMul; // abilities speed up cookT instead
          t.state = 'cooking'; t.station = st;
          if (isDrink) this.held = { id: 'held_shaker' };
          g.sfx(isDrink ? 'shake' : 'sizzle');
        });
        this.wait(0, isDrink ? 'shake' : 'cook', {
          until: () => st.cookT >= st.cookTotal,
          every: (dt) => { st.cookT += dt * (this.boosted() ? this.ability.work || 1 : 1); if (!isDrink && Math.random() < dt * 3) g.fx.puff(g.at(st.x + st.fp[0] / 2, st.y + st.fp[1] / 2, 60), '#ffffff'); },
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
