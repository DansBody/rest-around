// Base agent: tile-to-tile movement with A*, per-tile claims for crowd avoidance, blocked-step
// handling (nudge idle blockers → re-route → brief ghosting so nobody can deadlock), and a small
// action queue (walk / face / wait / do) that the customer and staff brains script against.
import { findPath } from './pathfinding.js';
import { DIRS, dirFromDelta } from './iso.js';
import { tileKey, lerp, choice, uid } from './util.js';

export class TileClaims {
  constructor() { this.map = new Map(); }
  add(k, a) { let s = this.map.get(k); if (!s) this.map.set(k, (s = new Set())); s.add(a); }
  remove(k, a) { const s = this.map.get(k); if (s) { s.delete(a); if (!s.size) this.map.delete(k); } }
  others(x, y, a) { const s = this.map.get(tileKey(x, y)); if (!s) return []; return [...s].filter((o) => o !== a); }
  has(x, y) { const s = this.map.get(tileKey(x, y)); return !!(s && s.size); }
  claims(a) { return [...a.claimed].map((k) => ({ x: Math.floor(k / 1000), y: k % 1000 })); }
  clear() { this.map.clear(); }
}

export class Agent {
  constructor(game, kind, name, look) {
    this.game = game;
    this.id = uid();
    this.kind = kind;
    this.name = name;
    this.look = look;
    this.x = 0.5; this.y = 0.5;
    this.dir = 1;
    this.speed = 2;
    this.path = null;
    this.stepping = null;
    this.claimed = new Set();
    this.queue = [];
    this.visible = true;
    this.alpha = 1;
    this.onTile = null;      // furniture tile the agent occupies (chair)
    this.lift = 0;
    this.phase = 0;
    this.moving = false;
    this.blockedT = 0;
    this.ghost = false;
    this.replanned = false;
    this.mode = 'idle';
    this.expr = null;
    this.held = null;
    this.bubble = null;
    this.hopT = -1;
    this.shakeT = 0;
    this.seed = Math.random() * 10;
    this.stuckT = 0;
    this.task = 'Idle';
    this.pose = { mode: 'idle', t: 0 };
  }

  get tx() { return Math.floor(this.x); }
  get ty() { return Math.floor(this.y); }

  placeAt(x, y) {
    this.releaseAll();
    this.x = x + 0.5; this.y = y + 0.5;
    this.claim(x, y);
  }
  claim(x, y) { const k = tileKey(x, y); if (!this.claimed.has(k)) { this.claimed.add(k); this.game.agentTiles.add(k, this); } }
  release(x, y) { const k = tileKey(x, y); if (this.claimed.delete(k)) this.game.agentTiles.remove(k, this); }
  releaseAll() { for (const k of this.claimed) this.game.agentTiles.remove(k, this); this.claimed.clear(); }

  // -------- emotes & reactions --------
  emote(icon, dur = 2.2, icon2 = null) {
    this.bubble = { icon, icon2, t0: this.game.renderer ? this.game.renderer.time : 0, until: this.game.simTime + dur };
    this.game.sfx('pop');
  }
  hop() { this.hopT = 0; }

  // -------- action queue --------
  walk(x, y, opts = {}) { this.queue.push({ type: 'walk', x, y, goals: opts.goals, goalOk: opts.goalOk, onFail: opts.onFail }); return this; }
  face(dirOrTile) { this.queue.push({ type: 'face', v: dirOrTile }); return this; }
  wait(t, mode = null, opts = {}) { this.queue.push({ type: 'wait', t, mode, ...opts }); return this; }
  do(fn) { this.queue.push({ type: 'do', fn }); return this; }
  clearQueue() { this.queue.length = 0; this.path = null; }

  isIdleStanding() { return !this.stepping && !this.queue.length && !this.onTile && this.canNudge(); }
  canNudge() { return false; }

  nudge() {
    if (!this.isIdleStanding()) return;
    const w = this.game.world;
    const opts = DIRS.map((d) => ({ x: this.tx + d.dx, y: this.ty + d.dy })).filter((t) => w.isWalkable(t.x, t.y) && !this.game.agentTiles.has(t.x, t.y) && !w.isEntry(t.x, t.y));
    if (opts.length) this.walk(...Object.values(choice(opts)));
  }

  update(dt) {
    if (this.bubble && this.game.simTime > this.bubble.until) this.bubble = null;
    if (this.hopT >= 0) { this.hopT += dt / 0.42; if (this.hopT >= 1) this.hopT = -1; }
    if (this.shakeT > 0) this.shakeT -= dt;
    let guard = 12;
    while (guard-- > 0) {
      if (!this.queue.length) { this.think(dt); if (!this.queue.length) break; }
      const a = this.queue[0];
      if (a.type === 'do') { this.queue.shift(); a.fn(); continue; } // shift first: fn may rewrite the queue
      const r = this.run(a, dt);
      if (r === 'done') { this.queue.shift(); continue; }
      if (r === 'fail') { this.queue.shift(); if (a.onFail) a.onFail(); else this.onActionFail(a); continue; }
      break;
    }
    this.moving = !!this.stepping;
    // stuck detector (debug panel / soak tests): trying to walk but not moving
    const walking = this.queue.length && this.queue[0].type === 'walk';
    if (walking && Math.abs(this.x - this._lx) + Math.abs(this.y - this._ly) < 1e-5) this.stuckT += dt; else this.stuckT = 0;
    this._lx = this.x; this._ly = this.y;
    this.maxStuck = Math.max(this.maxStuck || 0, this.stuckT);
  }

  think() { /* brains override */ }
  onActionFail() { this.clearQueue(); }

  run(a, dt) {
    switch (a.type) {
      case 'do': a.fn(); return 'done';
      case 'face': {
        const v = a.v;
        this.dir = typeof v === 'number' ? v : dirFromDelta(v.x + 0.5 - this.x, v.y + 0.5 - this.y, this.dir);
        return 'done';
      }
      case 'wait': {
        if (a.elapsed == null) a.elapsed = 0;
        a.elapsed += dt;
        this.waitMode = a.mode;
        if (a.every) a.every(dt, a);
        if (a.until ? a.until() : a.elapsed >= a.t) { this.waitMode = null; return 'done'; }
        if (a.fail && a.fail()) { this.waitMode = null; return 'fail'; }
        return 'running';
      }
      case 'walk': return this.runWalk(a, dt);
    }
    return 'done';
  }

  planPath(a, avoid) {
    const goals = a.goals || [{ x: a.x, y: a.y }];
    const g = this.game;
    const cost = avoid ? (x, y) => {
      const o = g.agentTiles.others(x, y, this);
      if (!o.length) return 0;
      return o.some((b) => !b.stepping) ? 6 : 1.5;
    } : null;
    return findPath(g.world, this.tx, this.ty, goals, { goalOk: a.goalOk, cost });
  }

  runWalk(a, dt) {
    if (!a.started) {
      a.started = true;
      this.path = this.planPath(a, true);
      if (!this.path) return 'fail';
    }
    if (!this.stepping) {
      if (!this.path || !this.path.length) { this.path = null; return 'done'; }
      const next = this.path[0];
      const w = this.game.world;
      const last = this.path.length === 1;
      if (!w.isWalkable(next.x, next.y) && !(last && a.goalOk)) {
        this.path = this.planPath(a, true);
        if (!this.path) return 'fail';
        return 'running';
      }
      const others = this.game.agentTiles.others(next.x, next.y, this);
      const hardBlock = others.filter((o) => !o.ghost);
      if (hardBlock.length && !this.ghost) {
        this.blockedT += dt;
        this.dir = dirFromDelta(next.x - this.tx, next.y - this.ty, this.dir);
        for (const o of hardBlock) o.nudge();
        if (this.blockedT > 0.35 && !this.replanned) {
          this.replanned = true;
          const p = this.planPath(a, true);
          if (p) this.path = p;
        }
        if (this.blockedT > 1.6 + (this.id % 5) * 0.15) this.ghost = true; // pass through politely rather than deadlock
        return 'running';
      }
      this.path.shift();
      this.claim(next.x, next.y);
      const fx = this.x, fy = this.y;
      const tx = next.x + 0.5, ty = next.y + 0.5;
      this.stepping = { fx, fy, tx, ty, t: 0, from: { x: this.tx, y: this.ty }, len: Math.hypot(tx - fx, ty - fy) || 1 };
      this.dir = dirFromDelta(tx - fx, ty - fy, this.dir);
      this.blockedT = 0;
      this.replanned = false;
    }
    const s = this.stepping;
    const sp = this.speed * (this.speedMul || 1);
    s.t += (sp * dt) / s.len;
    this.phase += sp * dt * Math.PI * 1.6;
    const k = Math.min(1, s.t);
    this.x = lerp(s.fx, s.tx, k); this.y = lerp(s.fy, s.ty, k);
    if (s.t >= 1) {
      if (s.from.x !== Math.floor(s.tx) || s.from.y !== Math.floor(s.ty)) this.release(s.from.x, s.from.y);
      this.stepping = null;
      this.ghost = false;
      if (!this.path.length) { this.path = null; return 'done'; }
    }
    return 'running';
  }

  computePose(renderTime) {
    const p = this.pose;
    p.t = renderTime;
    p.phase = this.phase;
    p.moving = this.moving;
    p.mode = this.waitMode || this.baseMode();
    p.expr = this.expr;
    p.held = this.held;
    p.lift = this.lift;
    p.alpha = this.alpha;
    p.hop = this.hopT >= 0 ? this.hopT : 0;
    p.shake = this.shakeT > 0;
    p.seed = this.seed;
    return p;
  }
  baseMode() { return this.held && this.held.id === 'held_tray' ? 'carry' : 'idle'; }
  stateLabel() { return this.task; }
}
