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
import { Street } from './ambient.js';
import { Troubles } from './trouble.js';
import { audio } from './audio.js';
import { DISHES, MAX_LEVEL, START_WALL_DECOR, DAY } from './data.js';
import { bus } from './util.js';

/** Events drawn in the 3D scene (and the cut-in for them); the rest are for the HUD, panels and cards. */
const SCENE_EVENTS = new Set(['ability', 'kitCast', 'abilityWindup']);

export function defaultState() {
  const dishes = {};
  for (const d of DISHES) dishes[d.id] = { lv: 1, on: d.id === 'espresso' || d.id === 'americano' };
  return {
    v: 1,
    name: 'Sunny Café',
    coins: 200, points: 0, level: 1,
    rating: 2.6, service: [],
    round: 0, clock: 0,  // the round under way and sim seconds into it (both follow the wall clock, see clock.js)
    tz: 0,               // the player's time zone (minutes east of UTC), set from the device
    dishes,
    inv: { beans: 6, sugar: 3, milk: 2 },
    opened: {},          // servings left in each ingredient's opened pack (see Economy.consume)
    unpaid: false,       // yesterday's wages could not be paid
    wallDeco: [...START_WALL_DECOR],
    wallPos: {},          // wall decoration id -> { side, a } (where along that wall it hangs)
    daily: null,         // today's goals: { day, goals: [{ id, target, prog, claimed }], chest } (Economy.rollDaily)
    streak: { n: 0, day: 0 },   // daily gifts opened in a row, the last one on `day`
    vouchers: 0,         // study vouchers (研習券): spent with ingredients to level a dish
    snacks: { cookie: 1 },
    garden: [],
    giftDay: 0,          // the calendar day the gift was last opened
    stats: null,
    totals: { served: 0, lost: 0, coins: 0, rounds: 0 },
    settings: { sound: true, music: true, volume: 0.7, glass: true, autoRestock: true },
    tutorialSeen: false,
  };
}

export class Game {
  constructor() {
    this.camera = new Camera();
    this.lastTouch = 0;   // performance.now() of the last touch / drag (main.js draws every frame around it)
    this.fx = new FX();
    this.agentTiles = new TileClaims();
    this.world = new World(8);
    this.agents = [];
    this.jobs = new Jobs(this);
    this.day = new DayCycle(this);
    this.rating = new Rating(this);
    this.eco = new Economy(this);
    this.build = new Build(this);
    this.street = new Street(this);
    this.troubles = new Troubles(this);
    this.ambient = [];
    this.debug = { grid: false, labels: false, assets: false };
    this.timeScale = 1;
    this.clockSkew = 0;   // debug speed-up: how far this café's clock has run ahead of the wall (seconds, never saved)
    this.simTime = 0;
    this.renderTime = 0;
    this.paused = false;
    this.hold = false;    // a training mini-game is on screen: the café waits
    this.touchMode = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;   // updated by the last pointer used
    this.selected = null;
    this.doorOpen = 0;
    this.doorHold = 0;
    this.timeStopT = 0; this.timeStopDur = 0;   // Time Pause: every guest's patience is frozen
    this.spotlight = null;                       // Spotlight: { x, y, r, t, dur } over the busiest table
    this.state = defaultState();
    this.renderer = null;
    this.onLongGap = null;   // settles a stretch too long to play out on the spot (set by main.js)
    this.visit = false;   // a friend's café, run only to be looked at (src/visit.js): never saved, never talks to the HUD
  }

  get level() { return this.state.level; }
  get staff() { return this.agents.filter((a) => a.kind === 'staff'); }
  get customers() { return this.agents.filter((a) => a.kind === 'customer'); }

  newGame() {
    this.state = defaultState();
    this.state.stats = this.day.freshStats();
    this.world = new World(8);
    this.agents = []; this.agentTiles.clear(); this.jobs.clear();
    this.timeStopT = 0; this.spotlight = null;
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
    w.addFurniture('welcome', 1, 1, 1);
    w.addFurniture('cashier', 5, 0, 1);
    w.addFurniture('bookshelf', 2, 0, 1);
    w.addFurniture('sofa', 0, 5, 0);   // against the west wall, facing the room
    for (let x = 4; x < 8; x++) for (let y = 0; y < 2; y++) w.floors[x][y] = 'fl_cream';
    this.addStaff(makeStaff(this, 'waiter', 'mochalatte'), 2, 2);
    this.addStaff(makeStaff(this, 'chef', 'bbaekko'), 6, 2);
    this.day.snap();   // onto the wall clock (and the day's goal)
    this.day.nextSpawn = 3;
    this.rating.recompute();
  }

  addStaff(s, x, y) {
    const w = this.world;
    let t = { x, y };
    if (!w.isWalkable(x, y) || w.isEntry(x, y) || this.agentTiles.has(x, y)) t = this.freeTileNear(x, y) || w.entry;
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
    const running = !this.build.active && !this.paused && !this.hold;
    if (running) {
      if (this.timeScale !== 1) this.clockSkew += realDt * (this.timeScale - 1);
      // the café runs on the wall clock: play up to where it says, however long the game was not running
      const need = this.day.wallPos() - this.day.pos();
      if (need < -5) this.day.snap();   // ahead of the wall (the device clock or time zone moved back): never stand still waiting
      else if (need > 0.25 + 0.1 * this.timeScale) this.catchUp(need);
      else { let dt = Math.max(0, need); while (dt > 0) { const s = Math.min(dt, 0.05); this.step(s); dt -= s; } }
    }
    // door animation (real time)
    const target = this.doorHold > 0 ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, realDt * 10);
    for (const a of this.agents) a.computePose(this.renderTime);
    for (const w of this.ambient) w.computePose(this.renderTime);
    for (const f of this.world.furniture) if (f.bounce) { f.bounce -= realDt * 2.5; if (f.bounce <= 0) f.bounce = 0; }
  }

  step(dt) {
    this.simTime += dt;
    if (this.doorHold > 0) this.doorHold -= dt;
    this.day.update(dt);
    if (this.timeStopT > 0) this.timeStopT = Math.max(0, this.timeStopT - dt);
    if (this.spotlight && (this.spotlight.t -= dt) <= 0) this.spotlight = null;
    for (const a of [...this.agents]) a.update(dt);
    this.agents = this.agents.filter((a) => !a.gone);
    this.street.update(dt);
    this.jobs.update(dt);
    this.troubles.update(dt);
    this.eco.update(dt);
    this.rating.update(dt);
  }

  /**
   * The game was not running for `sec` seconds (build mode, a mini-game, a card on screen, a hidden tab):
   * play that time now, quickly and without drawing, so the café earns what it would have; a minute per
   * frame, so a long stretch never freezes the screen. Longer than a round it is settled the way the time
   * away is (onLongGap); a friend's café just jumps ahead.
   */
  catchUp(sec) {
    if (this.visit) { this.day.snap(); return; }
    if (sec > DAY.round) { if (this.onLongGap) this.onLongGap(sec); else this.day.snap(); return; }
    this.fastForward(Math.min(sec, 60));
  }

  /** Advance the simulation quickly without rendering (catching up, debug soak tests). Returns the rounds that closed. */
  fastForward(seconds) {
    let t = 0;
    this.fastForwarding = true;
    this.ffRounds = [];
    while (t < seconds) {
      const s = Math.min(0.05, seconds - t);
      this.step(s); t += s;
      this.fx.items.length = 0;
    }
    this.fastForwarding = false;
    return this.ffRounds;
  }

  openDoor(t = 1.2) { this.doorHold = Math.max(this.doorHold, t); }

  // ---------------- helpers used by agents ----------------
  /** The perk `id` of a staff member who is on their feet (e.g. Hee Hee's Blooming Tips), or null. */
  perk(id) { for (const a of this.staff) { if (a.napping) continue; const p = a.perk(id); if (p) return p; } return null; }
  /** Is the point (tile units) under Hee Hee's Spotlight? */
  inSpotlight(x, y) { const s = this.spotlight; return !!s && Math.hypot(x - s.x, y - s.y) <= s.r; }
  /** Is this café the one on screen? (Yours is not while you visit a friend.) */
  get shown() { return !this.renderer || this.renderer.game === this; }
  /** Only the café on screen makes sounds. */
  sfx(name) { if (this.shown) audio.play(name); }
  /** Tell the UI and the scene: only the café on screen shows its effects, and only your own café talks to the HUD, panels and cards. */
  emit(name, data) {
    if (SCENE_EVENTS.has(name) ? !this.shown : this.visit) return;
    bus.emit(name, data);
  }
  /** Rebuild a character's 3D model after its look changed (outfit editor). */
  refreshCharacter(a) { if (this.renderer) this.renderer.refreshCharacter(a); }
  /** World anchor for effects: grid position + height (legacy px, ~40 px per world unit). */
  at(gx, gy, hPx = 0) { return { gx, gy, h: hPx / 40 }; }
  floatText(tileX, tileY, text, icon, color, lift = 110) {
    this.fx.text(this.at(tileX, tileY, lift), text, icon, color);
  }
  toast(msg, kind) { this.emit('toast', { msg, kind }); }
  changed(what) { this.emit('changed', what); }

  /** A guest appears at one end of the street and walks to the door. */
  spawnCustomer(force = false) {
    if (!force && this.customers.filter((c) => c.state === 'arriving').length >= 4) return null;
    const c = new Customer(this);
    if (!force && this.troubles.rollRude()) c.makeRude();
    this.agents.push(c);
    c.begin(Math.random() < 0.5 ? -7 : this.world.size + 7);
    return c;
  }

  levelProgress() {
    const s = this.state;
    return this.eco.levelProgress(s.points, s.level);
  }
  maxLevel() { return MAX_LEVEL; }
}
