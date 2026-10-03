// Build mode: buy/place/move/rotate/sell furniture, hang/move/sell wall decorations, paint floors,
// apply wallpaper, expand the room.
// The simulation stands still while building and catches up to the wall clock afterwards (Game.catchUp).
// Layouts that cut any floor off from the door, or block the working side of a stove/bar/restroom/arcade
// or every side of a chair, are refused with a reason.
import { World, DOOR_Y } from './world.js';
import { DIRS } from './iso.js';
import { furnitureById, floorById, wallById, EXPANSIONS, SELL_RATE, wallDecorById, wallLayout, wallDoorSpan, WALL_GAP } from './data.js';
import { tileKey, bus } from './util.js';
import { t } from './i18n.js';

export class Build {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tool = null;      // {mode:'place', type} | {mode:'floor', id} | {mode:'wall', id} (a wall decoration)
    this.ghost = null;
    this.selected = null;
    this.moving = null;    // furniture lifted for moving: {f, x, y, dir}
    this.dir = 1;
    this.autoFace = true;
    this.hoverTile = null;
    this.message = null;
    this.painting = false;
    this.locked = false;   // the ghost is pinned to a spot and waits for ✓ (the pointer no longer drags it)
    this.hoverWall = null; // { side, a } the pointer is at while hanging a wall piece
    this.movingWall = null;   // id of the wall piece lifted for moving
    this.selectedWall = null; // id of the hung wall piece that is selected
  }

  enter() {
    const g = this.game;
    if (g.paused) return false;
    this.active = true; this.tool = null; this.ghost = null; this.selected = null; this.message = null; this.locked = false;
    this.hoverWall = null; this.movingWall = null; this.selectedWall = null;
    g.selected = null;
    bus.emit('build', true);
    return true;
  }
  exit() {
    if (this.moving) this.cancelMove();
    this.active = false; this.tool = null; this.ghost = null; this.selected = null; this.message = null; this.locked = false;
    this.hoverWall = null; this.movingWall = null; this.selectedWall = null;
    bus.emit('build', false);
  }

  setTool(tool) {
    if (this.moving) this.cancelMove();
    this.tool = tool; this.selected = null; this.autoFace = true; this.locked = false;
    this.movingWall = null; this.selectedWall = null;
    if (this.game.touchMode) { this.hoverTile = null; this.hoverWall = null; }   // a finger hasn't pointed anywhere yet
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
    if ((f.kind === 'stove' || f.kind === 'oven' || f.kind === 'bar') && (f.cooking || f.ready || f.reservedBy || (f.slots && f.slots.some((s) => s && (s.ticket || s.res))))) return t('Busy brewing right now');
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

  /** Can wall piece `id` hang at `a` along `side`? (`ignore`: the piece being moved) */
  validateWall(id, side, a, ignore = id) {
    const g = this.game, s = g.state, W = g.world.size * 2;
    const res = { kind: 'wall', id, side, a, valid: false, reason: '' };
    if (a < 1.0 || a > W - 1.0) { res.reason = t('Too close to the corner'); return res; }
    if (side === 'west') { const [lo, hi] = wallDoorSpan(DOOR_Y); if (a > lo && a < hi) { res.reason = t('Keep the doorway clear'); return res; } }
    const layout = wallLayout(g.world.size, DOOR_Y, s.wallDeco.filter((x) => x !== ignore), s.wallPos);
    for (const [oid, p] of Object.entries(layout)) {
      if (p.side === side && Math.abs(p.a - a) < WALL_GAP) { res.reason = t('Too close to the {name}', { name: wallDecorById[oid].name }); return res; }
    }
    res.valid = true;
    return res;
  }
  /** Hanging a wall piece (a new one, or one being moved). */
  wallMode() { return !!(this.movingWall || (this.tool && this.tool.mode === 'wall')); }

  bestChairDir(x, y) {
    const w = this.game.world;
    const ok = (d) => { const v = DIRS[d]; const t = w.furnitureAt(x + v.dx, y + v.dy); return t && t.kind === 'table'; };
    if (ok(this.dir)) return this.dir;
    for (let d = 0; d < 4; d++) if (ok(d)) return d;
    return this.dir;
  }

  // ---------------- pointer ----------------
  /** Placing a new item or carrying one that's being moved (the ghost follows the pointer). */
  placing() { return !!(this.moving || this.wallMode() || (this.tool && this.tool.mode === 'place')); }
  /** Pointer over a wall while hanging a piece: the ghost follows (unless it's pinned). */
  hoverWallAt(hit) {
    if (this.locked) return;
    this.hoverWall = hit ? { side: hit.side, a: hit.a } : null;
    this.refresh();
  }
  /** Click / tap a wall while hanging a piece: pin it there; tapping the same spot again hangs it. */
  tapWall(hit) {
    if (!hit) return;
    const h = this.hoverWall;
    if (this.locked && h && h.side === hit.side && Math.abs(h.a - hit.a) < 0.6 && this.ghost) return this.confirm();
    this.message = null;
    this.locked = false;
    this.hoverWallAt(hit);
    this.locked = true;
    this.game.sfx('tap');
    bus.emit('buildChanged');
  }
  /** A hung wall piece was tapped (no tool in hand): select it. */
  selectWall(id) {
    this.selected = null; this.selectedWall = id; this.message = null;
    this.game.sfx('click');
    bus.emit('buildChanged');
  }
  startMoveWall() {
    const id = this.selectedWall;
    if (!id) return;
    const spot = wallLayout(this.game.world.size, DOOR_Y, this.game.state.wallDeco, this.game.state.wallPos)[id];
    this.movingWall = id; this.selectedWall = null;
    this.hoverWall = spot ? { ...spot } : null; this.locked = !!spot;
    this.refresh();
    bus.emit('buildChanged');
  }
  sellSelectedWall() {
    const id = this.selectedWall;
    if (!id) return;
    this.selectedWall = null;
    this.game.eco.sellWallDecor(id);
    this.say(t('Sold {name} (+{n})', { name: wallDecorById[id].name, n: Math.floor(wallDecorById[id].price * 0.5) }), 'good');
  }
  /** Click / tap while placing: pin the ghost there (rotate · ✕ · ✓ float around it); tapping it again places it. */
  tapPreview(tx, ty) {
    const h = this.hoverTile;
    if (this.locked && h && h.x === tx && h.y === ty && this.ghost) return this.confirm();
    this.message = null;
    this.locked = false;
    this.hover(tx, ty);
    this.locked = true;
    this.game.sfx('tap');
    bus.emit('buildChanged');
  }
  /** Place / drop at the pinned ghost (the ✓ button). */
  confirm() {
    if (this.wallMode()) return this.confirmWall();
    const h = this.hoverTile;
    if (!h || !this.placing()) return;
    // a refused spot keeps the ghost where it is, so the player can rotate or pick another spot
    if (this.ghost && !this.ghost.valid) { this.game.sfx('error'); return this.say(this.ghost.reason, 'bad'); }
    this.click(h.x, h.y);
    this.locked = false;
    if (this.game.touchMode) { this.hoverTile = null; this.ghost = null; }
    bus.emit('buildChanged');
  }
  confirmWall() {
    const gh = this.ghost;
    if (!gh || gh.kind !== 'wall') return;
    if (!gh.valid) { this.game.sfx('error'); return this.say(gh.reason, 'bad'); }
    const pos = { side: gh.side, a: gh.a }, w = wallDecorById[gh.id];
    if (this.movingWall) {
      this.game.eco.moveWallDecor(gh.id, pos);
      this.say(t('Moved'), 'good');
    } else {
      if (!this.game.eco.buyWallDecor(gh.id, pos)) return this.say(t('Not enough coins'), 'bad');
      this.say(t('Hung the {name} (−{n})', { name: w.name, n: w.price }), 'good');
    }
    // hung or moved: done with it (tap it again to move or sell it)
    this.tool = null; this.movingWall = null; this.locked = false; this.ghost = null; this.hoverWall = null;
    this.selectedWall = null;
    bus.emit('buildChanged');
  }
  /** ✕ next to the ghost: stop placing this item (a moved one goes back where it was). */
  cancelPlacing() {
    this.locked = false;
    if (this.movingWall) { this.selectedWall = this.movingWall; this.movingWall = null; this.ghost = null; this.hoverWall = null; bus.emit('buildChanged'); }
    else if (this.moving) this.cancelMove(); else this.setTool(null);
    this.game.sfx('close');
  }
  hover(tx, ty) {
    if (this.locked) return;
    this.hoverTile = { x: tx, y: ty };
    this.refresh();
  }
  refresh() {
    const t = this.hoverTile, tool = this.tool;
    this.ghost = null;
    if (this.wallMode()) {
      const hw = this.hoverWall, id = this.movingWall || tool.id;
      if (hw) this.ghost = this.validateWall(id, hw.side, hw.a);
      return;
    }
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
    this.selected = f; this.selectedWall = null;
    if (f) g.sfx('click');
    this.message = null;
    bus.emit('buildChanged');
  }

  rotate() {
    if (this.wallMode()) return;   // wall pieces always face the room
    if (this.selected && !this.moving) return this.rotateSelected();
    this.dir = (this.dir + 1) % 4;
    this.autoFace = false;
    this.refresh();
    this.game.sfx('click');
    bus.emit('buildChanged');
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
    // bought: done with it, back to the shop (tap it again to rotate / move / sell it)
    this.tool = null; this.ghost = null; this.locked = false;
    this.say(v.hint || t('Placed {name} (−{n})', { name: cat.name, n: cat.price }), v.hint ? 'warn' : 'good');
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
    this.say(t('The café is now {n}×{n}!', { n: e.size }), 'good');
    g.changed('build');
  }

  sellSelected() {
    const g = this.game, f = this.selected;
    if (!f) return;
    const busy = this.inUse(f);
    if (busy) return this.say(busy, 'bad');
    if (f.kind === 'stove' && g.world.byKind('stove').length <= 1) return this.say(t('You need at least one espresso station!'), 'bad');
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
    this.hoverTile = { x: f.x, y: f.y }; this.locked = true;   // it starts pinned where it stood
    this.game.world.removeFurniture(f);
    this.message = null;
    this.refresh();
    bus.emit('buildChanged');
  }
  dropMove(x, y) {
    const g = this.game, m = this.moving, f = m.f;
    const v = this.validate(f.type, x, y, this.dir);
    if (!v.valid) { g.sfx('error'); return this.say(v.reason, 'bad'); }
    f.x = x; f.y = y; f.dir = this.dir; f.fp = World.footprint(f.type, this.dir);
    g.world.furniture.push(f); g.world.changed();
    f.bounce = 1;
    this.moving = null; this.selected = null;   // moved: done with it (tap it again for more)
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
    this.moving = null; this.locked = false;
    this.selected = f;
    bus.emit('buildChanged');
  }

  escape() {
    if (this.movingWall) { this.cancelPlacing(); return true; }
    if (this.selectedWall) { this.selectedWall = null; bus.emit('buildChanged'); return true; }
    if (this.locked) { this.locked = false; if (this.game.touchMode) { this.hoverTile = null; this.ghost = null; } bus.emit('buildChanged'); return true; }
    if (this.moving) { this.cancelMove(); return true; }
    if (this.tool || this.selected) { this.tool = null; this.selected = null; this.ghost = null; this.message = null; bus.emit('buildChanged'); return true; }
    return false;
  }
}
