// Customer brain: arrive → find seat (or queue / leave) → order → wait for food → eat → pay →
// maybe restroom / arcade → leave. Patience drains while waiting to be seated, to order, and for food.
import { stockIn, claim, slotOfTicket, BAKE_CHANCE, STOCK_BAKE_CHANCE } from './pastry.js';
import { Agent } from './agent.js';
import { randomLook } from './looks.js';
import { models } from './models.js';
import { t } from './i18n.js';
import { furnitureById, dishById, CUSTOMER_NAMES, PATIENCE, SPEED, CASHIER, TROUBLE, dishPrice, dishPoints, EXTRA_CAT } from './data.js';
import { DOOR_Y } from './world.js';
import { DIRS } from './iso.js';
import { choice, chance, rand, manhattan, uid } from './util.js';

export class Customer extends Agent {
  constructor(game) {
    super(game, 'customer', choice(CUSTOMER_NAMES), randomLook());
    this.speed = this.baseSpeed = SPEED.customer * rand(0.88, 1.1);
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
    this.mood = 'Craving coffee';
    this.orderJob = null;
    this.rude = false;      // walked in looking for trouble (see rampage)
    this.trouble = null;    // { kind: 'rude' | 'dash', by: the staff member sent after them, over }
    this.fly = null;        // knocked out of the café by a home run
  }

  canNudge() { return this.state === 'queue' && !this.stepping; }
  stateLabel() { return this.state + (this.showPatience ? ` ${Math.round(this.patience * 100)}%` : ''); }

  update(dt) {
    if (this.fly) return this.flyAway(dt);
    super.update(dt);
    if (this.gliding) this.moving = true;
    const g = this.game;
    if (this.showPatience && this.pRate > 0 && g.timeStopT <= 0) {   // Time Pause freezes the countdown
      this.patience -= this.pRate * dt * (g.inSpotlight(this.x, this.y) ? 0.4 : 1);
      if (this.patience <= 0) { this.patience = 0; this.fedUp(); }
    }
  }

  // ---------- arrival ----------
  /** Walk in from the street: along the sidewalk, through the door, into the room. */
  begin(fromY) {
    const g = this.game, e = g.world.entry;
    this.state = 'arriving'; this.task = 'Walking over'; this.alpha = 1;
    this.x = -2.5; this.y = fromY;
    this.glide(-2.5, e.y + 0.5);
    this.glide(-1.1, e.y + 0.5);
    this.wait(0, null, { until: () => !g.agentTiles.has(e.x, e.y) });
    this.do(() => { this.claim(e.x, e.y); g.openDoor(1.4); g.sfx('door'); this.task = 'Arriving'; });
    this.glide(0.5, e.y + 0.5);
    this.do(() => this.decide());
  }

  decide() {
    const g = this.game;
    if (this.rude) return this.rampage();
    const { clean, dirty } = g.world.seats.reduce((acc, s) => {
      if (s.customer || s.reserved || !g.world.accessFor(s.chair).length) return acc;
      (s.dirty ? acc.dirty : acc.clean).push(s);
      return acc;
    }, { clean: [], dirty: [] });
    if (clean.length) return this.gotoSeat(this.pickSeat(clean));
    const queued = g.customers.filter((c) => c.state === 'queue').length;
    if (dirty.length > queued && queued < 3) return this.queueForSeat();
    // with a cashier counter there's a proper line: guests wait for someone to finish, too
    if (this.hasCashier() && queued < CASHIER.queue && g.world.seats.some((s) => s.customer)) return this.queueForSeat();
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
    this.state = 'toSeat'; this.task = 'Walking to a seat'; this.mood = 'Craving coffee';
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
    this.patience = 1; this.pRate = 1 / (PATIENCE.seat * (this.hasCashier() ? CASHIER.queuePatience : 1)); this.showPatience = true;
    const e = g.world.entry;
    const t = g.freeTileNear(e.x, e.y, true, (x, y) => !(x === e.x && y === e.y) && manhattan(x, y, e.x, e.y) <= 4);
    if (t) this.walk(t.x, t.y, { onFail: () => {} });
    this.emote('emote_wait', 2.5);
    this.wait(0, null, { until: () => this.findCleanSeat() != null });
    this.do(() => { const s = this.findCleanSeat(); if (s) { this.sat.push(this.patience); this.gotoSeat(s); } else this.queueForSeat(); });
  }
  hasCashier() { return this.game.world.byKind('cashier').some((f) => this.game.world.accessFor(f).length); }
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
    this.lift = (models.def(furnitureById[ch.type].asset) || {}).seatHeight || 0.55;
    this.dir = ch.dir;
    seat.customer = this; seat.reserved = null;
    this.state = 'waitOrder'; this.task = 'Waiting to order'; this.mood = 'Craving coffee';
    this.patience = 1; this.pRate = 1 / PATIENCE.order; this.showPatience = true;
    this.bubble = { icon: 'emote_menu', t0: this.game.renderTime, until: Infinity };
    this.orderJob = this.game.jobs.add('order', { customer: this, seat });
    this.game.sfx('pop');
  }

  /** Called by the waiter at the table. */
  takeOrder() {
    const g = this.game;
    const st = g.state;
    const eco = g.eco;
    const menu = Object.keys(st.dishes).filter((id) => st.dishes[id].on && dishById[id].level <= st.level);
    const foods = menu.filter((id) => dishById[id].cat !== EXTRA_CAT && eco.canMake(id));
    const drinks = menu.filter((id) => dishById[id].cat === EXTRA_CAT && eco.canMake(id));   // a bake on the side
    this.sat.push(this.patience);
    this.orderJob = null;
    if (!foods.length) {
      this.mood = 'Sold out!';
      if (!st.stats.soldOut) g.toast(t('Sold out! A guest left empty-handed — restock in the Market.'), 'bad');
      st.stats.soldOut = (st.stats.soldOut || 0) + 1;
      eco.autoRestock();
      return this.leaveUnhappy('lost');
    }
    const food = choice(foods);
    eco.consume(food);
    // a bake on the side: what they can see in the pastry case tempts them most (it's served straight
    // from the shelf, already paid for); otherwise one off the menu, baked to order
    const stock = stockIn(g.world.byKind('bar'));
    const fromCase = stock.length && chance(STOCK_BAKE_CHANCE) ? choice(stock) : null;
    const canDrink = drinks.length && g.eco.bakeryReady();
    const drink = fromCase ? fromCase.dish : canDrink && chance(BAKE_CHANCE) ? choice(drinks) : null;
    if (drink && !fromCase) eco.consume(drink);
    this.tickets = [];
    const mk = (dish, kind) => ({ id: uid(), dish, kind, customer: this, seat: this.seat, state: 'queued' });
    const tf = mk(food, 'food');
    tf.job = g.jobs.add('cook', { ticket: tf, customer: this });
    this.tickets.push(tf);
    if (drink) {
      const td = mk(drink, 'drink');
      if (fromCase) { claim(fromCase.f, fromCase.i, td); td.deliverJob = g.jobs.add('deliver', { ticket: td, stove: fromCase.f, customer: this }); }
      else td.job = g.jobs.add('drink', { ticket: td, customer: this });
      this.tickets.push(td);
    }
    this.bubble = { icon: dishById[food].asset, icon2: drink ? dishById[drink].asset : null, t0: g.renderTime, until: g.simTime + 3 };
    this.state = 'waitFood'; this.task = 'Waiting for their order'; this.mood = 'Excited';
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
    this.state = 'eating'; this.task = 'Sipping & nibbling'; this.mood = 'Yum!';
    this.showPatience = false; this.bubble = null;
    this.hop();
    const t = rand(6, 8.5);
    this.wait(t, 'eat', { every: (dt) => { if (Math.random() < dt * 1.2) { this.game.fx.crumbs(this.game.at(this.x, this.y, 70)); } } });
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
    let tip = Math.round(coins * 0.3 * s);
    const bloom = g.perk('bloom'), spot = g.inSpotlight(this.x, this.y);
    if (bloom && s >= bloom.min) { tip = Math.round(tip * (1 + bloom.tip)); g.fx.petals(g.at(this.x, this.y, 90), 9); }
    if (spot) { tip *= 2; g.fx.sparkle(g.at(this.x, this.y, 90), 8, '#ffe27a'); }
    // now and then a guest eats up and runs off without paying (the bill can still be chased down)
    this.owed = this.forceDash || g.troubles.rollDash() ? coins : 0;
    g.eco.earn(this.owed ? 0 : coins + tip, points, this.x, this.y - 0.2, this.lift + 110);
    this.till = this.owed ? 0 : Math.round(coins * CASHIER.tip * s);   // the extra tip, if they pass a cashier on the way out
    g.rating.addService(0.55 + 0.45 * s);
    if (spot) g.rating.addService(0.55 + 0.45 * s);   // Spotlight: this table counts double
    g.state.stats.served++;
    const bakes = this.tickets.filter((t) => dishById[t.dish].cat === EXTRA_CAT).length;
    g.eco.questProgress('guests', 1); g.eco.questProgress('cups', this.tickets.length - bakes); g.eco.questProgress('bakes', bakes);
    const seat = this.seat;
    seat.food = null; seat.drink = null; seat.dirty = true;
    g.jobs.add('clear', { seat });
    this.tickets = [];
    if (s > 0.5) { this.emote('emote_heart', 2); g.fx.hearts(g.at(this.x, this.y, 110)); this.mood = 'Delighted'; }
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
    if (this.owed) return this.dineAndDash();
    this.standUp();
    if (chance(0.3)) this.do(() => { g.world.addTrash(this.tx, this.ty); });
    const w = g.world;
    const usable = (kind) => w.byKind(kind).filter((f) => !f.broken && !f.reservedBy && w.accessFor(f).length);
    const till = this.till > 0 && choice(usable('cashier'));
    if (till) {   // stop at the counter to pay, and tip a little extra
      this.do(() => { this.task = 'Paying at the counter'; });
      this.walk(0, 0, { goals: w.accessFor(till), onFail: () => {} });
      this.face({ x: till.x, y: till.y });
      this.wait(0.6);
      this.do(() => { if (w.furniture.includes(till)) { g.eco.earn(this.till, 0, till.x + 0.5, till.y + 0.5, 120); g.sfx('ding'); } this.till = 0; });
    }
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
    this.state = 'facility'; this.task = f.kind === 'toilet' ? 'Visiting the restroom' : 'Browsing the shelves';
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
    this.mood = this.state === 'queue' ? 'Tired of waiting for a seat' : this.state === 'waitOrder' ? 'Nobody took my order!' : 'The order took forever!';
    this.leaveUnhappy('angry');
  }

  leaveUnhappy(reason) {
    const g = this.game;
    this.clearQueue();
    this.showPatience = false;
    this.cancelOrders();
    if (this.facility) { if (this.facility.reservedBy === this) this.facility.reservedBy = null; this.facility = null; }
    if (reason === 'noSeat') { g.state.stats.noSeat++; this.emote('emote_sad', 2.2); } // turned away: counts as lost in the summary, no rating hit
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
      const st = t.station;
      if (st && st.kind === 'bar' && slotOfTicket(st, t) >= 0) {   // a bake waiting in the case goes back on sale
        st.slots[slotOfTicket(st, t)].ticket = null;
        g.jobs.cancel(t.deliverJob); t.state = 'canceled';
        continue;
      }
      if (t.kind === 'drink' && t.job && t.job.assignee && ['cooking', 'baked'].includes(t.state) && !g.jobs.salvage(t)) {
        t.customer = null; t.job.customer = null;   // the baker finishes it anyway and it goes in the case as stock
        continue;
      }
      if (t.kind === 'drink' && t.state === 'queued') g.eco.refund(t.dish);   // never started: the ingredients go back
      const salvaged = g.jobs.salvage(t);
      t.state = 'canceled';
      if (salvaged) continue;
      g.jobs.cancel(t.job); g.jobs.cancel(t.deliverJob);
      if (st && st.ready === t) { st.ready = null; g.fx.puff(g.at(st.x + 0.5, st.y + 0.5, 50), '#e9e2da', 3); }
    }
    g.jobs.cancelWhere((j) => j.customer === this && !(j.ticket && j.ticket.customer !== this));
  }

  leave() {
    const g = this.game;
    this.state = 'leaving'; this.task = 'Heading home';
    this.showPatience = false;
    const e = g.world.entry;
    this.walk(e.x, e.y, { onFail: () => this.exit() });
    this.do(() => this.exit());
  }

  /** Out through the door and back onto the sidewalk, where they become a passer-by. */
  exit() {
    const g = this.game;
    this.clearQueue();
    g.openDoor(1.4);
    this.glide(-1.1, DOOR_Y + 0.5);
    this.do(() => this.releaseAll());
    this.glide(-2.5, DOOR_Y + 0.5);
    this.do(() => { g.street.adopt(this, Math.random() < 0.5 ? -9 : g.world.size + 9); this.gone = true; });
  }

  // ---------- trouble: a rude guest ----------
  /** Walks in looking for trouble (rolled in game.spawnCustomer): dark clothes, a scowl. */
  makeRude() { this.rude = true; this.look.shirt = '#34343c'; this.mood = 'Looking for trouble'; }

  /** Skip the tables: go after the staff, one shove at a time, until someone bats them out or they get bored. */
  rampage() {
    const g = this.game;
    this.state = 'rude'; this.task = 'Making a scene'; this.mood = 'Furious';
    this.trouble = { kind: 'rude', until: g.simTime + TROUBLE.rude.stay, by: null, over: false };
    this.expr = 'angry'; this.shakeT = 0.8;
    this.emote('emote_angry', 2.4);
    g.troubles.started(this, 'rude');
    this.do(() => this.bully());
  }
  bully() {
    const g = this.game, w = g.world, T = TROUBLE.rude;
    if (this.state !== 'rude' || this.trouble.by) return;
    if (g.simTime >= this.trouble.until || !g.day.isOpen) return this.stormOff();
    const near = (a) => manhattan(a.tx, a.ty, this.tx, this.ty);
    const target = g.staff.filter((s) => !s.napping && !s.trouble && !(s.stunT > 0) && s.x >= 0).sort((a, b) => near(a) - near(b))[0];
    if (!target) {   // nobody to pick on: pace about, glaring
      const tl = g.freeTileNear(this.tx, this.ty, true, (x, y) => manhattan(x, y, this.tx, this.ty) <= 3 && Math.random() < 0.5);
      if (tl) this.walk(tl.x, tl.y, { onFail: () => {} });
      this.wait(1.2, 'idle');
      this.do(() => this.bully());
      return;
    }
    const goals = DIRS.map((d) => ({ x: target.tx + d.dx, y: target.ty + d.dy })).filter((p) => w.isWalkable(p.x, p.y) && !w.isEntry(p.x, p.y));
    if (near(target) > 1) this.walk(0, 0, { goals: goals.length ? goals : [{ x: target.tx, y: target.ty }], goalOk: !goals.length, onFail: () => {} });
    this.do(() => {
      if (this.state !== 'rude' || this.trouble.by) return;
      if (Math.hypot(target.x - this.x, target.y - this.y) < 1.7 && !target.trouble && !target.napping && g.staff.includes(target)) {
        this.face({ x: target.tx, y: target.ty });
        this.hop(); this.shakeT = 0.4;
        target.shoved(this);
        // the guests nearby flinch: a little patience gone
        for (const c of g.customers) if (c.showPatience && manhattan(c.tx, c.ty, this.tx, this.ty) <= 3) c.patience = Math.max(0.05, c.patience - T.scare);
        this.wait(T.every, 'talk');
      } else this.wait(0.3);
      this.do(() => this.bully());
    });
  }
  /** Someone with a bat is coming: freeze and tremble. */
  cower() {
    this.halt();
    this.task = 'Uh-oh…'; this.mood = 'Scared';
    this.emote('emote_sad', 99);
    this.shakeT = 99;
    this.wait(14);   // in case the batter never makes it over: back to bullying
    this.do(() => { this.shakeT = 0; this.bubble = null; if (this.trouble) this.trouble.by = null; this.bully(); });
  }
  /** Gave up and left on their own: the staff were pushed around, and the guests saw it all. */
  stormOff() {
    const g = this.game;
    this.trouble.over = true;
    this.halt();
    this.emote('emote_angry', 2);
    g.rating.addService(0);
    g.toast(t('The rude guest stormed off. Your team is shaken.'), 'bad');
    g.changed('trouble');
    this.leave();
  }
  /** Home run! Sails up and out of the café, spinning, and is gone. */
  launch(by) {
    const g = this.game;
    this.trouble.over = true;
    this.halt();
    this.releaseAll();
    this.state = 'flying'; this.task = 'Flying home'; this.mood = 'Wheee!';
    this.showPatience = false; this.bubble = null; this.shakeT = 0;
    let dx = this.x - by.x, dy = this.y - by.y;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    this.fly = { t: 0, vx: dx * 6, vy: dy * 6, h: 0, spin: 0, twinkled: false };
    g.changed('trouble');
  }
  flyAway(dt) {
    const g = this.game, f = this.fly;
    f.t += dt;
    this.x += f.vx * dt; this.y += f.vy * dt;
    f.h = 9 * f.t + 7 * f.t * f.t;
    f.spin += dt * 15;
    this.moving = false;
    if (f.t > 0.85 && !f.twinkled) {   // the little star in the sky as they disappear
      f.twinkled = true;
      g.fx.sparkle(g.at(this.x, this.y, f.h * 40), 14, '#fff6a8');
      g.fx.sparkle(g.at(this.x, this.y, f.h * 40), 6, '#ffffff');
      g.sfx('ding');
    }
    if (f.t > 1.6) this.gone = true;
  }

  // ---------- trouble: dine and dash ----------
  /** Up from the table, a shifty look around, a tiptoe to the door… then a sprint down the street. */
  dineAndDash() {
    const g = this.game, T = TROUBLE.dash, e = g.world.entry;
    this.standUp();
    this.do(() => {
      this.state = 'dash'; this.task = 'Sneaking out without paying'; this.mood = 'Sneaky';
      this.trouble = { kind: 'dash', owed: this.owed, by: null, over: false };
      g.troubles.started(this, 'dash');
      this.emote('emote_wait', T.sneak);
    });
    let look = 0;
    this.wait(T.sneak, 'idle', { every: (dt) => { if ((look -= dt) <= 0) { look = 0.35; this.dir = (this.dir + 2) % 4; } } });
    this.do(() => { this.speed = this.baseSpeed * T.tiptoe; });
    this.walk(e.x, e.y, { onFail: () => this.dashOut() });
    this.do(() => this.dashOut());
  }
  dashOut() {
    const g = this.game, T = TROUBLE.dash;
    this.clearQueue();
    g.openDoor(1.4);
    this.task = 'Running off with the bill';
    this.speed = T.run; this.speedMul = T.run / SPEED.customer;   // legs a blur
    this.glide(-1.1, DOOR_Y + 0.5);
    this.do(() => this.releaseAll());
    this.glide(-2.5, DOOR_Y + 0.5);
    this.glide(-2.5, chance(0.5) ? -T.street + DOOR_Y : g.world.size + T.street - DOOR_Y);
    this.do(() => this.escaped());
  }
  escaped() {
    const g = this.game;
    this.trouble.over = true;
    g.state.stats.dashed = (g.state.stats.dashed || 0) + 1;
    g.toast(t('{name} got away without paying ({n} coins).', { name: this.name, n: this.owed }), 'bad');
    g.changed('trouble');
    this.gone = true;
  }
  /** Caught by a sprinter: hands the money over, sheepishly, and slinks off. */
  caught(by) {
    const g = this.game;
    this.trouble.over = true;
    this.halt();
    this.speed = this.baseSpeed; this.speedMul = 1;
    this.state = 'caught'; this.task = 'Paying up'; this.mood = 'Busted!';
    this.face({ x: Math.floor(by.x), y: Math.floor(by.y) });
    this.shakeT = 0.7;
    this.emote('emote_sad', 2);
    this.wait(0.7);
    this.do(() => { g.eco.earn(this.owed, 0, this.x, this.y, 110); this.owed = 0; g.sfx('ding'); g.changed('trouble'); });
    this.wait(0.6);
    this.do(() => {
      if (this.x >= 0) return this.leave();
      this.releaseAll();
      this.glide(-2.5, this.y);
      this.do(() => { g.street.adopt(this, chance(0.5) ? -9 : g.world.size + 9); this.gone = true; });
    });
  }

  baseMode() {
    if (this.onTile) return this.state === 'eating' ? 'eat' : 'sit';
    return super.baseMode();
  }
}
