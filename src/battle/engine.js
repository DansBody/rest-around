// Battle rules (design/combat/DESIGN.md §5): pure logic, no DOM and no Math.random — every roll comes from a seeded
// generator, so a fight can be replayed from its seed (the server will check outings that way later).
// Every action returns a list of events ({t: 'hit', foe, n}, …) that ui/battle.js plays back as animation.
import { CARDS, FOES, RULES, DRINKS, TEAM } from './data.js';

/** mulberry32: a small, fast seeded generator; returns floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextUid = 1;
export const makeCard = (id, extra) => ({ uid: nextUid++, id, ...extra });

/** One fight. deck: cards ({uid, id}); foes: foe ids; team: who is on the team (passives). */
export class Battle {
  constructor({ deck, foes, team = TEAM, seed = 1, night = false, chill = RULES.chill, chillMax = RULES.chill, drinks = [] }) {
    this.rand = rng(seed);
    this.team = team; this.night = night;
    this.chill = chill; this.chillMax = chillMax; this.foam = 0;
    this.draw = this.shuffle(deck.map((c) => ({ ...c }))); this.hand = []; this.discard = []; this.gone = [];
    this.foes = [];
    for (const id of foes) this.addFoe(id);
    this.drinks = drinks.slice();
    this.turn = 0; this.energy = 0; this.jam = 0; this.boost = 0; this.nextEnergy = 0;
    this.last = null;       // the last card played, for Encore
    this.over = null;       // 'won' | 'lost'
    this.lost = 0;          // coins a foe ran off with
  }

  has(who) { return this.team.includes(who); }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  addFoe(id) {
    const def = FOES[id];
    const f = { uid: nextUid++, id, def, hp: def.hp, max: def.hp, fade: 0, fadeMax: def.fade, step: 0, intent: def.pattern[0],
      colored: false, cancelled: false, stolen: 0, alive: true, fled: false };
    this.foes.push(f);
    return f;
  }
  alive() { return this.foes.filter((f) => f.alive); }
  foe(uid) { return this.foes.find((f) => f.uid === uid); }
  /** The move after this one (Cheetie reads it). */
  nextIntent(f) { const p = f.def.pattern; return p[(f.step + 1) % p.length]; }
  /** Damage coming at the team this turn, after foam. */
  incoming() {
    let n = 0;
    for (const f of this.alive()) if (!f.colored && !f.cancelled && (f.intent.k === 'hit' || f.intent.k === 'ring')) n += f.intent.dmg;
    return n;
  }

  start() { return this.startTurn(); }
  startTurn() {
    const ev = [];
    this.turn++;
    this.foam = 0;
    this.energy = RULES.energy + this.nextEnergy + (this.turn === 1 && this.has('mochalatte') ? 1 : 0);
    this.nextEnergy = 0; this.boost = 0;
    ev.push({ t: 'turn', n: this.turn });
    this.drawTo(RULES.hand, ev);
    return ev;
  }
  /** Fill the hand up to n (unplayed cards stay from the turn before). */
  drawTo(n, ev) { while (this.hand.length < n && this.drawOne(ev)); }
  drawN(n, ev) { for (let i = 0; i < n && this.hand.length < RULES.handMax; i++) if (!this.drawOne(ev)) break; }
  drawOne(ev) {
    if (!this.draw.length) {
      if (!this.discard.length) return false;
      this.draw = this.shuffle(this.discard); this.discard = [];
      ev.push({ t: 'shuffle' });
    }
    const c = this.draw.pop();
    this.hand.push(c);
    ev.push({ t: 'draw', card: c.uid });
    return true;
  }

  cost(card) { return (card.free ? 0 : CARDS[card.id].cost) + this.jam; }
  canPlay(card) { return !this.over && CARDS[card.id].type !== 'junk' && this.cost(card) <= this.energy; }
  /** A card that asks which foe (only when there is a choice). */
  needsTarget(card) { return CARDS[card.id].target === 'foe' && this.alive().length > 1; }

  play(uid, foeUid) {
    const i = this.hand.findIndex((c) => c.uid === uid), card = this.hand[i];
    if (!card || !this.canPlay(card)) return null;
    const d = CARDS[card.id], ev = [];
    const target = d.target === 'foe' ? (this.alive().find((f) => f.uid === foeUid) || this.alive()[0]) : null;
    this.energy -= this.cost(card);
    if (this.jam) { this.jam = 0; ev.push({ t: 'unjam' }); }
    this.hand.splice(i, 1);
    ev.push({ t: 'play', card: card.uid, id: card.id, who: d.who, foe: target && target.uid });
    this.apply(d, target, ev);
    (card.temp ? this.gone : this.discard).push(card);
    if (!d.fx.recall && !card.temp) this.last = card;
    this.check(ev);
    return ev;
  }

  apply(d, target, ev) {
    const fx = d.fx, mul = d.who === 'bbaekko' && this.night ? RULES.nightMul : 1;
    if (fx.cancel && target) { target.cancelled = true; ev.push({ t: 'cancel', foe: target.uid }); }
    if (fx.foam) { this.foam += fx.foam; ev.push({ t: 'foam', n: fx.foam }); }
    if (fx.heal) this.heal(fx.heal, ev);
    if (fx.energy) { this.energy += fx.energy; ev.push({ t: 'energy', n: fx.energy }); }
    if (fx.nextEnergy) this.nextEnergy += fx.nextEnergy;
    if (fx.dmg || fx.rnd) {
      const live = this.alive();
      const targets = fx.all ? live : fx.random ? [live[Math.floor(this.rand() * live.length)]] : [target];
      const bonus = d.type === 'attack' ? this.boost : 0;
      if (bonus) this.boost = 0;
      for (let h = 0; h < (fx.hits || 1); h++) {
        for (const f of targets) {
          if (!f || !f.alive) continue;
          const base = fx.rnd ? fx.rnd[0] + Math.floor(this.rand() * (fx.rnd[1] - fx.rnd[0] + 1)) : fx.dmg;
          this.hurtFoe(f, Math.max(1, Math.round((base + bonus) * mul)), ev);
        }
      }
      if (fx.fade) for (const f of targets) if (f) this.fadeFoe(f, fx.fade, ev);
    } else if (fx.fade && target) this.fadeFoe(target, fx.fade, ev);
    if (fx.boost) { this.boost += fx.boost; ev.push({ t: 'boost', n: fx.boost }); }
    if (fx.draw) this.drawN(fx.draw, ev);
    if (fx.conjure) this.conjure(ev);
    if (fx.recall && this.last) {
      const j = this.discard.indexOf(this.last);
      if (j >= 0 && this.hand.length < RULES.handMax) { this.discard.splice(j, 1); this.hand.push(this.last); ev.push({ t: 'recall', card: this.last.uid }); }
    }
  }

  heal(n, ev) {
    const got = Math.min(n, this.chillMax - this.chill);
    this.chill += got;
    ev.push({ t: 'heal', n: got });
  }
  /** A foe whose colour is back takes double. */
  hurtFoe(f, n, ev) {
    if (f.colored) n *= 2;
    f.hp = Math.max(0, f.hp - n);
    ev.push({ t: 'hit', foe: f.uid, n, x2: f.colored });
    if (!f.hp) { f.alive = false; ev.push({ t: 'down', foe: f.uid, back: f.stolen }); }
  }
  /** Colour seeps back; a full gauge brings it back for a turn: the foe skips its move and takes double. */
  fadeFoe(f, n, ev) {
    if (!f.alive || f.colored) return;
    f.fade += n;
    ev.push({ t: 'fade', foe: f.uid, n });
    if (f.fade >= f.fadeMax) { f.fade = 0; f.colored = true; ev.push({ t: 'colour', foe: f.uid }); }
  }
  /** Bbaekko's chant: a random card for free, once — or a knot that only clogs the hand. */
  conjure(ev) {
    if (this.hand.length >= RULES.handMax) return;
    let c;
    if (this.rand() < RULES.knotChance) c = makeCard('knot', { temp: true });
    else {
      const pool = Object.keys(CARDS).filter((id) => id !== 'knot' && id !== 'chant');
      c = makeCard(pool[Math.floor(this.rand() * pool.length)], { temp: true, free: true });
    }
    this.hand.push(c);
    ev.push({ t: 'conjure', card: c.uid, id: c.id });
  }

  useDrink(i) {
    const id = this.drinks[i];
    if (!id || this.over) return null;
    const fx = DRINKS[id].fx, ev = [{ t: 'drink', id }];
    this.drinks.splice(i, 1);
    if (fx.energy) { this.energy += fx.energy; ev.push({ t: 'energy', n: fx.energy }); }
    if (fx.heal) this.heal(fx.heal, ev);
    return ev;
  }

  endTurn() {
    if (this.over) return [];
    const ev = [{ t: 'foes' }];
    this.jam = 0;
    for (const c of this.hand.filter((x) => CARDS[x.id].type === 'junk')) { this.hand.splice(this.hand.indexOf(c), 1); this.gone.push(c); ev.push({ t: 'untie', card: c.uid }); }
    for (const f of this.alive()) { if (this.over) break; this.act(f, ev); }
    this.check(ev);
    if (!this.over) ev.push(...this.startTurn());
    return ev;
  }

  act(f, ev) {
    if (f.colored) { f.colored = false; ev.push({ t: 'stunned', foe: f.uid }); return this.advance(f); }
    if (f.cancelled) { f.cancelled = false; ev.push({ t: 'paused', foe: f.uid }); return this.advance(f); }
    const it = f.intent;
    switch (it.k) {
      case 'hit': case 'ring': this.hurtTeam(it.dmg, f, it.k, ev); break;
      case 'wind': ev.push({ t: 'wind', foe: f.uid }); break;
      case 'nap': ev.push({ t: 'nap', foe: f.uid }); break;
      case 'jam': this.jam += it.n; ev.push({ t: 'jam', foe: f.uid, n: it.n }); break;
      case 'call':
        if (this.alive().length < 4) ev.push({ t: 'call', foe: f.uid, add: this.addFoe(it.foe).uid });
        else ev.push({ t: 'wind', foe: f.uid });
        break;
      case 'steal': f.stolen += it.n; ev.push({ t: 'steal', foe: f.uid, n: it.n }); break;
      case 'flee': f.alive = false; f.fled = true; this.lost += f.stolen; ev.push({ t: 'flee', foe: f.uid, n: f.stolen }); break;
    }
    if (f.alive) this.advance(f);
  }
  advance(f) { f.step++; f.intent = f.def.pattern[f.step % f.def.pattern.length]; }
  hurtTeam(n, f, k, ev) {
    const blocked = Math.min(this.foam, n);
    this.foam -= blocked;
    this.chill = Math.max(0, this.chill - (n - blocked));
    ev.push({ t: 'hurt', foe: f.uid, n: n - blocked, blocked, big: k === 'ring' });
    this.check(ev);
  }
  check(ev) {
    if (this.over) return;
    if (this.chill <= 0) { this.over = 'lost'; ev.push({ t: 'lost' }); }
    else if (!this.alive().length) { this.over = 'won'; ev.push({ t: 'won' }); }
  }
  /** Coins from foes brought back to colour (not the ones that ran off). */
  coins() { return this.foes.reduce((s, f) => s + (f.fled ? 0 : f.alive ? 0 : f.def.coins), 0); }
}

/** A commission played node by node: the deck, chill and drinks carry over between fights. */
export class Run {
  constructor(commission, { seed = Date.now() % 1e9, team = TEAM, night = false } = {}) {
    this.c = commission; this.seed = seed; this.team = team; this.night = night;
    this.rand = rng(seed ^ 0x5eed);
    this.deck = Object.entries(CARDS).filter(([, d]) => d.starter && team.includes(d.who)).map(([id]) => makeCard(id));
    this.chill = RULES.chill; this.chillMax = RULES.chill;
    this.drinks = commission.drinks.slice(0, RULES.drinks);
    this.node = 0;
    this.coins = 0; this.lost = 0; this.colored = []; this.picked = [];
    this.battle = null;
  }
  get here() { return this.c.nodes[this.node]; }
  fight() {
    this.battle = new Battle({ deck: this.deck, foes: this.here.foes, team: this.team, seed: Math.floor(this.rand() * 1e9), night: this.night,
      chill: this.chill, chillMax: this.chillMax, drinks: this.drinks });
    return this.battle;
  }
  /** After a fight: carry chill and drinks over, count the coins and what got its colour back. */
  settle() {
    const b = this.battle;
    this.chill = b.chill; this.drinks = b.drinks.slice();
    this.coins += b.coins(); this.lost += b.lost;
    for (const f of b.foes) if (!f.alive && !f.fled) this.colored.push(f.id);
  }
  /** Three cards the team could add (the ones not dealt at the start), or fewer when the pool runs dry. */
  offer(n = 3) {
    const have = new Set(this.deck.map((c) => c.id));
    const pool = Object.entries(CARDS).filter(([id, d]) => !d.starter && d.type !== 'junk' && this.team.includes(d.who) && !have.has(id)).map(([id]) => id);
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
    return out;
  }
  pick(id) { if (id) { this.deck.push(makeCard(id)); this.picked.push(id); } }
  rest() { const n = Math.min(this.here.heal, this.chillMax - this.chill); this.chill += n; return n; }
  next() { this.node++; return this.node < this.c.nodes.length; }
  /** Total coins: Hee Hee's tips on top. */
  payout() { return Math.round(this.coins * (this.team.includes('heehee') ? 1.15 : 1)); }
}

/** The auto button: the next move for the team, or null to end the turn. A plain heuristic, not a search:
 *  stop the biggest hit with Time Pause, block what is coming, heal when low, then hit the most urgent foe. */
export function autoMove(b) {
  if (b.over) return null;
  const live = b.alive(), playable = b.hand.filter((c) => b.canPlay(c));
  if (b.chill <= 20 && b.drinks.includes('cocoa')) return { drink: b.drinks.indexOf('cocoa') };
  if (!playable.length) {
    const esp = b.drinks.indexOf('espresso');
    return esp >= 0 && b.hand.some((c) => CARDS[c.id].type !== 'junk' && b.cost(c) <= b.energy + 2) && b.incoming() >= 10 ? { drink: esp } : null;
  }
  const byId = (id) => playable.find((c) => c.id === id);
  const threat = live.filter((f) => !f.colored && !f.cancelled).sort((a, z) => dmgOf(z) - dmgOf(a))[0];
  if (threat && dmgOf(threat) >= 10 && byId('timestop')) return { uid: byId('timestop').uid, foe: threat.uid };
  for (const id of ['mindread', 'charm', 'caffeine']) if (byId(id) && b.hand.length < RULES.handMax) return { uid: byId(id).uid };
  const need = b.incoming() - b.foam;
  const blocker = playable.filter((c) => CARDS[c.id].fx.foam).sort((a, z) => CARDS[z.id].fx.foam - CARDS[a.id].fx.foam)[0];
  if (blocker && need >= 6) return { uid: blocker.uid };
  if (b.chill < b.chillMax - 8 && byId('bloom')) return { uid: byId('bloom').uid };
  const urgent = live.find((f) => f.intent.k === 'steal' || f.intent.k === 'flee') || live.slice().sort((a, z) => a.hp - z.hp)[0];
  const attack = playable.filter((c) => CARDS[c.id].type === 'attack').sort((a, z) => b.cost(z) - b.cost(a))[0];
  if (attack) return { uid: attack.uid, foe: urgent && urgent.uid };
  const rest = playable.find((c) => !CARDS[c.id].fx.cancel && CARDS[c.id].type !== 'junk');
  if (rest) return { uid: rest.uid, foe: urgent && urgent.uid };
  return null;
}
const dmgOf = (f) => (f.intent.k === 'hit' || f.intent.k === 'ring' ? f.intent.dmg : f.intent.k === 'steal' || f.intent.k === 'flee' ? 8 : 0);
