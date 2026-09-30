// Customer brain: arrive → find seat (or queue / leave) → order → wait for food → eat → pay →
// maybe restroom / arcade → leave. Patience drains while waiting to be seated, to order, and for food.
import { Agent } from './agent.js';
import { randomLook } from './looks.js';
import { assets } from './assets.js';
import { furnitureById, dishById, CUSTOMER_NAMES, PATIENCE, SPEED, dishPrice, dishPoints } from './data.js';
import { DIRS } from './iso.js';
import { DOOR_Y } from './world.js';
import { choice, chance, rand, manhattan, uid } from './util.js';

export class Customer extends Agent {
  constructor(game) {
    super(game, 'customer', choice(CUSTOMER_NAMES), randomLook());
    this.speed = SPEED.customer * rand(0.88, 1.1);
    this.state = 'enter';
    this.patience = 1;
    this.pRate = 0;
    this.showPatience = false;
    this.seat = null;
    this.tickets = [];
    this.sat = [];
    this.facility = null;
    this.alpha = 0;
    this.gliding = false;
    this.mood = 'Hungry';
    this.orderJob = null;
  }

  canNudge() { return this.state === 'queue' && !this.stepping; }
  stateLabel() { return this.state + (this.showPatience ? ` ${Math.round(this.patience * 100)}%` : ''); }

  update(dt) {
    super.update(dt);
    if (this.gliding) this.moving = true;
    if (this.showPatience && this.pRate > 0) {
      this.patience -= this.pRate * dt;
      if (this.patience <= 0) { this.patience = 0; this.fedUp(); }
    }
  }

  // ---------- arrival ----------
  begin() {
    this.x = 0.12; this.dir = 0; this.task = 'Arriving';
    this.game.openDoor(1.4);
    this.game.sfx('door');
    this.gliding = true;
    this.wait(0.5, null, { every: (dt, a) => { const k = Math.min(1, a.elapsed / 0.5); this.alpha = k; this.x = 0.12 + 0.38 * k; this.phase += dt * this.speed * 5; } });
    this.do(() => { this.gliding = false; this.alpha = 1; this.x = 0.5; this.decide(); });
  }

  decide() {
    const g = this.game;
    const { clean, dirty } = g.world.seats.reduce((acc, s) => {
      if (s.customer || s.reserved || !g.world.accessFor(s.chair).length) return acc;
      (s.dirty ? acc.dirty : acc.clean).push(s);
      return acc;
    }, { clean: [], dirty: [] });
    if (clean.length) return this.gotoSeat(this.pickSeat(clean));
    const queued = g.customers.filter((c) => c.state === 'queue').length;
    if (dirty.length > queued && queued < 3) return this.queueForSeat();
    this.mood = 'No free seats';
    this.leaveUnhappy('noSeat');
  }

  pickSeat(list) {
    // prefer seats whose table has nobody else yet, then nearest
    const e = this.game.world.entry;
    list = list.map((s) => ({ s, d: manhattan(e.x, e.y, s.chair.x, s.chair.y) + (s.table.seats.some((o) => o.customer || o.reserved) ? 4 : 0) + Math.random() * 3 }));
    list.sort((a, b) => a.d - b.d);
    return list[0].s;
  }

  gotoSeat(seat) {
    seat.reserved = this;
    this.seat = seat;
    this.state = 'toSeat'; this.task = 'Walking to a seat'; this.mood = 'Hungry';
    this.showPatience = false;
    const ch = seat.chair;
    this.walk(ch.x, ch.y, { goalOk: true, onFail: () => this.giveUpSeat() });
    this.do(() => this.sitDown());
  }

  giveUpSeat() {
    if (this.seat) { if (this.seat.reserved === this) this.seat.reserved = null; this.seat = null; }
    this.leaveUnhappy('lost');
  }

  queueForSeat() {
    const g = this.game;
    this.state = 'queue'; this.task = 'Waiting for a clean table'; this.mood = 'Waiting';
    this.patience = 1; this.pRate = 1 / PATIENCE.seat; this.showPatience = true;
    const e = g.world.entry;
    const t = g.freeTileNear(e.x, e.y, true, (x, y) => !(x === e.x && y === e.y) && manhattan(x, y, e.x, e.y) <= 4);
    if (t) this.walk(t.x, t.y, { onFail: () => {} });
    this.emote('emote_wait', 2.5);
    this.wait(0, null, { until: () => this.findCleanSeat() != null });
    this.do(() => { const s = this.findCleanSeat(); if (s) { this.sat.push(this.patience); this.gotoSeat(s); } else this.queueForSeat(); });
  }
  findCleanSeat() {
    const g = this.game;
    return g.world.seats.find((s) => !s.customer && !s.reserved && !s.dirty && g.world.accessFor(s.chair).length) || null;
  }

  sitDown() {
    const seat = this.seat;
    const ch = seat.chair;
    if (!this.game.world.furniture.includes(ch)) return this.giveUpSeat();
    this.onTile = ch;
    this.x = ch.x + 0.5; this.y = ch.y + 0.5;
    this.lift = assets.def(furnitureById[ch.type].asset).seatHeight || 18;
    this.dir = ch.dir;
    seat.customer = this; seat.reserved = null;
    this.state = 'waitOrder'; this.task = 'Waiting to order'; this.mood = 'Hungry';
    this.patience = 1; this.pRate = 1 / PATIENCE.order; this.showPatience = true;
    this.bubble = { icon: 'emote_menu', t0: this.game.renderTime, until: Infinity };
    this.orderJob = this.game.jobs.add('order', { customer: this, seat });
    this.game.sfx('pop');
  }

  /** Called by the waiter at the table. */
  takeOrder() {
    const g = this.game;
    const st = g.state;
    const menu = Object.keys(st.dishes).filter((id) => st.dishes[id].on && dishById[id].level <= st.level);
    const foods = menu.filter((id) => dishById[id].cat !== 'drink');
    const drinks = menu.filter((id) => dishById[id].cat === 'drink');
    this.sat.push(this.patience);
    this.orderJob = null;
    if (!foods.length) { this.mood = 'Nothing to eat!'; return this.leaveUnhappy('lost'); }
    const food = choice(foods);
    const canDrink = drinks.length && g.world.byKind('bar').length && g.staff.some((s) => s.role === 'bartender');
    const drink = canDrink && chance(0.5) ? choice(drinks) : null;
    this.tickets = [];
    const mk = (dish, kind) => ({ id: uid(), dish, kind, customer: this, seat: this.seat, state: 'queued' });
    const tf = mk(food, 'food');
    tf.job = g.jobs.add('cook', { ticket: tf, customer: this });
    this.tickets.push(tf);
    if (drink) { const td = mk(drink, 'drink'); td.job = g.jobs.add('drink', { ticket: td, customer: this }); this.tickets.push(td); }
    this.bubble = { icon: dishById[food].asset, icon2: drink ? dishById[drink].asset : null, t0: g.renderTime, until: g.simTime + 3 };
    this.state = 'waitFood'; this.task = 'Waiting for food'; this.mood = 'Excited';
    this.patience = 1; this.pRate = 1 / PATIENCE.food; this.showPatience = true;
    g.sfx('order');
  }

  receive(ticket) {
    const s = this.seat;
    ticket.state = 'served';
    if (ticket.kind === 'drink') s.drink = ticket; else s.food = ticket;
    this.game.sfx('serve');
    if (this.tickets.every((t) => t.state === 'served')) this.startEating();
    else { this.hop(); }
  }

  startEating() {
    this.sat.push(this.patience);
    this.state = 'eating'; this.task = 'Eating'; this.mood = 'Yum!';
    this.showPatience = false; this.bubble = null;
    this.hop();
    const t = rand(6, 8.5);
    this.wait(t, 'eat', { every: (dt) => { if (Math.random() < dt * 1.2) { const p = this.game.worldPos(this); this.game.fx.crumbs(p.x, p.y - 60 - this.lift); } } });
    this.do(() => this.finishMeal());
  }

  finishMeal() {
    const g = this.game;
    let coins = 0, points = 0;
    for (const t of this.tickets) {
      const d = dishById[t.dish], lv = g.state.dishes[t.dish].lv;
      coins += dishPrice(d, lv); points += dishPoints(d, lv);
    }
    const s = this.sat.length ? this.sat.reduce((a, b) => a + b, 0) / this.sat.length : 0.7;
    const tip = Math.round(coins * 0.3 * s);
    g.eco.earn(coins + tip, points, this.x, this.y - 0.2, this.lift + 110);
    g.rating.addService(0.55 + 0.45 * s);
    g.state.stats.served++;
    const seat = this.seat;
    seat.food = null; seat.drink = null; seat.dirty = true;
    g.jobs.add('clear', { seat });
    this.tickets = [];
    if (s > 0.5) { this.emote('emote_heart', 2); const p = g.worldPos(this); g.fx.hearts(p.x, p.y - 110 - this.lift); this.mood = 'Delighted'; }
    else { this.emote('emote_sparkle', 1.6); this.mood = 'Satisfied'; }
    this.hop();
    this.wait(0.6);
    this.do(() => this.afterMeal());
  }

  standUp() {
    const g = this.game;
    if (this.seat) {
      if (this.seat.customer === this) this.seat.customer = null;
      if (this.seat.reserved === this) this.seat.reserved = null;
    }
    if (this.onTile) {
      const ch = this.onTile;
      this.onTile = null; this.lift = 0;
      const opts = g.world.accessFor(ch);
      const free = opts.filter((t) => !g.agentTiles.has(t.x, t.y));
      const t = (free.length ? free : opts)[0];
      if (t) this.walk(t.x, t.y, { onFail: () => {} });
    }
    this.seat = null;
  }

  afterMeal() {
    const g = this.game;
    this.standUp();
    if (chance(0.3)) this.do(() => { g.world.addTrash(this.tx, this.ty); });
    const w = g.world;
    const usable = (kind) => w.byKind(kind).filter((f) => !f.broken && !f.reservedBy && w.accessFor(f).length);
    let fac = null;
    if (chance(0.28)) fac = choice(usable('toilet'));
    if (!fac && chance(0.35)) fac = choice(usable('arcade'));
    if (fac) this.do(() => this.useFacility(fac));
    else this.do(() => this.leave());
  }

  useFacility(f) {
    const g = this.game;
    if (f.broken || f.reservedBy || !g.world.furniture.includes(f)) return this.leave();
    f.reservedBy = this; this.facility = f;
    this.state = 'facility'; this.task = f.kind === 'toilet' ? 'Visiting the restroom' : 'Playing arcade';
    const release = () => { if (f.reservedBy === this) f.reservedBy = null; this.facility = null; };
    this.walk(0, 0, { goals: g.world.accessFor(f), onFail: () => { release(); this.leave(); } });
    this.face({ x: f.x, y: f.y });
    this.do(() => { if (f.broken) { release(); this.clearQueue(); this.leave(); } else if (f.kind === 'arcade') this.emote('emote_note', 3); });
    this.wait(f.kind === 'arcade' ? rand(4, 6) : rand(3, 4), f.kind === 'arcade' ? 'play' : 'idle', { fail: () => f.broken });
    this.do(() => {
      release();
      const fee = furnitureById[f.type].fee || 3;
      g.eco.earn(fee, 0, this.x, this.y, 110);
      f.uses = (f.uses || 0) + 1;
      if (f.uses >= f.breakAt) g.eco.breakFacility(f);
      this.emote(f.kind === 'arcade' ? 'emote_sparkle' : 'emote_heart', 1.4);
      this.leave();
    });
  }

  fedUp() {
    if (this.state === 'leaving' || this.state === 'angry') return;
    this.mood = this.state === 'queue' ? 'Tired of waiting for a seat' : this.state === 'waitOrder' ? 'Nobody took my order!' : 'The food took forever!';
    this.leaveUnhappy('angry');
  }

  leaveUnhappy(reason) {
    const g = this.game;
    this.clearQueue();
    this.showPatience = false;
    this.cancelOrders();
    if (this.facility) { if (this.facility.reservedBy === this) this.facility.reservedBy = null; this.facility = null; }
    if (reason === 'noSeat') { g.state.stats.noSeat++; g.rating.addService(0.35); this.emote('emote_sad', 2.2); }
    else { g.state.stats.lost++; g.rating.addService(0); this.emote('emote_angry', 2.4); this.shakeT = 0.8; this.expr = 'angry'; g.sfx('angry'); }
    if (this.seat) {
      const s = this.seat;
      if (s.food || s.drink) { s.food = null; s.drink = null; s.dirty = true; g.jobs.add('clear', { seat: s }); }
    }
    this.standUp();
    this.state = 'angry';
    this.wait(0.7);
    this.do(() => this.leave());
  }

  cancelOrders() {
    const g = this.game;
    if (this.orderJob) { g.jobs.cancel(this.orderJob); this.orderJob = null; }
    for (const t of this.tickets) {
      if (t.state === 'served') continue;
      t.state = 'canceled';
      g.jobs.cancel(t.job); g.jobs.cancel(t.deliverJob);
      const st = t.station;
      if (st && st.ready === t) { st.ready = null; const p = g.worldPos({ x: st.x + 0.5, y: st.y + 0.5 }); g.fx.puff(p.x, p.y - 50, '#e9e2da', 3); }
    }
    g.jobs.cancelWhere((j) => j.customer === this);
  }

  leave() {
    const g = this.game;
    this.state = 'leaving'; this.task = 'Heading home';
    this.showPatience = false;
    const e = g.world.entry;
    this.walk(e.x, e.y, { onFail: () => this.exit() });
    this.do(() => this.exit());
  }

  exit() {
    this.clearQueue();
    this.game.openDoor(1.2);
    this.face(2);
    this.gliding = true;
    this.wait(0.45, null, { every: (dt, a) => { const k = Math.min(1, a.elapsed / 0.45); this.alpha = 1 - k; this.x = 0.5 - 0.38 * k; this.y = DOOR_Y + 0.5; this.phase += dt * this.speed * 5; } });
    this.do(() => { this.gliding = false; this.gone = true; this.releaseAll(); });
  }

  baseMode() {
    if (this.onTile) return this.state === 'eating' ? 'eat' : 'sit';
    return super.baseMode();
  }
}
