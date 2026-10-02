// Saves as plain JSON (serialize / apply), kept in localStorage. Online the server holds the real save and
// settles the time away (cloud.js); this browser's copy is then a cache, used to move a game online the first
// time and to play on when the server cannot be reached. All storage access is wrapped in try/catch;
// corrupted or incompatible saves are backed up and the game starts fresh.
import { World } from './world.js';
import { Staff } from './staff.js';
import { sanitizeLook } from './looks.js';
import { defaultState } from './game.js';
import { furnitureById, floorById, wallById, DISHES, INGREDIENTS, SNACKS, ROLES, MAX_LEVEL, MAX_DISH_LEVEL, EXPANSIONS, ENERGY, LEVEL_POINTS, UNIQUE_NAMES, SEEDS, QUESTS, wallDecorById, START_WALL_DECOR, SERVINGS_PER_UNIT } from './data.js';
import { bumpUid, clamp } from './util.js';
import { settleOffline } from './offline.js';

// Kept from the game's old name (Rest Around) so saves survive the rename to Refillit.
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
    meta: { seats: w.seats.filter((st) => w.accessFor(st.chair).length).length },   // what the offline settlement needs but cannot derive without the 3D footprints
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

/** The save kept in this browser, unsettled: { data } | 'none' | 'corrupt' (a broken one is backed up and removed). */
export function readLocal() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return 'none'; }
  if (!raw) return 'none';
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.state || !data.world) throw new Error('bad save shape');
    return { data };
  } catch (e) {
    console.warn('Corrupted save', e);
    try { localStorage.setItem(SAVE_KEY + '.corrupt', raw); localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    return 'corrupt';
  }
}

/** Keep a copy of a save (from the server) in this browser. */
export function writeLocal(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

/** Playing without the server: load the browser's save and settle the time away here. @returns 'none' | 'loaded' | 'corrupt' */
export function load(game) {
  const local = readLocal();
  if (typeof local === 'string') return local;
  try {
    const data = local.data;
    // the café traded while the game was closed: settle that time first (a failure just skips it)
    let away = null;
    try { away = settleOffline(data, (Date.now() - (data.savedAt || Date.now())) / 1000); } catch (e) { console.warn('Offline settlement failed', e); }
    apply(game, away ? away.data : data);
    game.awayReport = away ? away.report : null;
    if (away) save(game);   // stamp the new time right away so the same stretch is never paid twice
    return 'loaded';
  } catch (e) {
    console.warn('Corrupted save, starting fresh', e);
    try { localStorage.setItem(SAVE_KEY + '.corrupt', JSON.stringify(local.data)); localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    return 'corrupt';
  }
}

/** Rebuild the game from a plain save (from this browser or the server). Throws on a broken save. */
export function apply(game, data) {
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
  st.opened = {};
  for (const i of INGREDIENTS) { const n = num(s.opened && s.opened[i.id], 0, 0, SERVINGS_PER_UNIT); if (n) st.opened[i.id] = n; }
  st.unpaid = !!s.unpaid;
  st.snacks = {};
  for (const sn of SNACKS) { const n = Math.floor(num(s.snacks && s.snacks[sn.id], 0, 0, 1e6)); if (n) st.snacks[sn.id] = n; }
  st.garden = Array.isArray(s.garden) ? s.garden.slice(0, 6).map((p) => ({ crop: p && SEEDS.some((x) => x.crop === p.crop) ? p.crop : null, prog: num(p && p.prog, 0, 0, 1), water: num(p && p.water, 0, 0, 1) })) : [];
  // wall decorations & the daily goal (saves from before the café opened start with the starter set)
  st.wallDeco = Array.isArray(s.wallDeco) ? s.wallDeco.filter((id, i, a) => wallDecorById[id] && a.indexOf(id) === i) : [...START_WALL_DECOR];
  st.wallPos = {};
  for (const id of st.wallDeco) {
    const p = s.wallPos && s.wallPos[id];
    if (p && ['north', 'west', 'east', 'south'].includes(p.side) && typeof p.a === 'number' && isFinite(p.a)) st.wallPos[id] = { side: p.side, a: clamp(p.a, 0, 100) };
  }
  const q = s.quest;
  st.quest = q && QUESTS.some((x) => x.id === q.id) ? { id: q.id, target: Math.max(1, Math.floor(num(q.target, 5, 1, 1e6))), prog: Math.floor(num(q.prog, 0, 0, 1e6)), done: !!q.done } : null;
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
  // litter that piled up while the café was unattended
  for (let n = Math.min(12, Math.floor(num(wd.extraTrash, 0, 0, 99))), tries = 0; n > 0 && tries < 80; tries++) if (w.addTrash(Math.floor(Math.random() * size), Math.floor(Math.random() * size))) n--;
  for (const [x, y] of Array.isArray(wd.dirty) ? wd.dirty : []) { const ch = w.furnitureAt(x, y); if (ch && ch.seat) ch.seat.dirty = true; }

  game.state = st;
  game.world = w;
  game.agents = []; game.agentTiles.clear(); game.jobs.clear();
  let maxId = 0;
  const worn = new Set();   // staff are original characters, one each: older saves with KayKit staff get the next free one
  for (const sd of (data.staff || [])) {
    if (!sd || !ROLES[sd.role]) continue;
    const look = sanitizeLook(sd.look, sd.role, worn);
    if (!look) continue;
    worn.add(look.model);
    const a = new Staff(game, sd.role, UNIQUE_NAMES[look.model], look);
    a.energy = num(sd.energy, 100, 0, 100);
    if (sd.skills && typeof sd.skills === 'object') for (const r of Object.keys(ROLES)) { const xp = num(sd.skills[r], 0, 0, 1e7); if (xp) a.skills[r] = Math.floor(xp); }
    game.addStaff(a, Math.floor(num(sd.x, 1)), Math.floor(num(sd.y, 1)));
    maxId = Math.max(maxId, a.id);
    if (a.energy <= 0) a.energy = Math.min(ENERGY.wakeAt, 5);
  }
  bumpUid(maxId + 1000);
  game.eco.syncGarden();
  game.day.nextSpawn = 4;
  if (!game.state.quest) game.eco.rollQuest();
  game.rating.recompute();
}
