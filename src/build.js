// Build mode: buy/place/move/rotate/sell furniture, paint floors, apply wallpaper, expand the room.
// The simulation is paused while building. Layouts that cut any floor off from the door, or block
// the working side of a stove/bar/restroom/arcade or every side of a chair, are refused with a reason.
import { World } from './world.js';
import { DIRS } from './iso.js';
import { furnitureById, floorById, wallById, EXPANSIONS, SELL_RATE } from './data.js';
import { tileKey, bus } from './util.js';
import { t } from './i18n.js';

export class Build {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tool = null;      // {mode:'place', type} | {mode:'floor', id}
    this.ghost = null;
    this.selected = null;
    this.moving = null;    // furniture lifted for moving: {f, x, y, dir}
    this.dir = 1;
    this.autoFace = true;
    this.hoverTile = null;
    this.message = null;
    this.painting = false;
  }

  enter() {
    const g = this.game;
    if (g.paused) return false;
    this.active = true; this.tool = null; this.ghost = null; this.selected = null; this.message = null;
    g.selected = null;
    bus.emit('build', true);
    return true;
  }
  exit() {
    if (this.moving) this.cancelMove();
    this.active = false; this.tool = null; this.ghost = null; this.selected = null; this.message = null;
    bus.emit('build', false);
  }

  setTool(tool) {
    if (this.moving) this.cancelMove();
    this.tool = tool; this.selected = null; this.autoFace = true;
    if (tool && tool.mode === 'place') this.dir = 1;
    this.message = null;
    this.refresh();
    bus.emit('buildChanged');
  }

  say(text, kind = 'info') { this.message = { text, kind }; bus.emit('buildChanged'); }

  // ---------------- validation ----------------
  inUse(f) {
    if (f.kind === 'chair' && f.seat && (f.seat.customer || f.seat.reserved)) return t('Someone is sitting there');
    if (f.kind === 'table' && f.seats && f.seats.some((s) => s.customer || s.reserved)) return t('Guests are at this table');
    if ((f.kind === 'stove' || f.kind === 'bar') && (f.cooking || f.ready || f.reservedBy)) return t('Busy cooking right now');
    if ((f.kind === 'toilet' || f.kind === 'arcade') && f.reservedBy) return t('Someone is using it');
    return null;
  }

  validate(type, x, y, dir) {
    const g = this.game, w = g.world;
    const tiles = w.tilesOf(type, x, y, dir);
    const res = { valid: false, reason: '', tiles, access: [], hint: '' };
    for (const tl of tiles) {
      if (!w.inBounds(tl.x, tl.y)) { res.reason = t('Out of the room'); return res; }
      if (w.furnitureAt(tl.x, tl.y)) { res.reason = t('Something is already there'); return res; }
      if (w.isEntry(tl.x, tl.y)) { res.reason = t('Keep the doorway clear'); return res; }
      if (g.agentTiles.has(tl.x, tl.y)) { res.reason = t('Someone is standing there'); return res; }
      if (w.trashAt(tl.x, tl.y)) { res.reason = t('Clean up that mess first'); return res; }
    }
    const blocked = new Set(tiles.map((t) => tileKey(t.x, t.y)));
    const reach = w.reachable(blocked);
    // every free floor tile must stay reachable from the door
    for (let i = 0; i < w.size; i++) for (let j = 0; j < w.size; j++) {
      const k = tileKey(i, j);
      if (!w.occ.has(k) && !blocked.has(k) && !reach.has(k)) { res.reason = t('That would cut off part of the floor from the door'); return res; }
    }
    // the new item needs its working side free
    const probe = { type, kind: furnitureById[type].kind, x, y, dir, fp: World.footprint(type, dir) };
    const acc = World.accessTiles(probe);
    res.access = acc.map((t) => ({ ...t, ok: reach.has(tileKey(t.x, t.y)) }));
    if (acc.length && !res.access.some((t) => t.ok)) {
      res.reason = probe.kind === 'chair' ? t('A chair needs a free side to sit down from') : t('Needs free floor in front (white dots)');
      return res;
    }
    if (probe.kind !== 'chair') res.access = res.access.filter((t) => w.inBounds(t.x, t.y));
    else res.access = [];
    // ...and must not block anyone else's
    for (const f of w.furniture) {
      const a = World.accessTiles(f);
      if (a.length && !a.some((t) => reach.has(tileKey(t.x, t.y)))) { res.reason = t('That blocks access to the {name}', { name: furnitureById[f.type].name }); return res; }
    }
    if (probe.kind === 'chair') {
      const d = DIRS[dir];
      const front = w.furnitureAt(x + d.dx, y + d.dy);
      if (!front || front.kind !== 'table') res.hint = t('Tip: chairs must face a table to seat guests (R to rotate)');
    }
    res.valid = true;
    return res;
  }

  bestChairDir(x, y) {
    const w = this.game.world;
    const ok = (d) => { const v = DIRS[d]; const t = w.furnitureAt(x + v.dx, y + v.dy); return t && t.kind === 'table'; };
    if (ok(this.dir)) return this.dir;
    for (let d = 0; d < 4; d++) if (ok(d)) return d;
    return this.dir;
  }

  // ---------------- pointer ----------------
  hover(tx, ty) {
    this.hoverTile = { x: tx, y: ty };
    this.refresh();
  }
  refresh() {
    const t = this.hoverTile, tool = this.tool;
    this.ghost = null;
    if (!t) return;
    if (this.moving) {
      const f = this.moving.f;
      if (f.kind === 'chair' && this.autoFace) this.dir = this.bestChairDir(t.x, t.y);
      const v = this.validate(f.type, t.x, t.y, this.dir);
      this.ghost = { type: f.type, x: t.x, y: t.y, dir: this.dir, ...v };
    } else if (tool && tool.mode === 'place') {
      const kind = furnitureById[tool.type].kind;
      if (kind === 'chair' && this.autoFace) this.dir = this.bestChairDir(t.x, t.y);
      const v = this.validate(tool.type, t.x, t.y, this.dir);
      this.ghost = { type: tool.type, x: t.x, y: t.y, dir: this.dir, ...v };
    } else if (tool && tool.mode === 'floor') {
      const w = this.game.world;
      this.ghost = { kind: 'floor', tiles: [t], valid: w.inBounds(t.x, t.y) };
    }
  }

  click(tx, ty) {
    const g = this.game, w = g.world;
    if (this.moving) return this.dropMove(tx, ty);
    const tool = this.tool;
    if (tool && tool.mode === 'place') return this.place(tool.type, tx, ty);
    if (tool && tool.mode === 'floor') return this.paint(tx, ty);
    const f = w.inBounds(tx, ty) ? w.furnitureAt(tx, ty) : null;
    this.selected = f;
    if (f) g.sfx('click');
    this.message = null;
    bus.emit('buildChanged');
  }

  rotate() {
    if (this.selected && !this.moving) return this.rotateSelected();
    this.dir = (this.dir + 1) % 4;
    this.autoFace = false;
    this.refresh();
    this.game.sfx('click');
  }

  // ---------------- actions ----------------
  place(type, x, y) {
    const g = this.game, cat = furnitureById[type];
    if (cat.level > g.state.level) return this.say(t('Unlocks at level {n}', { n: cat.level }), 'bad');
    const v = this.validate(type, x, y, this.dir);
    if (!v.valid) { g.sfx('error'); return this.say(v.reason, 'bad'); }
    if (!g.eco.spend(cat.price, cat.name)) return this.say(t('Not enough coins'), 'bad');
    const f = g.world.addFurniture(type, x, y, this.dir);
    f.bounce = 1;
    g.sfx('place');
    this.say(v.hint || t('Placed {name} (−{n})', { name: cat.name, n: cat.price }), v.hint ? 'warn' : 'good');
    this.refresh();
    g.changed('build');
  }

  paint(x, y) {
    const g = this.game, w = g.world, fl = floorById[this.tool.id];
    if (!w.inBounds(x, y) || w.floors[x][y] === fl.id) return;
    if (fl.level > g.state.level) return this.say(t('Unlocks at level {n}', { n: fl.level }), 'bad');
    if (!g.eco.spend(fl.price, fl.name)) { this.painting = false; return; }
    w.floors[x][y] = fl.id;
    g.sfx('tap');
    g.changed('build');
  }

  applyWallpaper(id) {
    const g = this.game, w = g.world, wp = wallById[id];
    if (wp.level > g.state.level) return this.say(t('Unlocks at level {n}', { n: wp.level }), 'bad');
    if (w.wallpaper === id) return this.say(t('Already on the walls!'));
    const cost = wp.price * (w.size * 2 - 1);
    if (!g.eco.spend(cost, wp.name)) return;
    w.wallpaper = id;
    g.sfx('place');
    this.say(t('Walls redecorated (−{n})', { n: cost }), 'good');
    g.changed('build');
  }

  nextExpansion() { return EXPANSIONS.find((e) => e.size > this.game.world.size) || null; }
  expand() {
    const g = this.game, e = this.nextExpansion();
    if (!e) return;
    if (e.level > g.state.level) return this.say(t('Reach level {n} to expand', { n: e.level }), 'bad');
    if (!g.eco.spend(e.price, 'the expansion')) return;
    g.world.resize(e.size);
    g.camera.setRoom(e.size);
    g.sfx('levelup');
    this.say(t('The restaurant is now {n}×{n}!', { n: e.size }), 'good');
    g.changed('build');
  }

  sellSelected() {
    const g = this.game, f = this.selected;
    if (!f) return;
    const busy = this.inUse(f);
    if (busy) return this.say(busy, 'bad');
    if (f.kind === 'stove' && g.world.byKind('stove').length <= 1) return this.say(t('You need at least one stove!'), 'bad');
    const cat = furnitureById[f.type];
    const refund = Math.floor(cat.price * SELL_RATE);
    this.detach(f);
    g.world.removeFurniture(f);
    g.state.coins += refund;
    this.selected = null;
    g.sfx('coin');
    this.say(t('Sold {name} (+{n})', { name: cat.name, n: refund }), 'good');
    g.changed('build');
  }

  detach(f) {
    const g = this.game;
    g.jobs.cancelWhere((j) => j.target === f || j.stove === f || j.station === f || (j.seat && (j.seat.chair === f || j.seat.table === f)));
  }

  rotateSelected() {
    const g = this.game, f = this.selected, w = g.world;
    const busy = this.inUse(f);
    if (busy) return this.say(busy, 'bad');
    const orig = { x: f.x, y: f.y, dir: f.dir };
    w.removeFurniture(f);
    for (let k = 1; k <= 4; k++) {
      const d = (orig.dir + k) % 4;
      if (d === orig.dir) break;
      const v = this.validate(f.type, orig.x, orig.y, d);
      if (v.valid) {
        f.dir = d; f.fp = World.footprint(f.type, d);
        w.furniture.push(f); w.changed();
        f.bounce = 1; g.sfx('click');
        this.say(t('Rotated'), 'good'); g.changed('build');
        return;
      }
    }
    w.furniture.push(f); w.changed();
    this.say(t("Can't rotate here — no room"), 'bad');
  }

  startMove() {
    const f = this.selected;
    if (!f) return;
    const busy = this.inUse(f);
    if (busy) return this.say(busy, 'bad');
    this.detach(f);
    this.moving = { f, x: f.x, y: f.y, dir: f.dir };
    this.dir = f.dir; this.autoFace = false;
    this.game.world.removeFurniture(f);
    this.say(t('Click a new spot · R rotates · Esc cancels'));
    this.refresh();
  }
  dropMove(x, y) {
    const g = this.game, m = this.moving, f = m.f;
    const v = this.validate(f.type, x, y, this.dir);
    if (!v.valid) { g.sfx('error'); return this.say(v.reason, 'bad'); }
    f.x = x; f.y = y; f.dir = this.dir; f.fp = World.footprint(f.type, this.dir);
    g.world.furniture.push(f); g.world.changed();
    f.bounce = 1;
    this.moving = null; this.selected = f;
    g.sfx('place');
    this.say(v.hint || t('Moved'), v.hint ? 'warn' : 'good');
    g.changed('build');
  }
  cancelMove() {
    const m = this.moving;
    if (!m) return;
    const f = m.f;
    f.x = m.x; f.y = m.y; f.dir = m.dir; f.fp = World.footprint(f.type, m.dir);
    this.game.world.furniture.push(f); this.game.world.changed();
    this.moving = null;
    this.selected = f;
    bus.emit('buildChanged');
  }

  escape() {
    if (this.moving) { this.cancelMove(); return true; }
    if (this.tool || this.selected) { this.tool = null; this.selected = null; this.ghost = null; this.message = null; bus.emit('buildChanged'); return true; }
    return false;
  }
}
