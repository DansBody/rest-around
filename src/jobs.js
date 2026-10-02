// Job board: customers and the world post jobs; idle staff of the matching role claim them.
import { uid, manhattan, choice } from './util.js';
import { dishById, furnitureById, EXTRA_CAT } from './data.js';
import { stockIn, claim, freeSlot, shelvesUsed, PREBAKE_SLOTS } from './pastry.js';

// drink = a bake a guest ordered; prebake = one the baker makes ahead for the pastry case
const ROLE_OF = { order: 'waiter', deliver: 'waiter', clear: 'waiter', cook: 'chef', drink: 'bartender', prebake: 'bartender', sweep: 'cleaner', repair: 'cleaner' };
const PRIORITY = { deliver: 3, order: 2, clear: 2, cook: 1, drink: 1, prebake: 0, repair: 2, sweep: 1 };
const BAKES = new Set(['drink', 'prebake']);
export const JOB_LABEL = { order: 'Taking an order', deliver: 'Serving an order', clear: 'Clearing a table', cook: 'Brewing', drink: 'Baking', prebake: 'Baking for the case', place: 'Setting out a bake', sweep: 'Tidying up', repair: 'Repairing' };

export class Jobs {
  constructor(game) { this.game = game; this.list = []; }
  clear() { this.list = []; }

  add(type, data) {
    const j = { id: uid(), type, role: ROLE_OF[type], created: this.game.simTime, assignee: null, canceled: false, done: false, ...data };
    this.list.push(j);
    return j;
  }
  cancel(j) { if (j && !j.done) j.canceled = true; }
  finish(j) { if (j) j.done = true; }
  cancelWhere(pred) { for (const j of this.list) if (!j.done && !j.canceled && pred(j)) j.canceled = true; }

  update(dt) {
    // drop finished/canceled jobs nobody is holding
    this.list = this.list.filter((j) => !(j.done || (j.canceled && !j.assignee)));
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    // world-state driven jobs: trash, broken facilities, dirty tables (also restores them after loading a save)
    const w = this.game.world;
    const live = (pred) => this.list.some((j) => !j.done && !j.canceled && pred(j));
    for (const t of w.trash) if (!live((j) => j.trash === t)) this.add('sweep', { trash: t });
    for (const f of w.furniture) if (f.broken && !live((j) => j.target === f)) this.add('repair', { target: f });
    for (const s of w.seats) if (s.dirty && !s.customer && !live((j) => j.seat === s && j.type === 'clear')) this.add('clear', { seat: s });
    for (const j of this.list) {
      if (j.done || j.canceled) continue;
      if (j.type === 'sweep' && !w.trash.includes(j.trash)) this.cancel(j);
      if (j.type === 'repair' && (!j.target.broken || !w.furniture.includes(j.target))) this.cancel(j);
      if (j.type === 'clear' && (!j.seat.dirty || !w.seats.includes(j.seat))) this.cancel(j);
      if (j.type === 'prebake' && !j.assignee && !this.game.eco.bakeryReady()) this.cancel(j);
    }
    this.serveFromStock();
    this.planPrebake();
  }

  /** A guest's bake that nobody has started yet comes out of the case instead, if one is there. */
  serveFromStock() {
    const g = this.game, cases = g.world.byKind('bar');
    if (!cases.length) return;
    for (const j of this.pending('bartender')) {
      if (j.type !== 'drink' || j.ticket.state !== 'queued') continue;
      const st = stockIn(cases).find((x) => x.dish === j.ticket.dish);
      if (!st) continue;
      const t = j.ticket;
      this.cancel(j);
      g.eco.refund(t.dish);   // its ingredients were set aside when it was ordered
      claim(st.f, st.i, t);
      t.deliverJob = this.add('deliver', { ticket: t, stove: st.f, customer: t.customer });
    }
  }

  /** Keep the case stocked: an idle baker bakes ahead until PREBAKE_SLOTS shelves per case are used. */
  planPrebake() {
    const g = this.game, s = g.state, cases = g.world.byKind('bar');
    if (!g.eco.bakeryReady() || !g.day.isOpen || this.pending('bartender').some((j) => j.type === 'drink')) return;
    const coming = this.list.filter((j) => j.type === 'prebake' && !j.done && !j.canceled);
    const bakers = g.staff.filter((a) => a.role === 'bartender').length;
    if (coming.length >= bakers || shelvesUsed(cases) + coming.length >= cases.length * PREBAKE_SLOTS || !cases.some((f) => freeSlot(f) >= 0)) return;
    const menu = Object.keys(s.dishes).filter((id) => s.dishes[id].on && dishById[id].level <= s.level && dishById[id].cat === EXTRA_CAT && g.eco.canMake(id));
    if (!menu.length) return;
    // a bit of everything: bake whatever there is least of on the shelves
    const have = (id) => stockIn(cases).filter((x) => x.dish === id).length + coming.filter((j) => j.ticket.dish === id).length;
    const least = Math.min(...menu.map(have));
    const dish = choice(menu.filter((id) => have(id) === least));
    this.add('prebake', { ticket: { id: uid(), dish, kind: 'stock', state: 'queued' } });
  }

  pending(role) { return this.list.filter((j) => j.role === role && !j.assignee && !j.canceled && !j.done); }

  /** Choose the best job for a staff member; reserves the espresso station or oven it needs. */
  pick(staff) {
    const g = this.game;
    const cands = this.pending(staff.role);
    if (!cands.length) return null;
    const pos = { x: staff.tx, y: staff.ty };
    const scored = [];
    for (const j of cands) {
      let target = null;
      if (j.type === 'cook' || BAKES.has(j.type)) {
        target = g.jobs.freeStation(j.type === 'cook' ? 'stove' : 'oven', pos);
        if (!target) continue;
        if (BAKES.has(j.type) && !g.world.byKind('bar').length) continue;   // a bake goes out on a pastry case
      }
      const at = this.jobPos(j) || pos;
      const age = g.simTime - j.created;
      let score = PRIORITY[j.type] * 100 + age * 2 - manhattan(pos.x, pos.y, at.x, at.y) * 3;
      if (j.ticket && j.ticket.customer && target) {
        // don't sink time into orders whose guest will have left before the dish is ready
        const c = j.ticket.customer;
        const left = c.pRate > 0 ? c.patience / c.pRate : 99;
        if (left < dishById[j.ticket.dish].cook / (furnitureById[target.type].speed || 1) + 6) score -= 150;
      }
      scored.push({ j, score, target });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    best.j.assignee = staff;
    if (best.target) { best.j.station = best.target; best.target.reservedBy = staff; }
    return best.j;
  }

  jobPos(j) {
    if (j.customer) return { x: j.customer.tx, y: j.customer.ty };
    if (j.seat) return { x: j.seat.chair.x, y: j.seat.chair.y };
    if (j.trash) return { x: j.trash.x, y: j.trash.y };
    if (j.target) return { x: j.target.x, y: j.target.y };
    if (j.stove) return { x: j.stove.x, y: j.stove.y };
    return null;
  }

  /** Nearest reachable pastry case with an empty shelf. */
  freeCase(pos) {
    const w = this.game.world;
    let best = null, bd = 1e9;
    for (const f of w.byKind('bar')) {
      if (freeSlot(f) < 0 || !w.accessFor(f).length) continue;
      const d = manhattan(pos.x, pos.y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  freeStation(kind, pos) {
    const w = this.game.world;
    let best = null, bd = 1e9;
    for (const f of w.furniture) {
      if (f.kind !== kind || f.reservedBy || f.ready || f.cooking) continue;
      if (!w.accessFor(f).length) continue;
      const d = manhattan(pos.x, pos.y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /**
   * A guest left while their dish was cooking or waiting on the counter: hand it to another guest
   * who ordered the same dish and is still waiting in the queue, so the kitchen's work isn't wasted.
   */
  salvage(t) {
    const st = t.station;
    if (!st) return false;
    const cooking = st.cooking === t, ready = st.ready === t;
    if (!cooking && !ready) return false;
    const j2 = this.list.find((j) => (j.type === 'cook' || j.type === 'drink') && !j.assignee && !j.canceled && !j.done && j.ticket.dish === t.dish && j.ticket.state === 'queued');
    if (!j2) return false;
    const t2 = j2.ticket;
    this.cancel(j2);
    t2.station = st;
    if (cooking) {
      const cj = t.job;
      cj.ticket = t2; cj.customer = t2.customer; t2.job = cj; t2.state = 'cooking'; st.cooking = t2;
    } else {
      this.cancel(t.deliverJob);
      st.ready = t2; t2.state = 'ready';
      t2.deliverJob = this.add('deliver', { ticket: t2, stove: st, customer: t2.customer });
    }
    t.job = null; t.deliverJob = null; t.station = null;
    return true;
  }

  has(pred) { return this.list.some((j) => !j.done && !j.canceled && pred(j)); }
}
