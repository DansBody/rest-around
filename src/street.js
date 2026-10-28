// The street round the café (design/combat/DESIGN.md: the world is blue; the café is one of the few places with colour).
// Eight neighbour blocks ring the café block, one resident's shop on each. Each lot runs continuously from 0 to 2:
//   0  not restored: a pale grey halftone print, static
//   1  next up:      paper line-art (window frames, sign, awning stripes), now and then a glitch slice
//   2  restored:     full colour, like the café
// Purely cosmetic and story: nothing here touches the economy. `restoreLot(id)` is the entry point for the battle
// side (a resident's commission cleared); it plays the recovery (camera to the lot, heavy glitch, colour comes in,
// the Refillit OS "recovering <shop>.dat … RESTORED ✦" dialog in src/ui/street.js) and flies back to the café.
// Saved as state.street = { restored: [lot ids], next: lot id | null } (save.js checks it).
// The passers-by (ambient.js) live on the same object, so `game.street` is both.
import { Street as Passers } from './ambient.js';
import { clamp } from './util.js';
import { t } from './i18n.js';

const TILE = 2;
// metres of the layout (world units): the café block reaches SIDE past the room on every side (its sidewalk; the door
// side's is the old street's: x -6..-2), the ring roads are ROAD wide (the west one is the old road, x -12..-6), the
// neighbour blocks DEPTH deep
export const SIDE = 6, ROAD = 6, DEPTH = 16;

/** The residents' shops. Placeholder names and looks: the world / battle side supplies residents and story text.
 *  `storeys` 1 for the blocks in front of the café in the default view (so they never hide it). */
export const SHOPS = {
  bakery: { name: 'Bread shop', file: 'bakery.dat', sign: 'BAKERY', body: '#F7E7C4', trim: '#7A4E2D', awning: '#C99566', stripe: '#FFF3DD', signC: '#7A4E2D', glass: '#FFE9B8', storeys: 2 },
  flowers: { name: 'Flower shop', file: 'flower_shop.dat', sign: 'FLOWERS', body: '#CFEFE0', trim: '#2E6B55', awning: '#FF9EB5', stripe: '#FFFFFF', signC: '#2E6B55', glass: '#FFF6D8', storeys: 2 },
  books: { name: 'Bookshop', file: 'bookshop.dat', sign: 'BOOKS', body: '#E6E1F4', trim: '#3F5DAA', awning: '#3F5DAA', stripe: '#E6ECF5', signC: '#3F5DAA', glass: '#FFF2C9', storeys: 3 },
  records: { name: 'Record shop', file: 'record_shop.dat', sign: 'RECORDS', body: '#E3D7F7', trim: '#5B3F8C', awning: '#C9B8F5', stripe: '#FFFFFF', signC: '#5B3F8C', glass: '#FFEFD0', storeys: 2 },
  laundry: { name: 'Laundromat', file: 'laundromat.dat', sign: 'LAUNDRY', body: '#DDEEFB', trim: '#2C5E8C', awning: '#9FD3FF', stripe: '#FFFFFF', signC: '#2C5E8C', glass: '#FFFFFF', storeys: 2 },
  tailor: { name: 'Tailor', file: 'tailor.dat', sign: 'TAILOR', body: '#F3E3D3', trim: '#6B4A3A', awning: '#B9A08A', stripe: '#F7EEDF', signC: '#6B4A3A', glass: '#FFF3DE', storeys: 1 },
  greengrocer: { name: 'Greengrocer', file: 'greengrocer.dat', sign: 'GREENS', body: '#E7F1CF', trim: '#4F7A2E', awning: '#8DC26B', stripe: '#F6FBE8', signC: '#4F7A2E', glass: '#FFF8DC', storeys: 1 },
  bikes: { name: 'Bike repair', file: 'bike_repair.dat', sign: 'BIKES', body: '#DCE8EE', trim: '#3B5566', awning: '#F2C14E', stripe: '#3B5566', signC: '#3B5566', glass: '#F4F8FA', storeys: 1 },
};

/** The ring, in the order the street comes back (the battle side may restore them in any order). `face`: where the
 *  shopfront looks, onto a ring road (corners: the road in view of the default camera, or the one nearer it). */
export const LOTS = [
  { id: 'n', shop: 'bakery', face: [0, 1] },
  { id: 'nw', shop: 'flowers', face: [0, 1] },
  { id: 'w', shop: 'books', face: [1, 0] },
  { id: 'ne', shop: 'records', face: [0, 1] },
  { id: 'sw', shop: 'laundry', face: [1, 0] },
  { id: 'e', shop: 'tailor', face: [-1, 0] },
  { id: 's', shop: 'greengrocer', face: [0, -1] },
  { id: 'se', shop: 'bikes', face: [0, -1] },
];
export const LOT_IDS = LOTS.map((l) => l.id);
const BY_ID = Object.fromEntries(LOTS.map((l) => [l.id, l]));

/** state.street from a save (untrusted): only known lots, each once; `next` a lot not restored yet. */
export function cleanStreet(s) {
  const restored = s && Array.isArray(s.restored) ? s.restored.filter((id, i, a) => BY_ID[id] && a.indexOf(id) === i) : [];
  const next = s && BY_ID[s.next] && !restored.includes(s.next) ? s.next : LOT_IDS.find((id) => !restored.includes(id)) || null;
  return { restored, next };
}

/** The café block and the eight lots round a room `size` tiles square (they move out as the café expands). */
export function layout(size) {
  const N = size * TILE;
  const cafe = { x0: -SIDE, x1: N + SIDE, z0: -SIDE, z1: N + SIDE };
  const span = (k, a0, a1) => (k < 0 ? [a0 - ROAD - DEPTH, a0 - ROAD] : k > 0 ? [a1 + ROAD, a1 + ROAD + DEPTH] : [a0, a1]);
  const dirs = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0], nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };
  const lots = LOTS.map((l, i) => {
    const [kx, kz] = dirs[l.id], [x0, x1] = span(kx, cafe.x0, cafe.x1), [z0, z1] = span(kz, cafe.z0, cafe.z1);
    return { id: l.id, i, shop: l.shop, look: SHOPS[l.shop], face: { x: l.face[0], z: l.face[1] }, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
  });
  const ext = { x0: cafe.x0 - ROAD - DEPTH, x1: cafe.x1 + ROAD + DEPTH, z0: cafe.z0 - ROAD - DEPTH, z1: cafe.z1 + ROAD + DEPTH };
  return { cafe, lots, ext, N };
}

// the recovery, in seconds from restoreLot: the camera flies over, the dialog opens, the lot tears and the colour
// comes in, the slices snap shut, RESTORED, a beat to look, then back to the café
export const RECOVER = { fly: 1.4, dialog: 1.0, build: 1.4, tear: 1.9, colour0: 2.0, colour1: 3.2, shut: 3.4, bar0: 1.2, bar1: 3.6, back: 5.8, end: 7.2 };

export class Street extends Passers {
  constructor(game) {
    super(game);
    this.anim = null;     // the recovery playing: { id, t, from, cam, resolve }
    this.queue = [];      // further restoreLot calls wait their turn
  }
  get st() { const s = this.game.state; if (!s.street) s.street = cleanStreet(null); return s.street; }
  /** The lots as laid out round the café's current size: id, shop, centre (cx, cz), footprint (x0..x1, z0..z1), face, state. */
  get lots() { return layout(this.game.world.size).lots.map((l) => ({ ...l, name: t(l.look.name), state: this.lotState(l.id) })); }
  lot(id) { return this.lots.find((l) => l.id === id) || null; }
  isRestored(id) { return this.st.restored.includes(id); }
  /** The lot loading next (line-art, flickering), or null when the whole street is back. */
  nextId() { return this.st.next; }
  /** The battle side picks which lot is up next (a resident's commission taken, say). */
  setNext(id) {
    if (!BY_ID[id] || this.isRestored(id)) return false;
    this.st.next = id; this.game.changed('street');
    return true;
  }
  /** 0 grey, 1 loading, 2 restored (in between while the recovery plays). */
  lotState(id) {
    const a = this.anim;
    if (a && a.id === id) return animState(a);
    const q = this.queue.find((x) => x.id === id);
    if (q) return q.from;   // saved as restored already, still waiting for its recovery to play
    return this.isRestored(id) ? 2 : id === this.st.next ? 1 : 0;
  }
  /** How hard a lot tears right now (0..1) for the recovery; the idle flicker of the next lot is the view's. */
  lotGlitch(id) {
    const a = this.anim;
    if (!a || a.id !== id) return 0;
    const t = a.t, R = RECOVER;
    if (t < R.build) return 0;
    if (t < R.tear) return 0.3 + ((t - R.build) / (R.tear - R.build)) * 0.3;
    if (t < R.shut) return 0.9;
    return 0;
  }
  /** Restore a lot (a resident's commission cleared): saved at once, then the recovery plays. Resolves when the camera
   *  is back at the café (false when the lot is unknown or already restored). */
  restoreLot(id) {
    if (!BY_ID[id] || this.isRestored(id)) return Promise.resolve(false);
    const from = this.lotState(id);
    const st = this.st;
    st.restored.push(id);
    if (st.next === id || !st.next) st.next = LOT_IDS.find((x) => !st.restored.includes(x)) || null;
    this.game.changed('street');
    return new Promise((resolve) => {
      this.queue.push({ id, from: from >= 1 ? 1 : 0, resolve });
      if (!this.anim) this.startNext();
    });
  }
  /** Back to an untouched street (debug). */
  reset() {
    if (this.anim) this.finish();
    for (const q of this.queue) q.resolve(false);
    this.queue = [];
    this.game.state.street = cleanStreet(null);
    this.game.changed('street');
  }
  startNext() {
    const q = this.queue.shift();
    if (!q) return;
    const c = this.game.camera;
    this.anim = { ...q, t: 0, cam: { x: c.tx, z: c.tz, yaw: c.yawTarget, dist: c.distTarget }, phase: '' };
    this.flyToLot(q.id, 'recover');
  }
  /** Fly the camera to a lot, turned to see its shopfront. */
  flyToLot(id, why = 'look') {
    const l = layout(this.game.world.size).lots.find((x) => x.id === id);
    if (!l) return;
    const c = this.game.camera;
    // the quarter view whose camera stands most in front of the shop (of the two, the one nearer the current view)
    let best = null;
    for (let k = 0; k < 4; k++) {
      const yaw = Math.PI / 4 + (k * Math.PI) / 2;
      const facing = Math.sin(yaw) * l.face.x + Math.cos(yaw) * l.face.z;
      const turn = Math.abs(wrap(yaw - c.yawTarget));
      const score = facing * 10 - turn;
      if (!best || score > best.score) best = { yaw, score };
    }
    // far enough out to see the whole shopfront and its neighbours (about 30 units across; a phone held upright is
    // framed on its width, as far out as the camera goes)
    const aspect = c.vw / Math.max(1, c.vh), fit = Math.max(26, 30 / aspect) / (2 * Math.tan((c.fov * Math.PI) / 360));
    const dist = clamp(why === 'recover' ? fit : Math.max(c.distTarget, fit), 50, c.maxDist);
    c.flyTo(l.cx, l.cz, { yaw: c.yawTarget + wrap(best.yaw - c.yawTarget), dist });
  }
  /** Back to the café, as framed before. */
  flyHome() {
    const c = this.game.camera, n = this.game.world.size * TILE;
    c.flyTo(n / 2, n / 2, { yaw: c.yawTarget + wrap(Math.PI / 4 - c.yawTarget), dist: c.fitDist(this.game.world.size) });
  }
  /** Per real frame (from the renderer): plays the recovery and tells the UI where it is. */
  tick(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const R = RECOVER;
    const phase = a.t >= R.end ? 'end' : a.t >= R.back ? 'back' : a.t >= R.bar1 ? 'done' : a.t >= R.dialog ? 'loading' : 'fly';
    if (phase !== a.phase) {
      a.phase = phase;
      if (phase === 'done') this.game.sfx('levelup');
      if (phase === 'back') {
        const c = this.game.camera, k = a.cam;
        c.flyTo(k.x, k.z, { yaw: c.yawTarget + wrap(k.yaw - c.yawTarget), dist: k.dist });
      }
    }
    const l = BY_ID[a.id], look = SHOPS[l.shop];
    this.game.emit('streetRecover', { id: a.id, file: look.file, name: t(look.name), phase, t: a.t, p: clamp((a.t - R.bar0) / (R.bar1 - R.bar0), 0, 1) });
    if (phase === 'end') this.finish();
  }
  finish() {
    const a = this.anim;
    this.anim = null;
    this.game.emit('streetRecover', { id: a.id, phase: 'closed' });
    a.resolve(true);
    this.startNext();
  }
}

function animState(a) {
  const t = a.t, R = RECOVER;
  // a grey lot first comes up to line-art while the camera is on its way
  const s1 = a.from >= 1 ? 1 : clamp((t - 0.5) / (R.fly - 0.5), 0, 1);
  if (t < R.colour0) return s1;
  return 1 + clamp((t - R.colour0) / (R.colour1 - R.colour0), 0, 1);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Debug / console: restore the lot up next. */
export function restoreNext(game) {
  const id = game.street.nextId();
  if (!id) { game.toast(t('The whole street is back')); return Promise.resolve(false); }
  return game.street.restoreLot(id);
}
