// The café room: square floor grid, walls with the street door, furniture occupancy, seats, trash.
import { DIRS } from './iso.js';
import { furnitureById, floorById, wallById } from './data.js';
import { models } from './models.js';
import { uid, tileKey, randInt } from './util.js';

export const DOOR_Y = 3; // door sits in the left (x = -1) wall at this row; the room grows toward +x/+y so it never moves

export class World {
  constructor(size = 8) {
    this.size = size;
    this.floors = [];      // [x][y] -> floor catalog id
    this.wallpaper = 'wp_cream';
    this.furniture = [];
    this.trash = [];
    this.occ = new Map();  // tileKey -> furniture
    this.seats = [];
    this.version = 0;      // bumps whenever layout changes (path caches etc.)
    this.resize(size, 'fl_oak');
  }

  get entry() { return { x: 0, y: DOOR_Y }; }

  resize(size, defaultFloor = 'fl_oak') {
    const old = this.floors;
    this.floors = [];
    for (let x = 0; x < size; x++) {
      this.floors[x] = [];
      for (let y = 0; y < size; y++) this.floors[x][y] = (old[x] && old[x][y]) || defaultFloor;
    }
    this.size = size;
    this.changed();
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  furnitureAt(x, y) { return this.occ.get(tileKey(x, y)) || null; }
  isWalkable(x, y) { return this.inBounds(x, y) && !this.occ.has(tileKey(x, y)); }
  isEntry(x, y) { return x === 0 && y === DOOR_Y; }

  static footprint(type, dir) {
    const cat = furnitureById[type];
    const def = models.def(cat.asset);
    const [w, h] = (def && def.footprint) || [1, 1];
    return dir === 0 || dir === 2 ? [h, w] : [w, h];
  }

  tilesOf(type, x, y, dir) {
    const [w, h] = World.footprint(type, dir);
    const out = [];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push({ x: x + i, y: y + j });
    return out;
  }

  /** Tiles a worker/customer stands on to use the item (the side it faces). */
  static accessTiles(f) {
    const kind = furnitureById[f.type].kind;
    if (kind === 'table' || kind === 'decor') return [];
    const [w, h] = f.fp;
    const d = DIRS[f.dir];
    if (kind === 'chair') return DIRS.map((dd) => ({ x: f.x + dd.dx, y: f.y + dd.dy })).filter((_, i) => i !== f.dir);
    const out = [];
    if (d.dy === 1) for (let i = 0; i < w; i++) out.push({ x: f.x + i, y: f.y + h });
    if (d.dy === -1) for (let i = 0; i < w; i++) out.push({ x: f.x + i, y: f.y - 1 });
    if (d.dx === 1) for (let j = 0; j < h; j++) out.push({ x: f.x + w, y: f.y + j });
    if (d.dx === -1) for (let j = 0; j < h; j++) out.push({ x: f.x - 1, y: f.y + j });
    return out;
  }
  accessFor(f) { return World.accessTiles(f).filter((t) => this.isWalkable(t.x, t.y)); }

  addFurniture(type, x, y, dir, extra = {}) {
    const cat = furnitureById[type];
    if (!cat) return null;
    const f = { uid: uid(), type, kind: cat.kind, x, y, dir, fp: World.footprint(type, dir), uses: 0, broken: false, ...extra };
    if ((cat.kind === 'toilet' || cat.kind === 'arcade') && !f.breakAt) f.breakAt = randInt(cat.breakAfter[0], cat.breakAfter[1]);
    this.furniture.push(f);
    this.changed();
    return f;
  }
  removeFurniture(f) {
    const i = this.furniture.indexOf(f);
    if (i >= 0) this.furniture.splice(i, 1);
    this.changed();
  }
  moveFurniture(f, x, y, dir) {
    f.x = x; f.y = y; f.dir = dir; f.fp = World.footprint(f.type, dir);
    this.changed();
  }

  changed() {
    this.occ.clear();
    for (const f of this.furniture) for (const t of this.tilesOf(f.type, f.x, f.y, f.dir)) this.occ.set(tileKey(t.x, t.y), f);
    this.rebuildSeats();
    this.version++;
  }

  rebuildSeats() {
    const old = new Map(this.seats.map((s) => [s.chair.uid, s]));
    this.seats = [];
    for (const f of this.furniture) {
      if (f.kind !== 'chair') continue;
      const d = DIRS[f.dir];
      const t = this.furnitureAt(f.x + d.dx, f.y + d.dy);
      if (!t || t.kind !== 'table') { f.seat = null; continue; }
      const prev = old.get(f.uid);
      const seat = prev && prev.table === t ? prev : { chair: f, table: t, customer: null, reserved: null, food: null, drink: null, dirty: false };
      seat.table = t;
      f.seat = seat;
      this.seats.push(seat);
    }
    for (const f of this.furniture) if (f.kind === 'table') f.seats = this.seats.filter((s) => s.table === f);
  }

  byKind(kind) { return this.furniture.filter((f) => f.kind === kind); }

  floorOf(x, y) { return floorById[this.floors[x][y]] || floorById.fl_oak; }
  wall() { return wallById[this.wallpaper] || wallById.wp_cream; }

  // ---------------- trash ----------------
  addTrash(x, y) {
    if (!this.isWalkable(x, y) || this.trashAt(x, y)) return null;
    const t = { uid: uid(), x, y, rot: (Math.random() - 0.5) * 0.6, tint: ['#f1e7da', '#e6eef3', '#f3e1e6', '#eef0dc'][randInt(0, 3)], claimed: null };
    this.trash.push(t);
    return t;
  }
  trashAt(x, y) { return this.trash.find((t) => t.x === x && t.y === y) || null; }
  removeTrash(t) { const i = this.trash.indexOf(t); if (i >= 0) this.trash.splice(i, 1); }

  decorScore() {
    let s = 0;
    for (const f of this.furniture) s += furnitureById[f.type].decor || 0;
    for (let x = 0; x < this.size; x++) for (let y = 0; y < this.size; y++) s += this.floorOf(x, y).decor || 0;
    s += (this.wall().decor || 0) * this.size * 2;
    return s;
  }

  /** Flood fill from the entry over walkable tiles. Returns Set of tileKeys. */
  reachable(blocked) {
    const seen = new Set();
    const e = this.entry;
    const ok = (x, y) => this.inBounds(x, y) && !this.occ.has(tileKey(x, y)) && !(blocked && blocked.has(tileKey(x, y)));
    if (!ok(e.x, e.y)) return seen;
    const q = [[e.x, e.y]];
    seen.add(tileKey(e.x, e.y));
    while (q.length) {
      const [x, y] = q.pop();
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy, k = tileKey(nx, ny);
        if (!seen.has(k) && ok(nx, ny)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    return seen;
  }
}
