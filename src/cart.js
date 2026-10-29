// The coffee cart (opening-premise): a new café starts on an empty lot as a pop-up coffee cart, with no walls; the
// espresso station and the till are the cart, under a striped awning, on two wheels. The Lv3 expansion pops the
// shop up round it like a pop-up book (renderer.js). Everything here is made in code, flat colours like the rest.
import { THREE } from './models.js';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const DENIM = '#3f5daa', CREAM = '#fbf3e2', WOOD = '#8a5a3a', WOOD_DARK = '#5e3b26', IRON = '#2f3448';

/** Is the café still a cart: a new café (state.cart) that hasn't had its first expansion yet. */
export const isCart = (game) => !!game.state.cart && game.world.size <= 8;

let stripeTex = null, scallopTex = null, paveTex = null;
/** Denim and cream stripes running front to back. */
function stripes() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? CREAM : DENIM; x.fillRect(i * 16, 0, 16, 8); }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.magFilter = THREE.NearestFilter;
  return stripeTex;
}
/** The awning's front edge: the same stripes, cut into scallops at the bottom. */
function scallops() {
  if (scallopTex) return scallopTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? CREAM : DENIM;
    x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 16, 18);
    x.arc(i * 16 + 8, 18, 8, 0, Math.PI); x.closePath(); x.fill();
  }
  scallopTex = new THREE.CanvasTexture(c);
  scallopTex.colorSpace = THREE.SRGBColorSpace;
  scallopTex.wrapS = THREE.RepeatWrapping;
  return scallopTex;
}
/** Paving for the empty lot: worn cream stones in a running bond. */
export function paving() {
  if (paveTex) return paveTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#cfc4b2'; x.fillRect(0, 0, 128, 128);
  const tones = ['#ece3d3', '#e6dccb', '#f1e9db', '#e2d7c4'];
  for (let r = 0; r < 4; r++) for (let i = -1; i < 3; i++) {
    const w = 64, hgt = 32, ox = (r % 2) * 32;
    x.fillStyle = tones[(r * 3 + i + 4) % tones.length];
    x.beginPath(); x.roundRect(ox + i * w + 3, r * hgt + 3, w - 6, hgt - 6, 6); x.fill();
  }
  paveTex = new THREE.CanvasTexture(c);
  paveTex.colorSpace = THREE.SRGBColorSpace;
  return paveTex;
}

/** The tiles the cart stands over: the till and the espresso station next to it (inclusive tile box), and which way
 *  its front faces (away from the nearest wall). Null when there is no till yet. */
export function cartSpan(world) {
  const till = world.furniture.find((f) => f.kind === 'cashier');
  if (!till) return null;
  const tiles = (f) => world.tilesOf(f.type, f.x, f.y, f.dir);
  const own = tiles(till), cx = own[0].x, cy = own[0].y;
  const near = world.furniture.filter((f) => f.kind === 'stove')
    .map((f) => ({ f, d: Math.min(...tiles(f).map((t) => Math.abs(t.x - cx) + Math.abs(t.y - cy))) }))
    .sort((a, b) => a.d - b.d)[0];
  const all = [...own, ...(near && near.d <= 1 ? tiles(near.f) : [])];
  const box = { x0: Math.min(...all.map((t) => t.x)), x1: Math.max(...all.map((t) => t.x)), y0: Math.min(...all.map((t) => t.y)), y1: Math.max(...all.map((t) => t.y)) };
  const n = world.size, gaps = [['n', box.y0], ['s', n - 1 - box.y1], ['w', box.x0], ['e', n - 1 - box.x1]].sort((a, b) => a[1] - b[1]);
  return { ...box, back: gaps[0][0] };
}

/**
 * The cart round a span (cartSpan), in world units (tile = `tile`): two big wheels at the ends, a push handle, poles
 * and a striped awning sloping down to the front, and the café's sign on top. Its origin is on the floor, so the
 * renderer can pop it up by its y scale.
 */
export function buildCart(span, tile, signTex) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  // local frame: x along the back wall, +z towards the front
  const along = span.back === 'n' || span.back === 's';
  const L = (along ? span.x1 - span.x0 + 1 : span.y1 - span.y0 + 1) * tile;
  const D = (along ? span.y1 - span.y0 + 1 : span.x1 - span.x0 + 1) * tile;
  const wood = lam(WOOD), dark = lam(WOOD_DARK), iron = lam(IRON);
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; body.add(m); return m; };

  // wheels at both ends, a little forward of the middle
  for (const s of [-1, 1]) {
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 18), dark); rim.castShadow = true; wheel.add(rim);
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.92, 0.05), wood); sp.rotation.z = (k * Math.PI) / 4; wheel.add(sp); }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 10).rotateX(Math.PI / 2), iron));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(s * (L / 2 + 0.1), 0.52, 0.15);
    body.add(wheel);
  }
  // the push handle, out of one end
  for (const z of [-0.35, 0.35]) add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), wood), -L / 2 - 0.45, 1.0, z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8).rotateX(Math.PI / 2), dark), -L / 2 - 0.9, 1.0, 0);

  // poles at the four corners, and the awning sloping from the back (high) to past the front (lower)
  const back = -D / 2 + 0.12, front = D / 2 + 0.55, hiY = 3.05, loY = 2.45;
  for (const s of [-1, 1]) for (const [z, top] of [[back, hiY], [front, loY]]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, top, 8), iron), s * (L / 2 + 0.1), top / 2, z);
  const run = front - back, drop = hiY - loY, slope = Math.hypot(run, drop);
  const tex = stripes().clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round((L + 0.6) / 1.6)), 1);
  const roof = add(new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 0.05, slope + 0.2), [lam('#ffffff', { map: tex }), lam('#ffffff', { map: tex }), lam('#ffffff', { map: tex }), lam(DENIM), lam('#ffffff', { map: tex }), lam('#ffffff', { map: tex })]),
    0, (hiY + loY) / 2 + 0.03, (back + front) / 2);
  roof.rotation.x = Math.atan2(drop, run);
  const sc = scallops().clone(); sc.needsUpdate = true; sc.repeat.set(tex.repeat.x, 1);
  const valance = add(new THREE.Mesh(new THREE.PlaneGeometry(L + 0.6, 0.34), new THREE.MeshLambertMaterial({ map: sc, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })), 0, loY - 0.15, front + 0.1);
  valance.castShadow = false;
  // the café's name on a board above the awning's back edge
  if (signTex) {
    const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.4, L), Math.min(2.4, L) * 0.31), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide })), 0, hiY + 0.45, back + 0.05);
    sign.castShadow = false;
  }

  // into place: centred on the span, the front facing the room
  const cx = ((span.x0 + span.x1 + 1) / 2) * tile, cz = ((span.y0 + span.y1 + 1) / 2) * tile;
  g.position.set(cx, 0, cz);
  g.rotation.y = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[span.back];
  return g;
}
