// Save/load to localStorage. Autosaves every 10 s and on unload. All storage access is wrapped in
// try/catch; corrupted or incompatible saves are backed up and the game starts fresh.
import { World } from './world.js';
import { Staff } from './staff.js';
import { sanitizeLook } from './looks.js';
import { defaultState } from './game.js';
import { furnitureById, floorById, wallById, DISHES, INGREDIENTS, SNACKS, ROLES, MAX_LEVEL, MAX_DISH_LEVEL, EXPANSIONS, ENERGY, LEVEL_POINTS } from './data.js';
import { bumpUid, clamp } from './util.js';

export const SAVE_KEY = 'restAround.save.v1';
const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);

export function serialize(game) {
  const w = game.world, s = game.state;
  return {
    v: 1,
    savedAt: Date.now(),
    state: { ...s, stats: s.stats },
    world: {
      size: w.size,
      floors: w.floors,
      wallpaper: w.wallpaper,
      furniture: w.furniture.map((f) => ({ t: f.type, x: f.x, y: f.y, d: f.dir, u: f.uses || 0, b: !!f.broken, ba: f.breakAt || 0 })),
      trash: w.trash.map((t) => ({ x: t.x, y: t.y })),
      dirty: w.seats.filter((st) => st.dirty).map((st) => [st.chair.x, st.chair.y]),
    },
    staff: game.staff.map((a) => ({ name: a.name, role: a.role, look: a.look, energy: Math.round(a.energy), skills: a.skills, x: a.tx, y: a.ty })),
  };
}

export function save(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(game)));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

/** @returns 'none' | 'loaded' | 'corrupt' */
export function load(game) {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return 'none'; }
  if (!raw) return 'none';
  try {
    const data = JSON.parse(raw);
    apply(game, data);
    return 'loaded';
  } catch (e) {
    console.warn('Corrupted save, starting fresh', e);
    try { localStorage.setItem(SAVE_KEY + '.corrupt', raw); localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    return 'corrupt';
  }
}

function apply(game, data) {
  if (!data || data.v !== 1 || !data.state || !data.world) throw new Error('bad save shape');
  const d = defaultState();
  const s = data.state;
  const st = {
    ...d,
    name: typeof s.name === 'string' ? s.name.slice(0, 24) : d.name,
    coins: Math.floor(num(s.coins, d.coins, 0, 1e9)),
    points: Math.floor(num(s.points, 0, 0, 1e9)),
    level: 1, // derived from points below (never trust a saved level)
    rating: num(s.rating, d.rating, 0, 5),
    service: Array.isArray(s.service) ? s.service.filter((v) => typeof v === 'number').slice(-24) : [],
    day: Math.floor(num(s.day, 1, 1, 1e6)),
    clock: num(s.clock, 0, 0, 10000),
    giftDay: Math.floor(num(s.giftDay, 0, 0, 1e6)),
    totals: { ...d.totals, ...(s.totals || {}) },
    settings: { ...d.settings, ...(s.settings || {}) },
    tutorialSeen: !!s.tutorialSeen,
  };
  while (st.level < MAX_LEVEL && st.points >= LEVEL_POINTS[st.level + 1]) st.level++;
  for (const dish of DISHES) {
    const x = s.dishes && s.dishes[dish.id];
    if (!x) continue;
    const prog = {};
    for (const i of dish.ings) prog[i] = Math.floor(num(x.prog && x.prog[i], 0, 0, 99));
    st.dishes[dish.id] = { lv: Math.floor(num(x.lv, 1, 1, MAX_DISH_LEVEL)), prog, on: !!x.on };
  }
  st.inv = {};
  for (const i of INGREDIENTS) { const n = Math.floor(num(s.inv && s.inv[i.id], 0, 0, 1e6)); if (n) st.inv[i.id] = n; }
  st.snacks = {};
  for (const sn of SNACKS) { const n = Math.floor(num(s.snacks && s.snacks[sn.id], 0, 0, 1e6)); if (n) st.snacks[sn.id] = n; }
  st.garden = Array.isArray(s.garden) ? s.garden.slice(0, 6).map((p) => ({ crop: p && typeof p.crop === 'string' ? p.crop : null, prog: num(p && p.prog, 0, 0, 1), water: num(p && p.water, 0, 0, 1) })) : [];
  const stats = s.stats && typeof s.stats === 'object' ? s.stats : null;
  st.stats = { ...game.day.freshStats(), ...(stats || {}) };

  // world
  const wd = data.world;
  const sizes = [8, ...EXPANSIONS.map((e) => e.size)];
  const size = sizes.includes(wd.size) ? wd.size : 8;
  const w = new World(size);
  if (Array.isArray(wd.floors)) for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) { const f = wd.floors[x] && wd.floors[x][y]; if (floorById[f]) w.floors[x][y] = f; }
  if (wallById[wd.wallpaper]) w.wallpaper = wd.wallpaper;
  for (const f of wd.furniture || []) {
    if (!f || !furnitureById[f.t]) continue;
    const dir = [0, 1, 2, 3].includes(f.d) ? f.d : 1;
    const x = Math.floor(num(f.x, -1)), y = Math.floor(num(f.y, -1));
    const tiles = w.tilesOf(f.t, x, y, dir);
    if (tiles.some((t) => !w.inBounds(t.x, t.y) || w.furnitureAt(t.x, t.y) || w.isEntry(t.x, t.y))) continue;
    const it = w.addFurniture(f.t, x, y, dir, { uses: Math.floor(num(f.u, 0, 0, 999)), broken: !!f.b });
    if (f.ba > 0) it.breakAt = Math.floor(f.ba);
  }
  if (!w.byKind('stove').length) { // a kitchen always needs a stove
    outer: for (let x = w.size - 1; x >= 0; x--) for (let y = 0; y < w.size - 1; y++) {
      if (!w.furnitureAt(x, y) && !w.furnitureAt(x, y + 1) && !w.isEntry(x, y) && !w.isEntry(x, y + 1)) { w.addFurniture('stove_basic', x, y, 1); break outer; }
    }
  }
  for (const t of wd.trash || []) if (t) w.addTrash(Math.floor(num(t.x, -1)), Math.floor(num(t.y, -1)));
  for (const [x, y] of Array.isArray(wd.dirty) ? wd.dirty : []) { const ch = w.furnitureAt(x, y); if (ch && ch.seat) ch.seat.dirty = true; }

  game.state = st;
  game.world = w;
  game.agents = []; game.agentTiles.clear(); game.jobs.clear();
  let maxId = 0;
  for (const sd of (data.staff || []).slice(0, 12)) {
    if (!sd || !ROLES[sd.role]) continue;
    const a = new Staff(game, sd.role, typeof sd.name === 'string' ? sd.name.slice(0, 16) : 'Pip', sanitizeLook(sd.look, sd.role));
    a.energy = num(sd.energy, 100, 0, 100);
    if (sd.skills && typeof sd.skills === 'object') for (const r of Object.keys(ROLES)) { const xp = num(sd.skills[r], 0, 0, 1e7); if (xp) a.skills[r] = Math.floor(xp); }
    game.addStaff(a, Math.floor(num(sd.x, 1)), Math.floor(num(sd.y, 1)));
    maxId = Math.max(maxId, a.id);
    if (a.energy <= 0) a.energy = Math.min(ENERGY.wakeAt, 5);
  }
  bumpUid(maxId + 1000);
  game.eco.syncGarden();
  game.day.nextSpawn = 4;
  game.rating.recompute();
}
