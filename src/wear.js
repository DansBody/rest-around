// The wardrobe: accessories (hats, glasses, a bow tie, a backpack) worn on a character's bones.
// Nothing is set up per character. Each character's head and body are measured once from their skinned
// mesh in the bind pose, and every accessory is fitted from that: hats and glasses are sized to the head's
// width, a hat rests on the top of the head (found along its centre line, so ears and tufts beside it
// don't lift it), glasses sit on the front of the face, a bow tie under the chin, a backpack on the back,
// a cane in the hand, long enough to reach the floor. A player only stores a small offset/tilt/size on top (look.wear).
import { THREE } from './models.js';
import { wearById, WEAR_SLOTS, WEAR_LIMITS } from './data.js';

const BONE = { head: 'head', face: 'head', neck: 'chest', back: 'chest', hand: 'hand' };
const shapes = new Map();   // model id -> { head, chest, hand, inv: { head, chest, hand } } | null
const V = new THREE.Vector3();

/** A cloud of bind-space points with its box and the top of its centre line. */
function part(pts) {
  if (!pts.length) return null;
  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(new THREE.Vector3()), cx = (box.min.x + box.max.x) / 2;
  let top = -Infinity;
  for (const q of pts) if (Math.abs(q.x - cx) < size.x * 0.25) top = Math.max(top, q.y);
  return { pts, box, size, top: top > -Infinity ? top : box.max.y };
}

/** The x/z extent of a part's points within `tol` of height y (falls back to the whole part). */
function slice(p, y, tol) {
  let s = p.pts.filter((q) => Math.abs(q.y - y) < tol);
  if (s.length < 6) s = p.pts;
  const lo = new THREE.Vector3(Infinity, 0, Infinity), hi = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const q of s) { lo.x = Math.min(lo.x, q.x); hi.x = Math.max(hi.x, q.x); lo.z = Math.min(lo.z, q.z); hi.z = Math.max(hi.z, q.z); }
  const cx = (lo.x + hi.x) / 2, w = hi.x - lo.x;
  // the front/back surface is taken near the middle, so cheeks, arms and ears don't count
  const mid = s.filter((q) => Math.abs(q.x - cx) < w * 0.2);
  const zs = (mid.length ? mid : s).map((q) => q.z);
  return { cx, w, cz: (lo.z + hi.z) / 2, front: Math.max(...zs), back: Math.min(...zs) };
}

/** Measure a character instance (cached per model): its head and chest as bind-space point clouds, and where its hand is. */
export function shape(modelId, inst) {
  if (shapes.has(modelId)) return shapes.get(modelId);
  let mesh = null;
  inst.root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  let out = null;
  if (mesh && inst.bones.head) {
    const { skeleton, geometry: g, bindMatrix } = mesh;
    const idx = { head: skeleton.bones.indexOf(inst.bones.head), chest: skeleton.bones.indexOf(inst.bones.chest), hand: skeleton.bones.indexOf(inst.bones.hand) };
    const pts = { head: [], chest: [] };
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      let j = si.getX(i), w = sw.getX(i);   // the bone that moves this vertex most
      if (sw.getY(i) > w) { j = si.getY(i); w = sw.getY(i); }
      if (sw.getZ(i) > w) { j = si.getZ(i); w = sw.getZ(i); }
      if (sw.getW(i) > w) { j = si.getW(i); }
      const k = j === idx.head ? 'head' : j === idx.chest ? 'chest' : null;
      if (k) pts[k].push(V.fromBufferAttribute(pos, i).applyMatrix4(bindMatrix).clone());
    }
    const head = part(pts.head);
    if (head) {
      out = { head, chest: part(pts.chest), hand: null, inv: {} };
      for (const k of ['head', 'chest', 'hand']) if (idx[k] >= 0) out.inv[k] = skeleton.boneInverses[idx[k]];
      if (out.inv.hand) out.hand = new THREE.Vector3().setFromMatrixPosition(out.inv.hand.clone().invert());
    }
  }
  shapes.set(modelId, out);
  return out;
}

/** Where an accessory goes on a measured character, in bind space: { pos, scale }. */
function anchor(item, s) {
  const top = s.head.top, bottom = s.head.box.min.y, H = top - bottom, W = s.head.size.x;
  if (item.slot === 'head') {
    const y = top - (item.sit ?? 0.2) * H;
    const c = slice(s.head, y, H * 0.05);
    return { pos: new THREE.Vector3(c.cx, y, c.cz), scale: W * (item.fit ?? 1) };
  }
  if (item.slot === 'face') {
    const y = bottom + (item.at ?? 0.5) * H;
    const c = slice(s.head, y, H * 0.05);
    return { pos: new THREE.Vector3(c.cx, y, c.front), scale: W * (item.fit ?? 0.6) };
  }
  if (item.slot === 'hand') {   // the grip in the hand, scaled to reach the floor (the hand bones stand upright in the bind pose)
    const at = s.hand || new THREE.Vector3(s.head.box.min.x, bottom * 0.6, s.head.box.max.z * 0.3);
    return { pos: at.clone(), scale: Math.max(0.2, at.y) * (item.fit ?? 1) };
  }
  const body = s.chest || s.head;
  if (item.slot === 'neck') {   // under the chin, on whatever is in front there (body, or the head if it overhangs)
    const y = Math.min(bottom, body.box.max.y) - body.size.y * 0.06;
    const c = slice(body, y, body.size.y * 0.08);
    return { pos: new THREE.Vector3(c.cx, y, c.front), scale: c.w * (item.fit ?? 0.4) };
  }
  const y = body.box.min.y + body.size.y * 0.55;   // back
  const c = slice(body, y, body.size.y * 0.1);
  return { pos: new THREE.Vector3(c.cx, y, c.back), scale: c.w * (item.fit ?? 0.8) };
}

// characters we can't measure (placeholders): rough spots relative to the head/chest bone
const FALLBACK = { head: [0, 1.1, 0, 0.9], face: [0, 0.6, 0.5, 0.7], neck: [0, 0.6, 0.35, 0.35], back: [0, 0.3, -0.4, 0.7], hand: [0, 0, 0, 0.7] };

/**
 * The local transform (relative to its bone) of an accessory worn on a character, with the player's
 * offset `t` ({ p: [x,y,z], r: [deg x,y,z], s }) applied in the character's own frame.
 */
export function fitMatrix(item, s, t = {}) {
  const p = t.p || [0, 0, 0], r = t.r || [0, 0, 0], k = t.s || 1;
  const base = item.rot || [0, 0, 0];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...[0, 1, 2].map((i) => THREE.MathUtils.degToRad(base[i] + r[i]))));
  if (!s) {
    const f = FALLBACK[item.slot];
    return new THREE.Matrix4().compose(new THREE.Vector3(f[0] + p[0], f[1] + p[1], f[2] + p[2]), q, new THREE.Vector3().setScalar(f[3] * k));
  }
  const a = anchor(item, s), sc = a.scale * k;
  const m = new THREE.Matrix4().compose(a.pos.add(new THREE.Vector3(...p)), q, new THREE.Vector3(sc, sc * (item.sy ?? 1), sc));
  const inv = s.inv[BONE[item.slot]] || s.inv.head;
  return inv.clone().multiply(m);   // bind space -> the bone's own space
}

/** The bone an accessory hangs from. */
export const wearBone = (item, bones) => bones[BONE[item.slot]] || bones.head;
/** Slots whose accessory is put away while the character's hands are busy or they sit down. */
export const HAND_SLOTS = ['hand'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, +v || 0));
/** A saved wardrobe made safe: known items in their own slots, offsets within WEAR_LIMITS. */
export function sanitizeWear(w) {
  const out = {};
  if (!w || typeof w !== 'object') return out;
  for (const slot of WEAR_SLOTS) {
    const e = w[slot], item = e && wearById(e.id);
    if (!item || item.slot !== slot) continue;
    const L = WEAR_LIMITS, o = { id: item.id };
    if (Array.isArray(e.p)) o.p = [0, 1, 2].map((i) => +clamp(e.p[i], -L.p, L.p).toFixed(3));
    if (Array.isArray(e.r)) o.r = [0, 1, 2].map((i) => Math.round(clamp(e.r[i], -L.r, L.r)));
    if (e.s != null) o.s = +clamp(e.s, L.s[0], L.s[1]).toFixed(2);
    out[slot] = o;
  }
  return out;
}
