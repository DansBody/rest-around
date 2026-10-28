// Paper-doll base (紙娃娃), modelled in code with three.js: the original barista of design/paper_doll/turnaround_v1.png.
// buildDoll() returns one mesh per slot (the game swaps and tints them) in the bind pose, plus the skeleton's rest
// joints. Hair is a cap plus pointed, flattened locks swept along curves (anime clumps, not blobs); the body and
// clothes are lathes, tapered tubes and bent panels. Units are the game's (1 floor tile = 2); y up, front +z, the
// character's left +x; 2.92 tall = 70 sprite px on the 64x96 doll grid. tools/dollpreview.html shows it live;
// its Export button hands the parts to tools/build_doll.py, which skins them and adds the clips.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ measurements (from the sheet)
export const HEIGHT = 2.92;
const SH = V(0.205, 1.913, 0), EL = V(0.43, 1.606, 0.005), WR = V(0.555, 1.291, 0.015);
const HIP = V(0.165, 1.04, 0), KNEE = V(0.205, 0.613, 0.01), ANKLE = V(0.21, 0.17, 0);
const HEAD = V(0, 2.33, -0.01);                  // skull centre
const SKULL = { x: 0.215, up: 0.27, down: 0.3, z: 0.245 };
const mir = (v, s) => V(v.x * s, v.y, v.z);

export const BONES = [
  ['root', null, V(0, 0, 0)], ['hips', 'root', V(0, 1.08, 0)],
  ['leg_l', 'hips', HIP], ['shin_l', 'leg_l', KNEE], ['foot_l', 'shin_l', ANKLE],
  ['leg_r', 'hips', mir(HIP, -1)], ['shin_r', 'leg_r', mir(KNEE, -1)], ['foot_r', 'shin_r', mir(ANKLE, -1)],
  ['chest', 'hips', V(0, 1.5, 0)], ['neck', 'chest', V(0, 1.98, -0.02)], ['head', 'neck', V(0, 2.06, -0.02)],
  ['arm_l', 'chest', SH], ['forearm_l', 'arm_l', EL], ['hand_l', 'forearm_l', WR],
  ['arm_r', 'chest', mir(SH, -1)], ['forearm_r', 'arm_r', mir(EL, -1)], ['hand_r', 'forearm_r', mir(WR, -1)],
];

export const PAL = {
  skin: '#fbe3d3', hair: '#5a3a26', hairTip: '#c99556', shirt: '#f4ecdc', cuff: '#e6dbc6', button: '#b98e64',
  coral: '#e5664a', apron: '#3d5089', apronDk: '#334477', stitch: '#d9a65a', bean: '#efe2c8', shorts: '#2e3247',
  tights: '#2a2328', boot: '#7b4a2c', bootDk: '#5e3720', sole: '#3a2418', lace: '#3f2416',
};

// ------------------------------------------------------------------ geometry helpers
function colour(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Keep only position/normal/color (and uv when asked) so geometries merge. */
function clean(geo, keepUv = false) {
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', ...(keepUv ? ['uv'] : [])].includes(k)) geo.deleteAttribute(k);
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  return geo;
}

function merge(list) { return mergeGeometries(list.map((g) => clean(g)), false); }

/** Flip a closed mesh's winding when most normals point at its middle. */
function outward(geo, centreOf = null) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  let score = 0;
  const box = new THREE.Box3().setFromBufferAttribute(p), c = box.getCenter(V());
  for (let i = 0; i < p.count; i++) {
    const q = centreOf ? centreOf(i) : c;
    score += (p.getX(i) - q.x) * n.getX(i) + (p.getY(i) - q.y) * n.getY(i) + (p.getZ(i) - q.z) * n.getZ(i);
  }
  if (score < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * Sweep an elliptic section along a curve through pts. w(t), h(t): half-width (along `side`) and half-thickness
 * (along `up`) at t in 0..1. up(p, t): the direction the thin side faces (e.g. away from the head). Rounded caps.
 */
function sweep(pts, { w, h = w, up = null, n = 16, seg = 10, capStart = true, capEnd = true, wave = null }) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const P = [], C = [], idx = [];
  let prevO = null;
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    let O = up ? up(p, t).clone() : (prevO ? prevO.clone() : (Math.abs(T.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)));
    O.sub(T.clone().multiplyScalar(O.dot(T))).normalize();
    prevO = O;
    const S = new THREE.Vector3().crossVectors(T, O).normalize();
    if (wave) p.add(S.clone().multiplyScalar(wave(t)));
    const ww = Math.max(w(t), 1e-4), hh = Math.max(h(t), 1e-4), ring = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      ring.push(P.length / 3);
      const q = p.clone().addScaledVector(S, ww * Math.cos(a)).addScaledVector(O, hh * Math.sin(a));
      P.push(q.x, q.y, q.z); C.push(p);
    }
    rings.push({ ring, p, T, r: Math.max(ww, hh) });
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
    const a = rings[i].ring[j], b = rings[i].ring[(j + 1) % seg], c = rings[i + 1].ring[(j + 1) % seg], d = rings[i + 1].ring[j];
    idx.push(a, b, c, a, c, d);
  }
  const cap = (k, dir, on) => {
    if (!on) return;
    const { ring, p, T, r } = rings[k], tip = p.clone().addScaledVector(T, dir * r * 0.6), ci = P.length / 3;
    P.push(tip.x, tip.y, tip.z); C.push(p);
    for (let j = 0; j < seg; j++) {
      const a = ring[j], b = ring[(j + 1) % seg];
      if (dir < 0) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  cap(0, -1, capStart); cap(n, 1, capEnd);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(idx);
  return outward(geo, (i) => C[i]);
}

/** A tube from a to b, radius r1 -> r2 (optionally bulging by `bulge` at its middle). */
function limb(a, b, r1, r2, bulge = 0) {
  const mid = a.clone().lerp(b, 0.5);
  return sweep([a, mid, b], { w: (t) => r1 + (r2 - r1) * t + bulge * Math.sin(Math.PI * t), n: bulge ? 6 : 3, seg: 10 });
}

function ball(c, rx, ry = rx, rz = rx, seg = 12) {
  return new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)).scale(rx, ry, rz).translate(c.x, c.y, c.z);
}

/** A lathe round the y axis through (cx, cz), squashed sx / sz: profile [[r, y], ...] bottom to top. */
function lathe(profile, sx = 1, sz = 1, seg = 22, cx = 0, cz = 0) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(sx, 1, sz).translate(cx, 0, cz);
  g.deleteAttribute('normal');
  return outward(clean(g), (i) => V(cx, g.attributes.position.getY(i), cz));
}

/**
 * A curved slab hugging a squashed body round the y axis: heights y0..y1, angles a0..a1 (0 = front, +x = left),
 * inner radius r(y) before the squash sx / sz, thickness `thick`.
 */
function panel(y0, y1, a0, a1, r, thick, sx = 1.15, sz = 0.82, nu = 24, nv = 8, cz = 0) {
  const P = [], idx = [], grid = (off) => {
    const base = P.length / 3;
    for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
      const y = y0 + (y1 - y0) * (v / nv), a = a0 + (a1 - a0) * (u / nu), rr = r(y) + off;
      P.push(Math.sin(a) * rr * sx, y, Math.cos(a) * rr * sz + cz);
    }
    return (u, v) => base + v * (nu + 1) + u;
  };
  const inn = grid(0), out = grid(thick);
  for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
    idx.push(out(u, v), out(u + 1, v), out(u + 1, v + 1), out(u, v), out(u + 1, v + 1), out(u, v + 1));
    idx.push(inn(u, v), inn(u + 1, v + 1), inn(u + 1, v), inn(u, v), inn(u, v + 1), inn(u + 1, v + 1));
  }
  const edge = (A, B) => { for (let k = 0; k < A.length - 1; k++) idx.push(A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]); };
  const col = (f, u) => [...Array(nv + 1).keys()].map((v) => f(u, v)), row = (f, v) => [...Array(nu + 1).keys()].map((u) => f(u, v));
  if (a1 - a0 < Math.PI * 2 - 1e-3) { edge(col(out, 0), col(inn, 0)); edge(col(inn, nu), col(out, nu)); }
  edge(row(inn, 0), row(out, 0)); edge(row(out, nv), row(inn, nv));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setIndex(idx);
  return outward(geo, (i) => V(0, P[i * 3 + 1], cz));
}

// ------------------------------------------------------------------ body
const TORSO = [[0.0, 0.94], [0.12, 0.955], [0.195, 1.0], [0.214, 1.08], [0.214, 1.17], [0.196, 1.3], [0.158, 1.47],
  [0.152, 1.56], [0.162, 1.68], [0.17, 1.78], [0.165, 1.86], [0.13, 1.92], [0.06, 1.955], [0.0, 1.96]];
const TSX = 1.15, TSZ = 0.82;
const torsoR = (y) => {                                     // the torso's lathe radius at height y
  for (let i = 0; i < TORSO.length - 1; i++) {
    const [r0, y0] = TORSO[i], [r1, y1] = TORSO[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return 0;
};

function headGeometry() {
  // a sphere pulled into an anime head: round skull, cheeks narrowing to a soft pointed chin a little forward
  const g = new THREE.SphereGeometry(1, 36, 26), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = headPoint(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function headPoint(x, y, z) {
  if (y >= 0) return [x * SKULL.x, HEAD.y + y * SKULL.up, HEAD.z + z * SKULL.z];
  const t = -y, wx = 1 - 0.42 * Math.pow(t, 1.8), wz = 1 - 0.32 * t * t;
  return [x * SKULL.x * wx, HEAD.y + y * SKULL.down, HEAD.z + z * SKULL.z * wz + 0.05 * t * t * Math.max(0, z)];
}

function body() {
  const parts = [lathe(TORSO, TSX, TSZ)];
  parts.push(limb(V(0, 1.9, -0.02), V(0, 2.12, -0.02), 0.052, 0.05));        // neck
  for (const s of [1, -1]) {
    const sh = mir(SH, s), el = mir(EL, s), wr = mir(WR, s);
    parts.push(limb(V(0.1 * s, 1.86, 0), sh, 0.07, 0.065), ball(sh, 0.066));
    parts.push(limb(sh, el, 0.062, 0.049), ball(el, 0.049), limb(el, wr, 0.047, 0.036));
    const d = wr.clone().sub(el).normalize();
    parts.push(sweep([wr.clone().addScaledVector(d, 0.0), wr.clone().addScaledVector(d, 0.07), wr.clone().addScaledVector(d, 0.13)],
      { w: (t) => 0.04 - 0.008 * t, h: (t) => 0.024, up: () => V(0, 0, 1), n: 6, seg: 10 }));              // mitten hand
    parts.push(limb(wr.clone().addScaledVector(d, 0.03).add(V(0, 0, 0.02)), wr.clone().addScaledVector(d, 0.075).add(V(0, 0, 0.05)), 0.016, 0.013));
    const hip = mir(HIP, s), knee = mir(KNEE, s), ankle = mir(ANKLE, s);
    parts.push(limb(hip.clone().add(V(0, 0.03, 0)), knee, 0.12, 0.082), ball(knee, 0.082));
    parts.push(limb(knee, ankle, 0.081, 0.056, 0.018));
    parts.push(ball(V(0.21 * s, 0.065, 0.06), 0.065, 0.06, 0.14));          // foot
  }
  return colour(merge(parts), PAL.skin);
}

// ------------------------------------------------------------------ face: painted onto the head in world terms
function paintFace(size = 512) {
  const W = size * 2, H = size, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const skin = hex(PAL.skin);
  const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // ellipse coverage (1 inside, soft edge) at (x, y)
  const ell = (x, y, cx, cy, rx, ry, rot = 0, soft = 0.003) => {
    const dx = x - cx, dy = y - cy, c = Math.cos(rot), s = Math.sin(rot);
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    return sm(-soft, soft, (1 - Math.hypot(u, v)) * Math.min(rx, ry));
  };
  const EY = 2.29;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const phi = (c / W) * Math.PI * 2, th = (r / H) * Math.PI;
    const ux = -Math.cos(phi) * Math.sin(th), uy = Math.cos(th), uz = Math.sin(phi) * Math.sin(th);
    const [x, y, z] = headPoint(ux, uy, uz);
    let col = skin.slice();
    const over = (m, h, a = 1) => { if (m <= 0) return; const k = m * a, q = hex(h); col = col.map((v, i) => v * (1 - k) + q[i] * k); };
    if (uz > 0.2) {
      for (const s of [-1, 1]) {
        const ex = 0.104 * s, rot = -0.06 * s;
        over(ell(x, y, 0.13 * s, 2.19, 0.042, 0.02, 0, 0.012), '#f2a08c', 0.5);                  // blush
        const sclera = ell(x, y, ex, EY, 0.05, 0.06, rot);
        over(sclera, '#fffaf2');
        const iris = Math.min(ell(x, y, ex + 0.004 * s, EY - 0.004, 0.039, 0.053), sclera);
        const gt = Math.min(1, Math.max(0, (y - (EY - 0.05)) / 0.1));
        over(iris, gt > 0.55 ? '#5a2c12' : gt > 0.25 ? '#a25a22' : '#e0933a');
        over(Math.min(ell(x, y, ex + 0.004 * s, EY + 0.004, 0.018, 0.028), sclera), '#2a140a');          // pupil
        over(ell(x, y, ex - 0.015 * s, EY + 0.022, 0.014, 0.016), '#ffffff');                        // highlights
        over(ell(x, y, ex + 0.017 * s, EY - 0.027, 0.007, 0.007), '#ffffff');
        const lid = Math.min(ell(x, y, ex, EY + 0.012, 0.058, 0.066, rot), 1 - ell(x, y, ex, EY - 0.002, 0.051, 0.061, rot));
        if (y > EY + 0.006) over(lid, '#2b1810');                                                     // heavy lash line
        over(ell(x, y, ex + 0.057 * s, EY + 0.032, 0.017, 0.006, 0.5 * s), '#2b1810');             // outer flick
        over(ell(x, y, ex + 0.004 * s, EY + 0.095, 0.042, 0.008, 0.1 * s), '#6a4430');             // brow
      }
      if (y < 2.146) over(Math.min(ell(x, y, 0, 2.142, 0.025, 0.013), 1 - ell(x, y, 0, 2.149, 0.024, 0.012)), '#8a3f30');   // smile
    }
    const o = (r * W + c) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ------------------------------------------------------------------ hair
const HC = V(0, 2.37, -0.03), HR = V(0.255, 0.3, 0.29);     // the hair cap's ellipsoid
/** A point on (lift > 0: off) the hair cap at yaw (0 = front, 90 = left) and pitch (90 = top), in degrees. */
function onCap(yaw, pitch, lift = 0) {
  const a = THREE.MathUtils.degToRad(yaw), b = THREE.MathUtils.degToRad(pitch);
  const dir = V(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b));
  const p = HC.clone().add(dir.clone().multiply(HR));
  const n = V(dir.x / HR.x, dir.y / HR.y, dir.z / HR.z).normalize();
  return p.addScaledVector(n, lift);
}
const awayFromHead = (p) => p.clone().sub(HC);

/** A pointed hair clump through [yaw, pitch, lift] stops: width W, thickness T at the root. */
function clump(stops, W, T = W * 0.4, { wave = 0, waves = 1.5 } = {}) {
  return sweep(stops.map((s) => (s.isVector3 ? s : onCap(...s))), {
    w: (t) => W * (0.8 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.4))) * (1 - Math.pow(t, 2.2)) + 0.002,   // full body, pointed end
    h: (t) => T * (1 - Math.pow(t, 1.6)) + 0.002,
    up: awayFromHead, n: 10, seg: 6, capEnd: false,
    wave: wave ? (t) => wave * Math.sin(t * Math.PI * 2 * waves) * t : null,
  });
}

function hair() {
  const parts = [];
  // the cap, with the face left open
  const cap = new THREE.SphereGeometry(1, 26, 18);
  cap.scale(HR.x, HR.y, HR.z).translate(HC.x, HC.y, HC.z);
  const p = cap.attributes.position, keep = [];
  const idx = cap.index.array;
  const inFace = (i) => p.getZ(i) > 0.02 && p.getY(i) < 2.45 && Math.abs(p.getX(i)) < 0.205;
  for (let i = 0; i < idx.length; i += 3) if (!(inFace(idx[i]) && inFace(idx[i + 1]) && inFace(idx[i + 2]))) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  cap.setIndex(keep); cap.computeVertexNormals();
  parts.push(cap);
  // bangs: separate pointed clumps over the forehead, tips stopping at the brows, a longer one between the eyes
  for (const [yaw, tipP, w, bend] of [[-44, 4, 0.06, -6], [-31, 9, 0.065, -4], [-18, 2, 0.068, -3], [-5, -6, 0.07, 2],
    [9, 3, 0.068, 4], [22, 8, 0.066, 5], [35, 1, 0.064, 6], [47, 6, 0.058, 8]]) {
    parts.push(clump([[yaw * 0.4, 80, 0.0], [yaw * 0.8, 52, 0.06], [yaw * 0.95, 26, 0.05], [yaw + bend, tipP, 0.03]], w, 0.032));
  }
  // locks framing the face down to the jaw, wavy
  for (const s of [1, -1]) {
    parts.push(clump([[50 * s, 50, 0.02], [58 * s, 15, 0.05], [60 * s, -25, 0.07], [55 * s, -62, 0.06]], 0.06, 0.026, { wave: 0.02, waves: 1.2 }));
    parts.push(clump([[70 * s, 48, 0.02], [78 * s, 10, 0.08], [82 * s, -30, 0.11], [80 * s, -66, 0.12]], 0.07, 0.03, { wave: 0.025, waves: 1.3 }));
  }
  // side volume: puffs out past the ears, then the ends flick outward and up
  for (const s of [1, -1]) {
    for (const [yaw, len, out_] of [[88, -46, 0.24], [100, -54, 0.27], [114, -58, 0.28], [128, -56, 0.27], [142, -60, 0.25],
      [95, -30, 0.2], [122, -36, 0.22]]) {
      parts.push(clump([[yaw * s * 0.85, 62, 0.01], [yaw * s, 25, 0.05], [yaw * s, -12, 0.14], [yaw * s, len, out_],
        [(yaw - 3) * s, len + 3, out_ + 0.05]], 0.14, 0.05, { wave: 0.03, waves: 1.4 }));
    }
  }
  // back: a full fan down to the shoulders, wavy, lengths varied
  for (let i = 0; i < 13; i++) {
    const yaw = 126 + i * 9, len = -62 - (i % 2) * 6 + Math.abs(i - 6) * 1.2;
    parts.push(clump([[yaw, 68, 0.02], [yaw, 25, 0.11], [yaw, -18, 0.17], [yaw, len, 0.2]], 0.14, 0.05, { wave: 0.028, waves: 1.3 }));
  }
  // crown: volume on top, locks radiating from the whorl
  for (let i = 0; i < 12; i++) {
    const yaw = i * 30 + 8;
    parts.push(clump([[yaw, 89, 0.03], [yaw, 70, 0.08], [yaw + 10, 45, 0.08], [yaw + 14, 22, 0.05]], 0.1, 0.035));
  }
  // the ahoge
  const top = onCap(0, 90, 0);
  parts.push(sweep([top.clone().add(V(0, -0.02, 0)), top.clone().add(V(-0.02, 0.1, 0.02)), top.clone().add(V(0.04, 0.17, 0.01)),
    top.clone().add(V(0.1, 0.14, 0.01)), top.clone().add(V(0.1, 0.08, 0.01))],
  { w: (t) => 0.022 * (1 - t) + 0.002, h: (t) => 0.014 * (1 - t) + 0.002, n: 16, seg: 8, up: () => V(0, 0, 1), capEnd: false }));
  const geo = merge(parts.map((g) => colour(g, PAL.hair)));
  // espresso roots, caramel ends
  const pos = geo.attributes.position, col = geo.attributes.color, a = new THREE.Color(PAL.hair), b = new THREE.Color(PAL.hairTip), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let t = Math.min(1, Math.max(0, (2.23 - pos.getY(i)) / 0.2)); t = t * t * (3 - 2 * t);
    c.copy(a).lerp(b, t); col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

// ------------------------------------------------------------------ top: shirt, rolled sleeves, collar, coral bow
function top() {
  const shirt = TORSO.filter(([, y]) => y >= 1.3).map(([r, y]) => [r + (y > 1.93 ? 0.005 : 0.022), Math.min(y, 1.955)]);
  const parts = [colour(lathe([[0, 1.3], [torsoR(1.3) + 0.022, 1.3], ...shirt.slice(1)], TSX, TSZ), PAL.shirt)];
  for (const s of [1, -1]) {
    const sh = mir(SH, s), el = mir(EL, s), wr = mir(WR, s);
    parts.push(colour(limb(V(0.1 * s, 1.88, 0), sh, 0.085, 0.085), PAL.shirt), colour(ball(sh, 0.086), PAL.shirt));
    parts.push(colour(limb(sh, el.clone().lerp(sh, 0.12), 0.084, 0.072), PAL.shirt));
    const c0 = el.clone().lerp(sh, 0.16), c1 = el.clone().lerp(wr, 0.14);
    parts.push(colour(limb(c0, c1, 0.08, 0.077), PAL.cuff));                                             // the roll
    parts.push(colour(ball(el.clone().add(V(0.05 * s, 0.01, 0.045)), 0.017, 0.017, 0.01), PAL.button));
    // collar points
    parts.push(colour(sweep([V(0.025 * s, 1.97, 0.115), V(0.07 * s, 1.945, 0.14), V(0.105 * s, 1.915, 0.13)],
      { w: (t) => 0.035 * (1 - t) + 0.004, h: () => 0.008, up: () => V(0, 0.4, 1), n: 6, seg: 8 }), PAL.shirt));
  }
  // coral bow at the throat
  const B = V(0, 1.925, 0.165);
  for (const s of [1, -1]) {
    parts.push(colour(ball(B.clone().add(V(0.048 * s, 0.004, 0.0)), 0.05, 0.03, 0.016).rotateZ(0), PAL.coral));
    parts.push(colour(sweep([B.clone().add(V(0.008 * s, -0.01, 0.005)), B.clone().add(V(0.03 * s, -0.06, 0.012)), B.clone().add(V(0.05 * s, -0.1, 0.01))],
      { w: (t) => 0.015, h: () => 0.005, up: () => V(0, 0, 1), n: 6, seg: 8 }), PAL.coral));
  }
  parts.push(colour(ball(B.clone().add(V(0, 0, 0.01)), 0.02, 0.02, 0.016), PAL.coral));
  return merge(parts);
}

// ------------------------------------------------------------------ apron: bib, skirt, waistband, straps, pockets, bow
function apron() {
  const D = (deg) => THREE.MathUtils.degToRad(deg), parts = [];
  const shirtR = (y) => torsoR(y) + 0.03;
  parts.push(colour(panel(1.52, 1.88, D(-40), D(40), shirtR, 0.018, TSX, TSZ, 12, 5), PAL.apron));          // bib
  parts.push(colour(panel(1.0, 1.535, D(-98), D(98), (y) => 0.31 - (y - 1.0) / 0.535 * 0.13, 0.018, 1.12, 0.86, 24, 5), PAL.apron));   // skirt
  parts.push(colour(panel(1.495, 1.575, D(-180), D(180), (y) => shirtR(y) + 0.004, 0.022, TSX, TSZ, 32, 1), PAL.apronDk));   // waistband
  for (const s of [1, -1]) {
    parts.push(colour(panel(1.13, 1.32, D(18 * s - 13), D(18 * s + 13), (y) => 0.31 - (y - 1.0) / 0.535 * 0.13 + 0.018, 0.01, 1.12, 0.86, 8, 4), PAL.apronDk));
    // straps from the bib corners over the shoulders and down the back
    const corner = V(Math.sin(D(36 * s)) * (shirtR(1.87) + 0.01) * TSX, 1.875, Math.cos(D(36 * s)) * (shirtR(1.87) + 0.01) * TSZ);
    parts.push(colour(sweep([corner, V(0.13 * s, 1.97, 0.1), V(0.13 * s, 2.0, 0.0), V(0.12 * s, 1.95, -0.12), V(0.105 * s, 1.75, -0.16),
      V(0.1 * s, 1.56, -0.16)], { w: () => 0.022, h: () => 0.007, up: (q) => V(q.x * 0.3, (q.y - 1.6) * 0.5, q.z).normalize(), n: 12, seg: 6 }), PAL.apron));
    parts.push(colour(ball(corner.clone().add(V(0, 0, 0.012)), 0.022, 0.018, 0.008), PAL.stitch));     // buckles
  }
  // the coffee bean on the bib
  for (const s of [1, -1]) parts.push(colour(ball(V(0.016 * s, 1.75, shirtR(1.75) * TSZ + 0.019), 0.014, 0.034, 0.005), PAL.bean));
  // back bow: two loops and two tails
  const BB = V(0, 1.535, -(shirtR(1.535) * TSZ + 0.03));
  for (const s of [1, -1]) {
    parts.push(colour(new THREE.TorusGeometry(0.05, 0.02, 6, 12).scale(1.4, 0.8, 0.5).translate(BB.x + 0.07 * s, BB.y + 0.01, BB.z - 0.01), PAL.apron));
    parts.push(colour(sweep([BB.clone().add(V(0.02 * s, -0.02, -0.01)), BB.clone().add(V(0.06 * s, -0.17, -0.03)), BB.clone().add(V(0.09 * s, -0.36, -0.03))],
      { w: () => 0.032, h: () => 0.007, up: () => V(0, 0, -1), n: 8, seg: 8 }), PAL.apron));
  }
  parts.push(colour(ball(BB, 0.03, 0.03, 0.02), PAL.apronDk));
  return merge(parts);
}

// ------------------------------------------------------------------ bottom, legwear, shoes
function bottom() {
  const parts = [colour(lathe([[0.0, 0.95], [0.15, 0.955], [0.215, 1.0], [0.232, 1.08], [0.232, 1.17], [0.218, 1.3], [0.0, 1.31]], TSX, TSZ), PAL.shorts)];
  for (const s of [1, -1]) {
    parts.push(colour(limb(V(0.165 * s, 1.06, 0), V(0.2 * s, 0.93, 0.008), 0.138, 0.14), PAL.shorts));
  }
  return merge(parts);
}

function legwear() {
  const parts = [colour(lathe([[0.0, 0.93], [0.15, 0.945], [0.215, 1.0], [0.232, 1.08], [0.23, 1.16], [0.0, 1.17]], TSX, TSZ), PAL.tights)];
  for (const s of [1, -1]) {
    const hip = mir(HIP, s), knee = mir(KNEE, s), ankle = mir(ANKLE, s);
    parts.push(limb(hip.clone().add(V(0, 0.03, 0)), knee, 0.128, 0.09), ball(knee, 0.09), limb(knee, ankle.clone().add(V(0, 0.1, 0)), 0.089, 0.066, 0.018));
  }
  return colour(merge(parts.map((g) => g.attributes.color ? g : colour(g, PAL.tights))), PAL.tights);
}

function shoes() {
  const parts = [];
  for (const s of [1, -1]) {
    const x = 0.21 * s;
    parts.push(colour(limb(V(x, 0.14, -0.015), V(x, 0.41, -0.015), 0.108, 0.104), PAL.boot));               // shaft
    parts.push(colour(new THREE.TorusGeometry(0.104, 0.016, 5, 18).rotateX(Math.PI / 2).translate(x, 0.415, -0.015), PAL.bootDk));
    parts.push(colour(ball(V(x, 0.115, 0.115), 0.118, 0.105, 0.2), PAL.boot));                                // foot, toe
    parts.push(colour(ball(V(x, 0.115, -0.07), 0.112, 0.105, 0.11), PAL.boot));                              // heel
    parts.push(colour(roundedSlab(V(x, 0.035, 0.06), 0.128, 0.037, 0.255), PAL.sole));                        // lug sole
    for (let j = 0; j < 5; j++) {                                                                            // laces
      const y = 0.17 + j * 0.05, z = 0.1 - j * 0.01 + (j === 0 ? 0.06 : 0);
      parts.push(colour(sweep([V(x - 0.045, y, z), V(x + 0.045, y + 0.012, z)], { w: () => 0.01, n: 1, seg: 5 }), PAL.lace));
    }
  }
  return merge(parts);
}

/** A slab with rounded corners (a squashed sphere-swept box). */
function roundedSlab(c, hx, hy, hz) {
  const g = new THREE.SphereGeometry(1, 16, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.35;
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), k);   // pushes the sphere toward a box
    p.setXYZ(i, c.x + f(x) * hx, c.y + f(y) * hy, c.z + f(z) * hz);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the doll
export function buildDoll() {
  const faceTex = new THREE.CanvasTexture(paintFace());
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = clean(headGeometry(), true);
  const geos = { body: body(), face, hair: hair(), top: top(), apron: apron(), bottom: bottom(), legwear: legwear(), shoes: shoes() };
  const group = new THREE.Group();
  const meshes = {};
  for (const [slot, geo] of Object.entries(geos)) {
    const mat = slot === 'face'
      ? new THREE.MeshStandardMaterial({ map: faceTex, emissiveMap: faceTex, emissive: new THREE.Color(0.18, 0.18, 0.18), roughness: 0.62, metalness: 0 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'Doll_' + slot;
    group.add(m); meshes[slot] = m;
  }
  return { group, meshes, faceCanvas: faceTex.image };
}

/** The parts as plain arrays for tools/build_doll.py (colours linear, as glTF wants them). */
export function exportDoll(doll) {
  const parts = {};
  for (const [slot, m] of Object.entries(doll.meshes)) {
    const g = m.geometry, a = (n) => g.attributes[n] ? Array.from(g.attributes[n].array, (v) => +v.toFixed(5)) : null;
    parts[slot] = { P: a('position'), N: a('normal'), C: a('color'), UV: a('uv'), F: Array.from(g.index.array) };
  }
  return { bones: BONES.map(([n, p, v]) => [n, p, [v.x, v.y, v.z]]), parts, face: doll.faceCanvas.toDataURL('image/png') };
}
