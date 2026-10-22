// Real-time battle rules (Blue Archive + Slay the Spire): the same cards, foes and commission as engine.js, but no
// turns. The fight advances in fixed ticks (RT.tps a second); the team swings on its own, cost refills on a clock,
// and each foe's intent charges up and goes off when full. Still pure and seeded: a fight is its seed plus the
// inputs log ({tick, …}), so the server can replay it later the same way as the turn-based one.
import { CARDS, RULES, RT, DRINKS } from './data.js';
import { Battle } from './engine.js';

const S = (sec) => Math.round(sec * RT.tps);
/** A card's cost in real time: its own rtCost, or twice the turn cost (at least 1). */
export const rtCost = (id) => CARDS[id].rtCost ?? Math.max(1, CARDS[id].cost * 2);

export class RtBattle extends Battle {
  constructor(opts) {
    super(opts);
    this.tick = 0;
    this.energy = RT.energyStart + (this.has('mochalatte') ? 1 : 0);
    this.regen = 0;                       // ticks towards the next point of cost
    this.later = [];                      // energy owed later ({at, n}, Slow Brew)
    this.focus = null;                    // the foe the team swings at (tapped), or the front one
    this.log = [];                        // player inputs, for replays
    this.swings = Object.fromEntries(this.team.filter((id) => RT.swing[id]).map((id, i) => [id, S(0.6 + i * 0.35)]));
    // each member's own chill (carried over between fights by Run as opts.hp); this.chill is the team's total
    const hp = opts.hp || {};
    this.members = this.team.filter((id) => RT.members[id]).map((id) => ({ id, row: RT.members[id].row, max: RT.members[id].hp, hp: hp[id] ?? RT.members[id].hp }));
    this.taunt = 0;   // tick until which every hit goes to Hee Hee (Spotlight)
    this.tally();
  }
  member(id) { return this.members.find((m) => m.id === id); }
  up(id) { const m = this.member(id); return !m || m.hp > 0; }
  standing() { return this.members.filter((m) => m.hp > 0); }
  tally() { this.chill = this.members.reduce((s, m) => s + m.hp, 0); this.chillMax = this.members.reduce((s, m) => s + m.max, 0); }

  /** Foes start part-way into their first charge, so they don't all go off together. */
  addFoe(id) {
    const f = super.addFoe(id);
    f.hp = f.max = Math.round(f.def.hp * RT.hpMul);
    Object.assign(f, { charge: Math.floor(this.rand() * S(1.5)), frozen: 0, colourLeft: 0 });
    return f;
  }
  chargeOf(f) { return S((f.intent.s ?? RT.charge[f.intent.k] ?? 4) * RT.chargeMul); }
  /** How far a foe's charge is, 0..1 (for the bar). */
  progress(f) { return f.frozen || f.colored ? f.charge / this.chargeOf(f) : Math.min(1, f.charge / this.chargeOf(f)); }

  start() {
    const ev = [];
    for (const m of this.members) if (!m.hp) this.retire(m.id, ev);
    this.drawTo(RULES.hand, ev);
    return ev;
  }
  cost(card) {
    return (card.free ? 0 : rtCost(card.id)) + this.jam;
  }
  canPlay(card) { return super.canPlay(card) && this.up(CARDS[card.id].who); }
  apply(d, target, ev) {
    super.apply(d, target, ev);
    if (d.fx.taunt && this.up(d.who)) { this.taunt = this.tick + S(d.fx.taunt); ev.push({ t: 'taunt', who: d.who }); }
  }
  /** Heals reach everyone still standing. */
  heal(n, ev) {
    for (const m of this.standing()) {
      const got = Math.min(n, m.max - m.hp);
      if (got) { m.hp += got; ev.push({ t: 'heal', who: m.id, n: got }); }
    }
    this.tally();
  }
  /** Who a foe's move lands on: Hee Hee while the spotlight is on her, else someone in the row it aims at (the
   *  other row when that one is empty), or everyone. */
  aimed(it) {
    const up = this.standing();
    if (it.aim === 'all') return up;
    const taunter = this.taunt > this.tick && up.find((m) => m.id === 'heehee');
    if (taunter && it.aim !== 'back') return [taunter];
    const row = up.filter((m) => m.row === (it.aim || 'front'));
    const pool = row.length ? row : up;
    return pool.length ? [pool[Math.floor(this.rand() * pool.length)]] : [];
  }
  hurtTeam(n, f, k, ev) {
    const each = f.intent.aim === 'all' ? Math.round(n * RT.allMul) : n;
    for (const m of this.aimed(f.intent)) {
      const blocked = Math.min(this.foam, each);
      this.foam -= blocked;
      const got = Math.min(m.hp, each - blocked);
      m.hp -= got;
      ev.push({ t: 'hurt', foe: f.uid, who: m.id, n: got, blocked, big: k === 'ring' });
      if (!m.hp) { ev.push({ t: 'ko', who: m.id }); this.retire(m.id, ev); }
    }
    this.tally();
    this.check(ev);
  }
  /** A member who sat down: their cards leave this fight (the hand refills from the rest). */
  retire(id, ev) {
    const theirs = (c) => CARDS[c.id].who === id;
    for (const pile of [this.hand, this.draw, this.discard]) for (const c of pile.filter(theirs)) { pile.splice(pile.indexOf(c), 1); this.gone.push(c); }
    if (this.last && theirs(this.last)) this.last = null;
    this.drawTo(RULES.hand, ev);
  }

  play(uid, foeUid) {
    // logged by position: uids come from a global counter, so a replay has different ones
    const at = { tick: this.tick, k: 'play', hand: this.hand.findIndex((c) => c.uid === uid), foe: this.foes.findIndex((f) => f.uid === foeUid) };
    const ev = super.play(uid, foeUid);
    if (!ev) return null;
    this.log.push(at);
    // Time Pause in real time: the charge is thrown away and the foe stands frozen for a moment
    for (const f of this.foes) if (f.cancelled) { f.cancelled = false; f.frozen = S(RT.freezeFor); f.charge = 0; this.advance(f); }
    if (this.nextEnergy) { this.later.push({ at: this.tick + S(RT.nextEnergyIn), n: this.nextEnergy }); this.nextEnergy = 0; }
    if (!this.over) this.drawTo(RULES.hand, ev);
    return ev;
  }
  /** A colour gauge filled: the foe stops charging and takes double for a while. */
  fadeFoe(f, n, ev) {
    const was = f.colored;
    super.fadeFoe(f, n, ev);
    if (f.colored && !was) f.colourLeft = S(RT.colourFor);
  }
  conjure(ev) {
    super.conjure(ev);
    const c = this.hand[this.hand.length - 1];
    if (c && c.id === 'knot' && c.until == null) c.until = this.tick + S(RT.knotFor);
  }
  /** Drinks give cost in real-time units (twice the turn ones), up to the cap. */
  useDrink(i) {
    const id = this.drinks[i];
    if (!id || this.over) return null;
    const fx = DRINKS[id].fx, ev = [{ t: 'drink', id }];
    this.drinks.splice(i, 1);
    this.log.push({ tick: this.tick, k: 'drink', i });
    if (fx.energy) { const n = Math.min(fx.energy * 2, RT.energyMax - this.energy); this.energy += n; ev.push({ t: 'energy', n }); }
    if (fx.heal) this.heal(fx.heal, ev);
    return ev;
  }
  setFocus(uid) {
    if (!this.alive().some((f) => f.uid === uid)) return;
    this.focus = uid;
    this.log.push({ tick: this.tick, k: 'focus', foe: this.foes.findIndex((f) => f.uid === uid) });
  }
  /** Who the team swings at: the tapped foe, or the first one still standing. */
  front() { return this.alive().find((f) => f.uid === this.focus) || this.alive()[0]; }
  hurtFoe(f, n, ev) {
    super.hurtFoe(f, n, ev);
    if (this.swinging) ev[ev.length - (f.alive ? 1 : 2)].small = true;
    if (!f.alive && this.focus === f.uid) this.focus = null;
  }
  endTurn() { return []; }   // there are no turns

  /** One tick of the clock. */
  step() {
    if (this.over) return [];
    const ev = [];
    this.tick++;
    // cost
    if (this.energy < RT.energyMax && ++this.regen >= S(RT.regen)) { this.regen = 0; this.energy++; }
    if (this.energy >= RT.energyMax) this.regen = 0;
    for (const l of this.later.filter((x) => x.at <= this.tick)) {
      this.later.splice(this.later.indexOf(l), 1);
      const n = Math.min(l.n, RT.energyMax - this.energy);
      if (n) { this.energy += n; ev.push({ t: 'energy', n }); }
    }
    // foam melts, knots untie
    if (this.foam && this.tick % S(1 / RT.foamDecay) === 0) this.foam--;
    for (const c of this.hand.filter((x) => x.until != null && x.until <= this.tick)) {
      this.hand.splice(this.hand.indexOf(c), 1); this.gone.push(c); ev.push({ t: 'untie', card: c.uid });
      this.drawTo(RULES.hand, ev);
    }
    // the team swings on its own
    for (const id of Object.keys(this.swings)) {
      if (!this.up(id) || --this.swings[id] > 0) continue;
      const [every, dmg] = RT.swing[id], f = this.front();
      this.swings[id] = S(every);
      if (!f) continue;
      const mul = id === 'bbaekko' && this.night ? RULES.nightMul : 1;
      const n = Array.isArray(dmg) ? dmg[0] + Math.floor(this.rand() * (dmg[1] - dmg[0] + 1)) : dmg;
      ev.push({ t: 'swing', who: id, foe: f.uid });
      this.swinging = true;
      this.hurtFoe(f, Math.max(1, Math.round(n * mul)), ev);
      this.swinging = false;
      this.check(ev);
      if (this.over) return ev;
    }
    // the grey things charge their moves
    for (const f of this.alive()) {
      if (f.frozen) { if (!--f.frozen) ev.push({ t: 'thaw', foe: f.uid }); continue; }
      if (f.colored) { if (!--f.colourLeft) { f.colored = false; f.fade = 0; ev.push({ t: 'grey', foe: f.uid }); } continue; }
      if (++f.charge < this.chargeOf(f)) continue;
      f.charge = 0;
      ev.push({ t: 'fire', foe: f.uid });
      this.act(f, ev);
      if (this.over) break;
    }
    this.check(ev);
    return ev;
  }
}

/** Replays a fight from its seed and inputs; the server can check an outing this way. */
export function replay(opts, log, until) {
  const b = new RtBattle(opts);
  b.start();
  let i = 0;
  for (;;) {
    // the inputs made at this tick, then the tick itself (a fight can end on a card, between ticks)
    while (i < log.length && log[i].tick === b.tick) {
      const x = log[i++];
      const foe = b.foes[x.foe] ? b.foes[x.foe].uid : null;
      if (x.k === 'play') b.play(b.hand[x.hand].uid, foe);
      else if (x.k === 'drink') b.useDrink(x.i);
      else if (x.k === 'focus') b.setFocus(foe);
    }
    if (b.over || b.tick >= until) break;
    b.step();
  }
  return b;
}

const hurts = (f) => (f.intent.k === 'hit' || f.intent.k === 'ring' ? f.intent.dmg : 0);

/** The auto button, asked every few ticks: a move to make now, or null to wait. Time Pause the big hit just before
 *  it lands, foam up just before a hit, keep cost for Time Pause while a big one is coming, otherwise spend. */
export function autoMoveRt(b) {
  if (b.over) return null;
  const low = Math.min(...b.standing().map((m) => m.hp / m.max));
  if (low < 0.35 && b.drinks.includes('cocoa')) return { drink: b.drinks.indexOf('cocoa') };
  const live = b.alive(), playable = b.hand.filter((c) => b.canPlay(c));
  const byId = (id) => playable.find((c) => c.id === id);
  const active = live.filter((f) => !f.frozen && !f.colored);
  const left = (f) => b.chargeOf(f) - f.charge;
  const soon = active.filter((f) => hurts(f) && left(f) <= S(1.2)).sort((a, z) => hurts(z) - hurts(a))[0];
  if (soon && hurts(soon) >= 12 && byId('timestop')) return { uid: byId('timestop').uid, foe: soon.uid };
  if (soon && hurts(soon) - b.foam >= 6) {
    const blocker = playable.filter((c) => CARDS[c.id].fx.foam).sort((a, z) => CARDS[z.id].fx.foam - CARDS[a.id].fx.foam)[0];
    if (blocker) return { uid: blocker.uid };
  }
  // a big hit is on its way and Time Pause is in hand: keep enough cost for it
  const big = active.some((f) => hurts(f) >= 12 || f.intent.k === 'wind');
  const ts = b.hand.find((c) => c.id === 'timestop');
  const spare = (c) => !(big && ts && c !== ts) || b.energy - b.cost(c) >= b.cost(ts) || b.energy >= RT.energyMax;
  const ok = playable.filter((c) => !CARDS[c.id].fx.cancel && spare(c));
  const pick = (id) => ok.find((c) => c.id === id);
  for (const id of ['mindread', 'charm', 'caffeine']) if (pick(id) && b.hand.length < RULES.handMax) return { uid: pick(id).uid };
  if (b.standing().filter((m) => m.hp < m.max - 5).length >= 2 && pick('bloom')) return { uid: pick('bloom').uid };
  const urgent = live.find((f) => f.intent.k === 'steal' || f.intent.k === 'flee') || b.front();
  const attack = ok.filter((c) => CARDS[c.id].type === 'attack').sort((a, z) => b.cost(z) - b.cost(a))[0];
  if (attack) return { uid: attack.uid, foe: urgent && urgent.uid };
  // nothing to hit with: spend before the cost bar caps out
  if (b.energy >= RT.energyMax - 1) {
    const rest = ok.find((c) => CARDS[c.id].type !== 'junk');
    if (rest) return { uid: rest.uid, foe: urgent && urgent.uid };
  }
  return null;
}
