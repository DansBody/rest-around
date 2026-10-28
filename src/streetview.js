// The street round the café, drawn (street.js has the lots and their state). Roads, the café's own block, and on
// each of the eight lots a resident's shop (plus a couple of plain houses on the long ones) built from boxes and
// merged per material, so a lot is about ten draw calls. One shader patch shows a lot's state, continuously 0..2:
// a pale grey halftone print, paper line-art, colour. In the pixel pass (renderer.js) the flat states skip the tone
// curve (alpha 0.8 grey print, inked softer; 0.7 line-art) and lots that are being recovered tear along a glitch mask.
import { THREE } from './models.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { layout, ROAD } from './street.js';
import { rand } from './util.js';

const C = (hex) => new THREE.Color(hex);
// the grey world: pale paper with grey dots (a hint of denim), line-art on warm paper in a soft ink
const SHARED = {
  uGreyPaper: { value: C('#E6E7EA') }, uGreyDot: { value: C('#A9AFBD') },
  uLinePaper: { value: C('#F4F1EA') }, uLineInk: { value: C('#66708C') },
  uPlain: { value: 0 },
};
const ROAD_C = '#B9BBC8', DASH_C = '#EFEDE6', OUTER_C = '#DCDDE1', CAFE_SIDE = '#8A5A3B', CAFE_PAVE = '#E9D9BD';
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const DECL = `uniform float uState; uniform vec2 uAnchor; uniform float uPlain;
uniform vec3 uGreyPaper; uniform vec3 uGreyDot; uniform vec3 uLinePaper; uniform vec3 uLineInk;
uniform float uStripe; uniform vec3 uStripeC; uniform float uMull; uniform float uEdge;
`;
const BODY = `
  {
    vec3 lit = gl_FragColor.rgb;
    float lum = dot(lit, vec3(0.3, 0.59, 0.11));
    // 0: the grey print. Dots on a 4-px grid (every other row shifted half a cell), counted in whole pixels from the
    // lot's own anchor on screen, so they move with the building and never beat against the pixel grid
    vec2 p = floor(gl_FragCoord.xy - uAnchor);
    vec2 c = mod(vec2(p.x + mod(floor(p.y / 4.0), 2.0) * 2.0, p.y), 4.0);
    float tone = clamp((0.92 - lum) * 3.0, 0.0, 3.0);
    float lv = floor(tone + 0.3), on = 0.0;
    if (lv > 0.5 && c.x == 1.0 && c.y == 1.0) on = 1.0;
    if (lv > 1.5 && c.x == 2.0 && c.y == 2.0) on = 1.0;
    if (lv > 2.5 && ((c.x == 2.0 && c.y == 1.0) || (c.x == 1.0 && c.y == 2.0))) on = 1.0;
    vec3 grey = uPlain > 0.5 ? mix(uGreyPaper, uGreyDot, tone / 3.0 * 0.6) : mix(uGreyPaper, uGreyDot, on);
    // 1: paper line-art: each face's border, the window bars and the awning stripes as 1-px lines
    vec2 f = fract(vUv), fw = max(fwidth(vUv), vec2(1e-4));
    vec2 e = min(f, 1.0 - f) / fw;
    float line = uEdge * step(min(e.x, e.y), 0.9);
    if (uStripe > 0.0) { float s = fract(vUv.x * uStripe); line = max(line, step(min(s, 1.0 - s) / (fw.x * uStripe), 0.6)); }
    if (uMull > 0.0) { vec2 m = abs(f - 0.5) / fw; line = max(line, step(min(m.x, m.y), 0.6)); }
    vec3 art = mix(uLinePaper * (0.9 + 0.1 * clamp(lum * 1.3, 0.0, 1.0)), uLineInk, line);
    // 2: colour, the awning's stripes painted in
    vec3 col = lit;
    if (uStripe > 0.0) col = mix(lit, uStripeC * lit / max(diffuseColor.rgb, vec3(0.02)), step(0.5, fract(vUv.x * uStripe)));
    gl_FragColor.rgb = uState < 1.0 ? mix(grey, art, uState) : mix(art, col, uState - 1.0);
    if (uPlain < 0.5 && uState < 1.5) gl_FragColor.a = uState < 0.5 ? 0.8 : 0.7;
  }
`;

/** A lot material: the café's look (toon steps in pixel art, else Lambert) with the state patch, sharing `u` across the lot. */
function lotMaterial(u, o, ramp) {
  const base = { color: o.color || '#ffffff', map: o.map || null };
  const m = ramp ? new THREE.MeshToonMaterial({ ...base, gradientMap: ramp }) : new THREE.MeshLambertMaterial(base);
  m.defines = { USE_UV: '' };
  const own = { uStripe: { value: o.stripe || 0 }, uStripeC: { value: C(o.stripeC || '#ffffff') }, uMull: { value: o.mull ? 1 : 0 }, uEdge: { value: o.edge === false ? 0 : 1 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SHARED, u, own);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', DECL + 'void main() {').replace('#include <opaque_fragment>', '#include <opaque_fragment>' + BODY);
  };
  m.customProgramCacheKey = () => 'lotstate';
  return m;
}

/** The shop's name painted on its sign board. */
function signTexture(look, pixel) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 18;
  const x = c.getContext('2d');
  x.fillStyle = look.signC; x.fillRect(0, 0, 128, 18);
  x.fillStyle = '#FBF6EC'; x.font = '12px "Refillit Pixel", "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(look.sign, 64, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}

/** Geometry gathered per material, merged into one mesh each at the end. */
class Kit {
  constructor() { this.parts = new Map(); }
  add(key, opts, geo, x, y, z, rx = 0, ry = 0) {
    geo.rotateX(rx); geo.rotateY(ry); geo.translate(x, y, z);
    if (!this.parts.has(key)) this.parts.set(key, { opts, geos: [] });
    this.parts.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(key, opts, w, h, d, x, y, z, rx = 0) { this.add(key, opts, new THREE.BoxGeometry(w, h, d), x, y, z, rx); }
}

const HOUSES = [{ body: '#EDE3D3', roof: '#9C6B53', glass: '#FFF1D6' }, { body: '#DCE6EA', roof: '#6D7F99', glass: '#FBFBF4' }];

export class StreetView {
  constructor(scene, ramp) {
    this.scene = scene;
    this.ramp = ramp;     // the toon ramp of the pixel-art look (renderer.js)
    this.group = null;
    this.lots = [];       // { id, group, u, meshes, glitch, flickT }
    this.key = '';
    this.maskMats = [];
  }

  /** (Re)build for a room `size` tiles square; `pixel`: the pixel-art look. */
  build(size, pixel) {
    if (this.group) { this.scene.remove(this.group); this.dispose(); }
    const L = this.layout = layout(size);
    const g = this.group = new THREE.Group();
    this.scene.add(g);
    SHARED.uPlain.value = pixel ? 0 : 1;
    const ramp = pixel ? this.ramp : null;
    const plain = (color) => (ramp ? new THREE.MeshToonMaterial({ color, gradientMap: ramp }) : new THREE.MeshLambertMaterial({ color }));
    this.own = [];
    const mesh = (geo, mat, receive = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = receive; g.add(m); this.own.push(m); return m; };
    // ground: the ring roads (and one more round the outside), then the pale grey world beyond
    const e = L.ext, pad = ROAD + 2;
    const road = mesh(new THREE.PlaneGeometry(e.x1 - e.x0 + 2 * pad, e.z1 - e.z0 + 2 * pad), plain(ROAD_C));
    road.rotation.x = -Math.PI / 2; road.position.set((e.x0 + e.x1) / 2, -0.25, (e.z0 + e.z1) / 2);
    const outer = mesh(new THREE.PlaneGeometry(400, 400), plain(OUTER_C), false);
    outer.rotation.x = -Math.PI / 2; outer.position.set((e.x0 + e.x1) / 2, -0.27, (e.z0 + e.z1) / 2);
    // centre dashes down the four ring roads next to the café (one instanced mesh)
    const cf = L.cafe, dashes = [];
    for (const x of [cf.x0 - ROAD / 2, cf.x1 + ROAD / 2]) for (let z = e.z0 + 1; z < e.z1; z += 4) dashes.push([x, z, 0]);
    for (const z of [cf.z0 - ROAD / 2, cf.z1 + ROAD / 2]) for (let x = e.x0 + 1; x < e.x1; x += 4) if (Math.abs(x - (cf.x0 - ROAD / 2)) > 3.5 && Math.abs(x - (cf.x1 + ROAD / 2)) > 3.5) dashes.push([x, z, 1]);
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.02, 1.8), plain(DASH_C), dashes.length);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    dashes.forEach(([x, z, r], i) => { q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r ? Math.PI / 2 : 0); dm.setMatrixAt(i, mx.compose(new THREE.Vector3(x, -0.24, z), q, one)); });
    g.add(dm); this.own.push(dm);
    // the café's block: its sidewalk (the old street's paving) on coffee-brown sides
    const bw = cf.x1 - cf.x0, bd = cf.z1 - cf.z0;
    const side = mesh(new THREE.BoxGeometry(bw, 0.22, bd), plain(CAFE_SIDE));
    side.position.set((cf.x0 + cf.x1) / 2, -0.14, (cf.z0 + cf.z1) / 2);   // its top just under the paving (no z-fight)
    const top = mesh(new THREE.PlaneGeometry(bw, bd), plain(CAFE_PAVE));
    top.rotation.x = -Math.PI / 2; top.position.set((cf.x0 + cf.x1) / 2, -0.02, (cf.z0 + cf.z1) / 2);
    // the lots
    this.lots = L.lots.map((l) => this.buildLot(l, ramp, pixel));
    this.key = '';
  }

  buildLot(l, ramp, pixel) {
    const u = { uState: { value: 0 }, uAnchor: { value: new THREE.Vector2() } };
    const look = l.look, kit = new Kit();
    // local frame: +z is where the shop looks; the lot is Lw along its front and Ld deep
    const alongX = l.face.z !== 0, Lw = alongX ? l.w : l.d, Ld = alongX ? l.d : l.w;
    const front = Ld / 2 - 3.5;   // the shopfronts stand back from the road behind a sidewalk
    kit.box('pave', { color: '#E9DFCB', edge: true }, Lw, 0.25, Ld, 0, -0.125, 0);
    // the shop
    const one = look.storeys === 1, sw = one ? 9 : 8.4, sd = 6.5, G = 3.6, U = 2.5;
    const H = G + U * (look.storeys - 1) + 0.2, zf = front, sz = zf - sd / 2;
    kit.box('body', { color: look.body }, sw, H, sd, 0, H / 2, sz);
    // the roof cap a little softer than the trim, so a restored shop never outshouts the café
    kit.box('cap', { color: '#' + C(look.trim).lerp(C(look.body), 0.35).getHexString() }, sw + 0.4, 0.45, sd + 0.4, 0, H + 0.22, sz);
    kit.box('trim', { color: look.trim }, 1.25, 2.25, 0.12, -sw * 0.3, 1.125, zf + 0.06);   // door
    const pane = (w, hh, x, y) => { kit.box('trim', { color: look.trim }, w + 0.24, hh + 0.24, 0.06, x, y, zf + 0.03); kit.box('glass', { color: look.glass, mull: true }, w, hh, 0.1, x, y, zf + 0.06); };
    pane(sw * 0.42, 1.45, sw * 0.14, 1.4);
    kit.box('awning', { color: look.awning, stripe: 6, stripeC: look.stripe }, sw * 0.88, 0.14, 1.5, 0, 2.72, zf + 0.72, 0.34);
    kit.box('sign', { color: '#ffffff', map: signTexture(look, pixel) }, sw * 0.62, 0.72, 0.16, 0, 3.26, zf + 0.08);
    kit.box('trim', { color: look.trim }, sw * 0.42, 0.36, 0.42, sw * 0.14, 0.18, zf + 0.25);   // flower box under the window
    kit.box('awning', { color: look.awning, edge: false }, sw * 0.38, 0.16, 0.3, sw * 0.14, 0.44, zf + 0.25);
    for (let k = 1; k < look.storeys; k++) for (const x of [-sw * 0.25, sw * 0.25]) pane(1.3, 1.2, x, G + U * (k - 1) + 1.25);
    // plain houses either side on the long lots (kept clear of the lot's ends, where the passers-by walk)
    const hw = Math.min(6.5, (Lw - sw) / 2 - 4.5);
    if (hw >= 3.5) [-1, 1].forEach((sgn, i) => {
      const hs = HOUSES[(l.i + i) % 2], x = sgn * (Lw / 2 - 3 - hw / 2), hd = 6, hh = 4.6 + ((l.i + i) % 2) * 0.8, z = zf - hd / 2;
      kit.box('hbody' + i, { color: hs.body }, hw, hh, hd, x, hh / 2, z);
      const s = new THREE.Shape([new THREE.Vector2(-hd / 2 - 0.35, 0), new THREE.Vector2(hd / 2 + 0.35, 0), new THREE.Vector2(0, 1.9)]);
      const roof = new THREE.ExtrudeGeometry(s, { depth: hw + 0.4, bevelEnabled: false });
      roof.translate(0, 0, -(hw + 0.4) / 2); roof.rotateY(Math.PI / 2);
      kit.add('hroof' + i, { color: hs.roof }, roof, x, hh, z);
      kit.box('hroof' + i, { color: hs.roof }, 1.1, 2.1, 0.12, x - hw * 0.22, 1.05, zf + 0.06);   // door
      for (const wx of [hw * 0.2]) { kit.box('hroof' + i, { color: hs.roof }, 1.3, 1.2, 0.06, x + wx, 1.5, zf + 0.03); kit.box('hglass' + i, { color: hs.glass, mull: true }, 1.06, 0.96, 0.1, x + wx, 1.5, zf + 0.06); }
      for (const wx of [-hw * 0.22, hw * 0.22]) { kit.box('hroof' + i, { color: hs.roof }, 1.2, 1.1, 0.06, x + wx, hh - 1.5, zf + 0.03); kit.box('hglass' + i, { color: hs.glass, mull: true }, 0.96, 0.86, 0.1, x + wx, hh - 1.5, zf + 0.06); }
    });
    // a street tree by the shop
    const tx = sw / 2 + 1.9, tz = zf + 1.4;
    kit.add('trunk', { color: '#A8744E', edge: false }, new THREE.CylinderGeometry(0.2, 0.28, 1.5, 6), tx, 0.75, tz);
    for (let i = 0; i < 3; i++) kit.add('leaf', { color: '#7CC47A', edge: false }, new THREE.IcosahedronGeometry(1.05 - i * 0.18, 0), tx + Math.sin(i * 2.1 + l.i) * 0.3, 1.8 + i * 0.7, tz + Math.cos(i * 2.1 + l.i) * 0.3, l.i + i, i);

    const grp = new THREE.Group();
    grp.position.set(l.cx, 0, l.cz);
    grp.rotation.y = Math.atan2(l.face.x, l.face.z);
    const meshes = [];
    for (const { opts, geos } of kit.parts.values()) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), lotMaterial(u, opts, ramp));
      for (const g of geos) g.dispose();
      m.layers.enable(1);   // the glitch mask pass draws layer 1 (only while this lot tears)
      grp.add(m); meshes.push(m);
    }
    this.group.add(grp);
    return { id: l.id, l, group: grp, u, meshes, glitch: 0, flickT: rand(2, 6), flick: 0 };
  }

  dispose() {
    for (const lot of this.lots) for (const m of lot.meshes) { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    for (const m of this.own || []) { m.geometry.dispose(); m.material.dispose(); }
    this.lots = []; this.own = [];
  }

  /**
   * Per frame: each lot's state from the game (street.js), its halftone anchor (the lot's centre on the canvas, in
   * whole pixels) and how hard it tears. The lot loading next flickers now and then: a few frames every few seconds.
   * @returns whether any lot tears this frame (the pixel pass then draws the mask)
   */
  update(game, cam, w, h, dt) {
    const street = game.street;
    let any = false;
    for (const lot of this.lots) {
      const s = street.lotState(lot.id);
      lot.u.uState.value = s;
      let gl = street.lotGlitch(lot.id);
      if (s > 0.5 && s < 1.5 && !gl && !quiet()) {
        lot.flickT -= dt;
        if (lot.flickT <= 0) { lot.flick = 0.14; lot.flickT = rand(4, 8); }
        if (lot.flick > 0) { lot.flick -= dt; gl = 0.5; }
      }
      lot.glitch = s < 1.999 ? gl : 0;
      if (lot.glitch > 0) any = true;
      tmp.set(lot.l.cx, 0, lot.l.cz).project(cam);
      lot.u.uAnchor.value.set(Math.round((tmp.x * 0.5 + 0.5) * w), Math.round((tmp.y * 0.5 + 0.5) * h));
    }
    return any;
  }

  /** The glitch mask: the tearing lots alone, red = how hard each tears (camera layer 1, materials swapped for the pass). */
  drawMask(gl, scene, cam) {
    const saved = [];
    this.lots.forEach((lot, i) => {
      lot.group.visible = lot.glitch > 0;
      if (!lot.group.visible) return;
      const mm = this.maskMats[i] || (this.maskMats[i] = new THREE.MeshBasicMaterial({ fog: false }));
      mm.color.setRGB(lot.glitch, 0, 0);
      for (const m of lot.meshes) { saved.push([m, m.material]); m.material = mm; }
    });
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    const layers = cam.layers.mask;
    cam.layers.set(1);
    gl.render(scene, cam);
    cam.layers.mask = layers;
    scene.background = bg; scene.fog = fog;
    for (const [m, mat] of saved) m.material = mat;
    for (const lot of this.lots) lot.group.visible = true;
  }
}
const tmp = new THREE.Vector3();
