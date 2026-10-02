// Staff brain: claim jobs from the board and run them as scripted action sequences.
// Energy drains while working; at zero the staff member finishes nothing new and naps until
// rested (slowly) or fed a snack (instantly).
import { Agent } from './agent.js';
import { staffLook, nextCast } from './looks.js';
import { JOB_LABEL } from './jobs.js';
import { servings } from './pantry.js';
import { freeSlot, slotOfTicket, putBack } from './pastry.js';
import { dishById, furnitureById, ingById, ingIcon, EXTRA_CAT, ROLES, UNIQUE_NAMES, SPEED, ENERGY, SKILL, skillLevel, ABILITIES, ABILITY_UNLOCK_LV, ABILITY, KITS } from './data.js';
import { CASTS } from './kits.js';
import { rand, randInt, manhattan, uid } from './util.js';
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
    this.kitCd = 0;      // seconds until the character's active skill can be cast again
    this.kitT = 0;       // seconds left of a timed active skill (time pause, spotlight): shows the aura
    this.auraT = 0; this.auraMul = 1;   // a colleague's Caffeine Boost, lapses when they walk away
    this.buffT = 0; this.buffMul = 1;   // Wild Magic's gust of haste
  }

  // ---------------- character kit (perks + a castable skill, see KITS) ----------------
  get kit() { return KITS[this.look.model] || { perks: [], active: null }; }
  perk(id) { return this.kit.perks.find((p) => p.id === id) || null; }
  /** Best skill level across every job they have worked in. */
  bestLv() { return Math.max(...Object.keys(ROLES).map((r) => this.skillLv(r))); }
  kitUnlocked() { return !!this.kit.active && this.bestLv() >= ABILITY_UNLOCK_LV; }
  kitReady() { return this.kitUnlocked() && this.kitCd <= 0 && !this.napping && !this.game.paused; }
  /** Speed multiplier from perks and drawbacks: applies to walking and to work. */
  kitMul() {
    let m = this.auraMul * this.buffMul;
    const night = this.perk('night'), shy = this.perk('shy');
    if (night && this.game.day.hour >= night.from) m *= night.mul;
    if (shy && shy.roles.includes(this.role)) m *= shy.mul;
    return m;
  }
  /** …plus what only changes how fast they walk. */
  kitWalkMul() {
    let m = this.kitMul();
    const sprint = this.perk('sprint'), dis = this.perk('dislike');
    if (sprint) m *= sprint.speed;
    if (dis && this.held && this.held.dish === dishById[dis.dish].asset) m *= dis.mul;
    return m;
  }
  /** Cast the active skill (the dock button). False when it isn't ready or has nothing to aim at. */
  castKit() {
    const k = this.kit.active, g = this.game;
    if (!k || !this.kitReady() || !CASTS[k.id](this, g)) return false;
    this.kitCd = k.cooldown; this.kitT = k.dur || 0;
    g.fx.title(g.at(this.x, this.y, 95), t('{ability}!', { ability: k.name }), k.color);
    g.fx.sparkle(g.at(this.x, this.y, 60), 22, k.color);
    g.fx.sparkle(g.at(this.x, this.y, 60), 10, '#ffffff');
    this.emote('emote_sparkle', 1.5);
    this.hop();
    g.sfx('ability');
    this.game.emit('kitCast', this);
    return true;
  }
  resetKit() { this.kitCd = 0; this.kitT = 0; this.auraT = 0; this.auraMul = 1; this.buffT = 0; this.buffMul = 1; }
  updateKit(dt) {
    const g = this.game;
    if (this.kitCd > 0) this.kitCd = Math.max(0, this.kitCd - dt);
    if (this.kitT > 0) this.kitT = Math.max(0, this.kitT - dt);
    if (this.auraT > 0 && (this.auraT -= dt) <= 0) this.auraMul = 1;
    if (this.buffT > 0 && (this.buffT -= dt) <= 0) this.buffMul = 1;
    const aura = this.perk('aura');
    if (aura && !this.napping) {
      for (const o of g.staff) {
        if (o === this || o.napping || manhattan(o.tx, o.ty, this.tx, this.ty) > aura.radius) continue;
        o.auraT = 0.5; o.auraMul = aura.mul;
        if (Math.random() < dt * 1.2) g.fx.steam(g.at(o.x, o.y, 75));
      }
    }
    const night = this.perk('night'), dark = !!night && g.day.hour >= night.from;
    if (dark !== this.dark) { this.dark = dark; if (dark) this.emote('emote_sad', 2.4); }
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
    return this.skillMul * (this.boosted() ? (ab.work || ab.speed || 1) : 1) * this.kitMul();
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
      this.game.emit('abilityWindup', this);
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
    this.game.emit('ability', this);
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

  /**
   * What keeps this staff member from working, phrased as what the player can fix (shown over
   * their head): a missing station, nothing on the menu, an empty pantry. Null when they're just
   * waiting for guests.
   */
  findBlocker() {
    const g = this.game, w = g.world, s = g.state;
    if (this.caseFull) return { icon: 'emote_wait', text: t('Pastry Case is full') };
    if (this.job || this.napping) return null;
    const menuOf = (bake) => Object.keys(s.dishes).filter((id) => s.dishes[id].on && dishById[id].level <= s.level && (dishById[id].cat === EXTRA_CAT) === bake);
    const pantry = (ids) => {
      if (!ids.length) return { icon: 'emote_menu', text: t('Nothing to make on the menu') };
      if (ids.some((id) => g.eco.canMake(id))) return null;
      const ing = dishById[ids[0]].ings.find((i) => servings(s, i) < 1) || dishById[ids[0]].ings[0];
      return { icon: ingIcon(ing), text: t('Out of {ing}', { ing: ingById[ing].name }) };
    };
    const bakeLv = furnitureById.oven_basic.level;
    switch (this.role) {
      case 'chef':
        if (!w.byKind('stove').length) return { icon: 'emote_broken', text: t('Needs an Espresso Station') };
        return pantry(menuOf(false));
      case 'bartender': {
        if (s.level < bakeLv) return { icon: 'emote_zzz', text: t('Bakes unlock at café Lv{n}', { n: bakeLv }) };
        if (!w.byKind('oven').length) return { icon: 'emote_broken', text: t('Needs a Bread Oven') };
        if (!w.byKind('bar').length) return { icon: 'emote_broken', text: t('Needs a Pastry Case') };
        const bakes = menuOf(true);
        if (!bakes.length) return { icon: 'emote_menu', text: t('No bakes on the menu') };
        return pantry(bakes);
      }
      case 'waiter':
        if (!w.seats.length) return { icon: 'emote_broken', text: t('Needs tables & chairs') };
        return null;
    }
    return null;
  }
  updateBlocker(dt) {
    this.blockScanT = (this.blockScanT || 0) - dt;
    if (this.blockScanT > 0) return;
    this.blockScanT = 0.5;
    const b = this.findBlocker();
    // only once it has held for a moment, so it doesn't flicker between jobs
    this.blockForT = b ? (this.blockForT || 0) + 0.5 : 0;
    this.blocker = b && (this.blockForT >= 1.5 || this.caseFull) ? b : null;
  }

  canNudge() { return !this.job && !this.napping; }
  stateLabel() { return `${this.task} ⚡${Math.round(this.energy)}`; }
  get roleName() { return ROLES[this.role].name; }

  update(dt) {
    if (this.job && this.job.canceled) this.abortJob();
    this.updateAbility(dt);
    this.updateKit(dt);
    this.updateBlocker(dt);
    if (this.boostT > 0) {
      this.boostT = Math.max(0, this.boostT - dt);
      const g = this.game;
      if (this.boosted() && Math.random() < dt * 8) g.fx.puff(g.at(this.x, this.y, this.role === 'waiter' ? 4 : 50), this.ability.color, 1);
    }
    this.speedMul = this.skillMul * (this.boosted() && this.ability.speed ? this.ability.speed : 1) * this.kitWalkMul();
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
    const kinds = { chef: 'stove', bartender: 'oven', cleaner: null, waiter: 'table' };
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
    this.wait(rand(1.5, 4), null, { until: () => g.jobs.pending(this.role).some((j) => j.type !== 'cook' && j.type !== 'drink' || g.jobs.freeStation(j.type === 'cook' ? 'stove' : 'oven', this)) });
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
      case 'drink':
      case 'prebake': {
        // baristas brew at an espresso station, bakers bake in an oven; a drink waits on its counter
        // for a server, a bake is first carried over to a pastry case (setOut)
        const st = j.station, isBake = j.type !== 'cook';
        this.walk(0, 0, { goals: w.accessFor(st), onFail: fail });
        this.face({ x: st.x, y: st.y });
        this.do(() => {
          const t = j.ticket;
          if (!alive(st) || t.state !== 'queued') return fail();
          if (j.type === 'prebake' && !t.paid) {   // baking ahead: nobody ordered it, so the ingredients go now
            if (!g.eco.consume(t.dish)) { g.jobs.cancel(j); return this.abortJob(); }
            t.paid = true;
          }
          st.cooking = t; st.cookT = 0; st.cookTotal = dishById[t.dish].cook / (furnitureById[st.type].speed || 1) / this.skillMul; // abilities speed up cookT instead
          t.state = 'cooking'; t.station = st;
          g.sfx('sizzle');
        });
        this.wait(0, 'cook', {
          until: () => st.cookT >= st.cookTotal,
          every: (dt) => {
            st.cookT += dt * (this.boosted() ? this.ability.work || 1 : 1) * this.kitMul();
            if (Math.random() < dt * 3) g.fx.puff(g.at(st.x + st.fp[0] / 2, st.y + st.fp[1] / 2, isBake ? 90 : 60), isBake ? '#f1e3d0' : '#ffffff');
          },
        });
        this.do(() => {
          const t = j.ticket;
          st.cooking = null; st.reservedBy = null;
          g.sfx('ding');
          if (isBake) return this.setOut(j);
          st.ready = t; t.state = 'ready';
          t.deliverJob = g.jobs.add('deliver', { ticket: t, stove: st, customer: t.customer });
          this.finishJob();
        });
        break;
      }
      case 'deliver': {
        const st = j.stove, t = j.ticket;
        this.walk(0, 0, { goals: w.accessFor(st), onFail: fail });
        this.face({ x: st.x, y: st.y });
        this.do(() => {
          if (st.kind === 'bar') {
            const i = slotOfTicket(st, t);
            if (i < 0) return fail();
            st.slots[i] = null;
          } else if (st.ready !== t) return fail();
          else st.ready = null;
          t.state = 'carrying';
          this.held = { id: 'held_tray', dish: dishById[t.dish].asset };
          if (this.perk('dislike') && t.dish === this.perk('dislike').dish) this.emote('emote_sad', 1.6);
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

  /**
   * Second half of a bake: carry it from the oven to a pastry case with an empty shelf. An ordered
   * bake is set aside there for a server; one baked ahead (or whose guest left) becomes stock.
   */
  setOut(j) {
    const g = this.game, w = g.world, t = j.ticket;
    t.state = 'baked'; t.station = null; j.station = null;
    this.task = JOB_LABEL.place;
    this.held = { id: 'held_tray', dish: dishById[t.dish].asset };
    let cs = null;
    this.wait(0, null, {
      until: () => !!(cs = g.jobs.freeCase(this)),
      every: () => { this.caseFull = true; },
      fail: () => !w.byKind('bar').length,
      onFail: () => this.abortJob(true),
    });
    this.do(() => {
      this.caseFull = false;
      const i = freeSlot(cs);
      cs.slots[i] = { res: this }; j.station = cs; j.slot = i;
      this.walk(0, 0, { goals: w.accessFor(cs), onFail: () => this.abortJob(true) });
      this.face({ x: cs.x, y: cs.y });
      this.wait(0.3, 'carry');
      this.do(() => {
        if (!w.furniture.includes(cs) || t.state !== 'baked') return this.abortJob(true);
        const c = t.customer;
        cs.slots[i] = { dish: t.dish, ticket: c ? t : null };
        if (c) {
          t.station = cs; t.state = 'ready';
          t.deliverJob = g.jobs.add('deliver', { ticket: t, stove: cs, customer: c });
        } else t.state = 'stocked';
        j.slot = null;
        this.held = null;
        g.sfx('pop');
        this.finishJob();
      });
    });
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
    this.caseFull = false;
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
      if (st && j.slot != null && st.slots && st.slots[j.slot] && st.slots[j.slot].res === this) st.slots[j.slot] = null;
      j.slot = null;
      if (j.trash && j.trash.claimed === this) j.trash.claimed = null;
      j.assignee = null;
      j.station = null;
      if (retry && !j.canceled) {
        j.fails = (j.fails || 0) + 1;
        if (j.fails > 4) g.jobs.cancel(j);
        // a ticket that was already picked up can't be retried by someone else
        if (j.type === 'deliver' && j.ticket.state === 'carrying') {
          j.ticket.state = 'ready';
          if (j.stove && j.stove.kind === 'bar') { if (slotOfTicket(j.stove, j.ticket) < 0) putBack(j.stove, j.ticket.dish, j.ticket); }
          else if (j.stove && !j.stove.ready) j.stove.ready = j.ticket;
        }
        if ((j.type === 'drink' || j.type === 'prebake') && j.ticket.state !== 'queued') j.ticket.state = 'queued';
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
