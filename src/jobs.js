// Job board: customers and the world post jobs; idle staff of the matching role claim them.
import { uid, manhattan } from './util.js';
import { dishById, furnitureById } from './data.js';

const ROLE_OF = { order: 'waiter', deliver: 'waiter', clear: 'waiter', cook: 'chef', drink: 'bartender', sweep: 'cleaner', repair: 'cleaner' };
const PRIORITY = { deliver: 3, order: 2, clear: 2, cook: 1, drink: 1, repair: 2, sweep: 1 };
export const JOB_LABEL = { order: 'Taking an order', deliver: 'Serving food', clear: 'Clearing a table', cook: 'Cooking', drink: 'Mixing a drink', sweep: 'Sweeping up', repair: 'Repairing' };

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
    }
  }

  pending(role) { return this.list.filter((j) => j.role === role && !j.assignee && !j.canceled && !j.done); }

  /** Choose the best job for a staff member; reserves stoves/bars as needed. */
  pick(staff) {
    const g = this.game;
    const cands = this.pending(staff.role);
    if (!cands.length) return null;
    const pos = { x: staff.tx, y: staff.ty };
    const scored = [];
    for (const j of cands) {
      let target = null;
      if (j.type === 'cook' || j.type === 'drink') {
        target = g.jobs.freeStation(j.type === 'cook' ? 'stove' : 'bar', pos);
        if (!target) continue;
      }
      const at = this.jobPos(j) || pos;
      const age = g.simTime - j.created;
      let score = PRIORITY[j.type] * 100 + age * 2 - manhattan(pos.x, pos.y, at.x, at.y) * 3;
      if (j.ticket && target) {
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
