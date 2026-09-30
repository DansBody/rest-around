// Game: owns the persistent state, the world, agents, and ticks every simulation system.
import { Camera } from './camera.js';
import { FX } from './fx.js';
import { World } from './world.js';
import { TileClaims } from './agent.js';
import { Jobs } from './jobs.js';
import { Customer } from './customer.js';
import { makeStaff } from './staff.js';
import { DayCycle } from './day.js';
import { Rating } from './rating.js';
import { Economy } from './economy.js';
import { Build } from './build.js';
import { audio } from './audio.js';
import { toScreen } from './iso.js';
import { DISHES, MAX_LEVEL } from './data.js';
import { bus } from './util.js';

export function defaultState() {
  const dishes = {};
  for (const d of DISHES) dishes[d.id] = { lv: 1, prog: {}, on: d.id === 'salad' || d.id === 'omurice' };
  return {
    v: 1,
    name: 'Maple Nook',
    coins: 200, points: 0, level: 1,
    rating: 2.6, service: [],
    day: 1, clock: 0,
    dishes,
    inv: { tomato: 2, lettuce: 2, egg: 2 },
    snacks: { cookie: 1 },
    garden: [],
    giftDay: 0,
    stats: null,
    totals: { served: 0, lost: 0, coins: 0, days: 0 },
    settings: { sound: true, volume: 0.7, autoNextDay: true },
    tutorialSeen: false,
  };
}

export class Game {
  constructor() {
    this.camera = new Camera();
    this.fx = new FX();
    this.agentTiles = new TileClaims();
    this.world = new World(8);
    this.agents = [];
    this.jobs = new Jobs(this);
    this.day = new DayCycle(this);
    this.rating = new Rating(this);
    this.eco = new Economy(this);
    this.build = new Build(this);
    this.debug = { grid: false, labels: false, assets: false };
    this.timeScale = 1;
    this.simTime = 0;
    this.renderTime = 0;
    this.paused = false;
    this.selected = null;
    this.doorOpen = 0;
    this.doorHold = 0;
    this.state = defaultState();
    this.renderer = null;
  }

  get level() { return this.state.level; }
  get staff() { return this.agents.filter((a) => a.kind === 'staff'); }
  get customers() { return this.agents.filter((a) => a.kind === 'customer'); }

  newGame() {
    this.state = defaultState();
    this.state.stats = this.day.freshStats();
    this.world = new World(8);
    this.agents = []; this.agentTiles.clear(); this.jobs.clear();
    const w = this.world;
    w.addFurniture('stove_basic', 6, 0, 1);
    w.addFurniture('table_oak', 3, 4, 1);
    w.addFurniture('chair_oak', 2, 4, 0);
    w.addFurniture('chair_oak', 4, 4, 2);
    w.addFurniture('table_oak', 3, 6, 1);
    w.addFurniture('chair_oak', 2, 6, 0);
    w.addFurniture('chair_oak', 4, 6, 2);
    w.addFurniture('plant_fern', 7, 7, 1);
    w.addFurniture('lamp_butter', 0, 7, 1);
    for (let x = 4; x < 8; x++) for (let y = 0; y < 2; y++) w.floors[x][y] = 'fl_cream';
    this.addStaff(makeStaff(this, 'waiter'), 2, 2);
    this.addStaff(makeStaff(this, 'chef'), 6, 2);
    this.eco.syncGarden();
    this.day.nextSpawn = 3;
    this.rating.recompute();
  }

  addStaff(s, x, y) {
    const w = this.world;
    let t = { x, y };
    if (!w.isWalkable(x, y) || this.agentTiles.has(x, y)) t = this.freeTileNear(x, y) || w.entry;
    s.placeAt(t.x, t.y);
    this.agents.push(s);
    return s;
  }
  removeAgent(a) {
    a.releaseAll();
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
    if (this.selected === a) this.selected = null;
  }

  /** Nearest walkable, unclaimed, non-access tile (BFS from x,y over walkable tiles). */
  freeTileNear(x, y, avoidAccess = true, filter = null) {
    const w = this.world;
    const access = avoidAccess ? this.accessSet() : null;
    const seen = new Set([x * 1000 + y]);
    const q = [[x, y]];
    while (q.length) {
      const [cx, cy] = q.shift();
      if (w.isWalkable(cx, cy) && !this.agentTiles.has(cx, cy) && !w.isEntry(cx, cy) && !(access && access.has(cx * 1000 + cy)) && (!filter || filter(cx, cy))) return { x: cx, y: cy };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = nx * 1000 + ny;
        if (w.inBounds(nx, ny) && !seen.has(k) && (w.isWalkable(nx, ny) || (cx === x && cy === y))) { seen.add(k); q.push([nx, ny]); }
      }
    }
    return null;
  }
  accessSet() {
    if (this._accessV === this.world.version) return this._access;
    const s = new Set();
    for (const f of this.world.furniture) if (f.kind !== 'chair') for (const t of World.accessTiles(f)) s.add(t.x * 1000 + t.y);
    this._access = s; this._accessV = this.world.version;
    return s;
  }

  // ---------------- tick ----------------
  update(realDt) {
    realDt = Math.min(realDt, 0.1);
    this.renderTime += realDt;
    this.fx.update(realDt);
    const running = !this.build.active && !this.paused;
    if (running) {
      let dt = realDt * this.timeScale;
      while (dt > 0) { const s = Math.min(dt, 0.05); this.step(s); dt -= s; }
    }
    // door animation (real time)
    const target = this.doorHold > 0 ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, realDt * 10);
    for (const a of this.agents) a.computePose(this.renderTime);
    for (const f of this.world.furniture) if (f.bounce) { f.bounce -= realDt * 2.5; if (f.bounce <= 0) f.bounce = 0; }
  }

  step(dt) {
    this.simTime += dt;
    if (this.doorHold > 0) this.doorHold -= dt;
    this.day.update(dt);
    for (const a of [...this.agents]) a.update(dt);
    this.agents = this.agents.filter((a) => !a.gone);
    this.jobs.update(dt);
    this.eco.update(dt);
    this.rating.update(dt);
  }

  /** Advance the simulation quickly without rendering (debug soak tests). Auto-starts new days. */
  fastForward(seconds, onDay) {
    const days = [];
    let t = 0;
    while (t < seconds) {
      if (this.paused) { days.push({ ...this.state.stats, day: this.state.day, rating: this.state.rating, coins: this.state.coins, level: this.state.level }); if (onDay) onDay(this); this.day.startNextDay(); }
      this.step(0.05); t += 0.05;
      this.fx.items.length = 0;
    }
    return days;
  }

  openDoor(t = 1.2) { this.doorHold = Math.max(this.doorHold, t); }

  // ---------------- helpers used by agents ----------------
  sfx(name) { audio.play(name); }
  worldPos(a) { return toScreen(a.x, a.y); }
  floatText(tileX, tileY, text, icon, color, lift = 110) {
    const p = toScreen(tileX, tileY);
    this.fx.text(p.x, p.y - lift, text, icon, color);
  }
  toast(msg, kind) { bus.emit('toast', { msg, kind }); }
  changed(what) { bus.emit('changed', what); }

  spawnCustomer(force = false) {
    const e = this.world.entry;
    if (this.agentTiles.has(e.x, e.y) && !force) return null;
    const c = new Customer(this);
    c.placeAt(e.x, e.y);
    this.agents.push(c);
    c.begin();
    return c;
  }

  levelProgress() {
    const s = this.state;
    return this.eco.levelProgress(s.points, s.level);
  }
  maxLevel() { return MAX_LEVEL; }
}
