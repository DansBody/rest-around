// Saves as plain JSON (serialize / apply), kept in localStorage. Online the server holds the real save and
// settles the time away (cloud.js); this browser's copy is then a cache, used to move a game online the first
// time and to play on when the server cannot be reached. All storage access is wrapped in try/catch;
// corrupted or incompatible saves are backed up and the game starts fresh.
import { World } from './world.js';
import { Staff } from './staff.js';
import { sanitizeLook } from './looks.js';
import { defaultState } from './game.js';
import { saveSlots, loadSlots } from './pastry.js';
import { DAY, furnitureById, floorById, wallById, DISHES, INGREDIENTS, SNACKS, ROLES, MAX_LEVEL, MAX_DISH_LEVEL, EXPANSIONS, ENERGY, LEVEL_POINTS, UNIQUE_NAMES, UNIQUE_MODELS, SEEDS, questById, DAILY, CLUBS, wallDecorById, START_WALL_DECOR, SERVINGS_PER_UNIT, OFFLINE, WEAR } from './data.js';
import { bumpUid, clamp } from './util.js';
import { settleOffline } from './offline.js';
import { localTz } from './clock.js';

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
      furniture: w.furniture.map((f) => ({ t: f.type, x: f.x, y: f.y, d: f.dir, u: f.uses || 0, b: !!f.broken, ba: f.breakAt || 0, ...(f.slots ? { s: saveSlots(f) } : {}) })),
      trash: w.trash.map((t) => ({ x: t.x, y: t.y })),
      dirty: w.seats.filter((st) => st.dirty).map((st) => [st.chair.x, st.chair.y]),
    },
    meta: { seats: w.seats.filter((st) => w.accessFor(st.chair).length).length },   // what the offline settlement needs but cannot derive without the 3D footprints
    staff: game.staff.map((a) => ({ name: a.name, role: a.role, look: a.look, energy: Math.round(a.energy), skills: a.skills, clubs: a.clubs, x: a.tx, y: a.ty })),
  };
}

export function save(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(game)));
    game.savedAt = Date.now();
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '.owner'); } catch { /* storage unavailable */ }
}

/** The save kept in this browser, unsettled: { data, owner } | 'none' | 'corrupt' (a broken one is backed up and removed).
 *  `owner` is the player (user id) it was last synced for; a save from before going online has none. */
export function readLocal() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return 'none'; }
  if (!raw) return 'none';
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !data.state || !data.world) throw new Error('bad save shape');
    let owner = null;
    try { owner = localStorage.getItem(SAVE_KEY + '.owner'); } catch { /* ignore */ }
    return { data, owner };
  } catch (e) {
    console.warn('Corrupted save', e);
    try { localStorage.setItem(SAVE_KEY + '.corrupt', raw); localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    return 'corrupt';
  }
}

/** Keep a copy of a save (from the server) in this browser, marked as `owner`'s. */
export function writeLocal(data, owner) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (owner) localStorage.setItem(SAVE_KEY + '.owner', owner);
  } catch { /* storage unavailable */ }
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
    round: Math.floor(num(s.round, 0, 0, 1e7)),   // saves from before the wall clock have none: the clock snaps to now
    clock: num(s.clock, 0, 0, DAY.round),
    tz: Math.round(num(s.tz, 0, -720, 840)),
    giftDay: Math.floor(num(s.giftDay, 0, 0, 1e7)),
    streak: { n: Math.floor(num(s.streak && s.streak.n, 0, 0, 7)), day: Math.floor(num(s.streak && s.streak.day, 0, 0, 1e7)) },
    vouchers: Math.floor(num(s.vouchers, 0, 0, 1e6)),
    totals: { ...d.totals, ...(s.totals || {}) },
    settings: { ...d.settings, ...(s.settings || {}) },
    tutorialSeen: !!s.tutorialSeen,
    partner: UNIQUE_MODELS.includes(s.partner) ? s.partner : null,
    tutorial: Array.isArray(s.tutorial) ? s.tutorial.filter((x, i, a) => typeof x === 'string' && x.length < 16 && a.indexOf(x) === i).slice(0, 16) : [],
  };
  while (st.level < MAX_LEVEL && st.points >= LEVEL_POINTS[st.level + 1]) st.level++;
  for (const dish of DISHES) {
    const x = s.dishes && s.dishes[dish.id];
    if (!x) continue;
    st.dishes[dish.id] = { lv: Math.floor(num(x.lv, 1, 1, MAX_DISH_LEVEL)), on: !!x.on };
  }
  st.inv = {};
  for (const i of INGREDIENTS) { const n = Math.floor(num(s.inv && s.inv[i.id], 0, 0, 1e6)); if (n) st.inv[i.id] = n; }
  // dishes used to be levelled by adding ingredients bit by bit: what was put in and not used goes back to the pantry
  for (const dish of DISHES) {
    const prog = s.dishes && s.dishes[dish.id] && s.dishes[dish.id].prog;
    for (const i of dish.ings) { const n = Math.floor(num(prog && prog[i], 0, 0, 99)); if (n) st.inv[i] = (st.inv[i] || 0) + n; }
  }
  st.opened = {};
  for (const i of INGREDIENTS) { const n = num(s.opened && s.opened[i.id], 0, 0, SERVINGS_PER_UNIT); if (n) st.opened[i.id] = n; }
  st.unpaid = !!s.unpaid;
  st.snacks = {};
  for (const sn of SNACKS) { const n = Math.floor(num(s.snacks && s.snacks[sn.id], 0, 0, 1e6)); if (n) st.snacks[sn.id] = n; }
  st.wardrobe = {};
  for (const w of WEAR) { const n = Math.floor(num(s.wardrobe && s.wardrobe[w.id], 0, 0, 99)); if (n) st.wardrobe[w.id] = n; }
  // the garden made way for the Training tab: whatever was growing goes to the pantry, as far as it had grown
  for (const p of Array.isArray(s.garden) ? s.garden.slice(0, 6) : []) {
    const seed = p && SEEDS.find((x) => x.crop === p.crop);
    const n = seed ? Math.round(seed.yield * num(p.prog, 0, 0, 1)) : 0;
    if (n) st.inv[seed.crop] = (st.inv[seed.crop] || 0) + n;
  }
  st.garden = [];
  // wall decorations & today's goals (saves from before the café opened start with the starter set)
  st.wallDeco = Array.isArray(s.wallDeco) ? s.wallDeco.filter((id, i, a) => wallDecorById[id] && a.indexOf(id) === i) : [...START_WALL_DECOR];
  st.wallPos = {};
  for (const id of st.wallDeco) {
    const p = s.wallPos && s.wallPos[id];
    if (p && ['north', 'west', 'east', 'south'].includes(p.side) && typeof p.a === 'number' && isFinite(p.a)) st.wallPos[id] = { side: p.side, a: clamp(p.a, 0, 100) };
  }
  // today's goals (saves from before the Today panel had one goal in `quest`: a new day's three come in its place)
  const dl = s.daily;
  const goals = dl && Array.isArray(dl.goals) ? dl.goals.filter((q, i, a) => q && questById[q.id] && a.findIndex((x) => x && x.id === q.id) === i).slice(0, DAILY.goals) : [];
  st.daily = goals.length ? {
    day: Math.floor(num(dl.day, 0, 0, 1e7)),
    goals: goals.map((q) => { const target = Math.max(1, Math.floor(num(q.target, 5, 1, 1e6))); return { id: q.id, target, prog: Math.floor(num(q.prog, 0, 0, target)), claimed: !!q.claimed }; }),
    chest: !!dl.chest,
  } : null;
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
    if (it.kind === 'bar') loadSlots(it, f.s);   // bakes left in the case stay for tomorrow
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
    if (sd.clubs && typeof sd.clubs === 'object') for (const c of Object.keys(CLUBS)) { const lv = Math.floor(num(sd.clubs[c], 0, 0, 1)); if (lv) a.clubs[c] = lv; }
    game.addStaff(a, Math.floor(num(sd.x, 1)), Math.floor(num(sd.y, 1)));
    maxId = Math.max(maxId, a.id);
    if (a.energy <= 0) a.energy = Math.min(ENERGY.wakeAt, 5);
  }
  // whatever the team is wearing is owned (saves from before the shop: the barista cap they had on, mostly)
  const wearing = {};
  for (const a of game.staff) for (const w of Object.values(a.look.wear || {})) wearing[w.id] = (wearing[w.id] || 0) + 1;
  for (const [id, n] of Object.entries(wearing)) st.wardrobe[id] = Math.max(st.wardrobe[id] || 0, n);
  bumpUid(maxId + 1000);
  game.troubles.newDay();
  game.day.nextSpawn = 4;
  // onto the wall clock: a short gap (under OFFLINE.minSeconds, which the settlement skips) is played out by
  // Game.catchUp; a longer one was settled already, and an old save from before the wall clock just jumps
  if (game.visit || !(st.round > 0) || game.day.wallPos() - game.day.pos() > OFFLINE.minSeconds) game.day.snap();
  else st.tz = localTz();
  if (!game.visit) game.eco.checkDate();
  game.rating.recompute();
}
