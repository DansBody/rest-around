// 3D model store. Every world object is a glTF listed in manifest.models; missing files get a
// procedural low-poly placeholder mesh (so the game always runs), and dropping in a correctly
// named .gltf/.glb replaces it with no code changes. Grid: 1 tile = 2 world units (KayKit scale).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/addons/utils/SkeletonUtils.js';

export const TILE = 2;
const BASE = 'assets/';

function at(m, x, y, z) { m.position.set(x, y, z); return m; }
function mat(color, o = {}) {
  return new THREE.MeshLambertMaterial({ color, ...o });
}

// ---------------------------------------------------------------- placeholder meshes
// Built facing +Z (the "front"), base on y = 0, centred on x/z.
const SHAPES = {
  box(ph) {
    const [w, h, d] = ph.size || [1.2, 1, 1.2];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(ph.color || '#d9c7ae'));
    m.position.y = h / 2;
    return m;
  },
  toilet(ph) {
    const g = new THREE.Group();
    const white = mat('#fbfbff'), blue = mat('#bcd6ec');
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.35), white); tank.position.set(0, 0.95, -0.45); g.add(tank);
    const lidT = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, 0.4), blue); lidT.position.set(0, 1.44, -0.45); g.add(lidT);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 16), white); base.position.set(0, 0.25, 0.05); g.add(base);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.25, 20), white); bowl.scale.z = 1.25; bowl.position.set(0, 0.62, 0.1); g.add(bowl);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 20), blue); seat.rotation.x = Math.PI / 2; seat.scale.y = 1.25; seat.position.set(0, 0.76, 0.1); g.add(seat);
    const mat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.03, 24), mat('#dfeaf5')); mat2.scale.z = 0.8; mat2.position.set(0, 0.015, 0.2); g.add(mat2);
    return g;
  },
  arcade(ph) {
    const g = new THREE.Group();
    const body = mat(ph.color || '#f1ede6');
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.9), body); cab.position.set(0, 1.1, -0.1); g.add(cab);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.35, 1.0), mat('#f4a6b8')); top.position.set(0, 2.2, -0.05); g.add(top);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ color: '#7fd6f0' }));
    screen.position.set(0, 1.55, 0.36); screen.rotation.x = -0.25; screen.userData.glow = true; g.add(screen);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), body); panel.position.set(0, 1.05, 0.45); panel.rotation.x = 0.35; g.add(panel);
    for (const [x, c] of [[-0.25, '#ef6f6c'], [0.05, '#f7d45b'], [0.28, '#7fd6f0']]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), mat(c)); b.position.set(x, 1.16, 0.5); g.add(b);
    }
    return g;
  },
  pudding(ph) {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), mat('#fbfaf7')), 0, 0.025, 0));
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.32, 20), mat('#f6d27a')); p.position.y = 0.21; g.add(p);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), mat('#9b5a2a')); t.position.y = 0.39; g.add(t);
    return g;
  },
  cake(ph) {
    const g = new THREE.Group();
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), mat('#fbfaf7')), 0, 0.025, 0));
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 20, 1, false, 0, Math.PI / 2.4), mat('#f7e3b2')); s.position.y = 0.22; s.rotation.y = -0.4; g.add(s);
    const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 20, 1, false, 0, Math.PI / 2.4), mat('#fff9f2')); cream.position.y = 0.42; cream.rotation.y = -0.4; g.add(cream);
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#e8506a')); berry.position.set(0.12, 0.5, 0.12); g.add(berry);
    return g;
  },
  pie(ph) {
    const g = new THREE.Group();
    const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 24), mat('#e3b074')); crust.position.y = 0.07; g.add(crust);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 24), mat(ph.color || '#f7e25a')); fill.position.y = 0.145; g.add(fill);
    return g;
  },
  glass(ph) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.6, 16), new THREE.MeshLambertMaterial({ color: '#eaf6fb', transparent: true, opacity: 0.55 }));
    glass.position.y = 0.3; g.add(glass);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.145, 0.45, 16), mat(ph.color || '#f8ee98')); liq.position.y = 0.25; g.add(liq);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), mat('#ef7b8e')); straw.position.set(0.07, 0.6, 0); straw.rotation.z = -0.25; g.add(straw);
    if (ph.slice) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12), mat('#fff3a0')); sl.position.set(-0.12, 0.6, 0.1); sl.rotation.x = 1.2; g.add(sl); }
    return g;
  },
  bottle(ph) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 14), mat('#f4f7fa')); b.position.y = 0.25; g.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.15, 14), mat('#f4f7fa')); n.position.y = 0.57; g.add(n);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), mat('#6fa8dc')); c.position.y = 0.68; g.add(c);
    return g;
  },
  egg() { const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), mat('#f3dcc0')); e.scale.y = 1.3; e.position.y = 0.29; return e; },
  lemon() { const e = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mat('#f7e25a')); e.scale.x = 1.35; e.position.y = 0.24; return e; },
  sack() {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat('#f1e6d2')); s.scale.set(1, 1.2, 0.85); s.position.y = 0.34; g.add(s);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.18, 10), mat('#e3d3b8')); t.position.y = 0.72; g.add(t);
    return g;
  },
  broom() {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), mat('#c79a62')); h.position.y = 0.3; g.add(h);
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 8), mat('#f0d27a')); b.position.y = -0.6; g.add(b);
    return g;
  },
  wrench() {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.05), mat('#aeb8c2')); g.add(h);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 12, Math.PI * 1.6), mat('#c4ccd4')); t.position.y = 0.32; g.add(t);
    return g;
  },
  tray() {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.05, 20), mat('#dfe6ec'));
    return t;
  },
  chefhat() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat('#ffffff')); band.position.y = 0.15; g.add(band);
    for (const [x, z] of [[0, 0], [0.22, 0.1], [-0.22, 0.1], [0, -0.22], [0.15, -0.15], [-0.15, -0.15]]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat('#ffffff')); p.position.set(x, 0.5, z); g.add(p);
    }
    return g;
  },
  trash() {
    const g = new THREE.Group();
    const paper = mat('#f3eee6');
    for (const [x, z, r] of [[0, 0, 0.18], [0.22, 0.12, 0.12], [-0.15, 0.2, 0.1]]) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), paper); p.position.set(x, r * 0.8, z); p.rotation.set(x * 5, z * 7, x + z); g.add(p);
    }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.25, 10), mat('#f4a6b8')); cup.rotation.z = Math.PI / 2; cup.position.set(-0.05, 0.1, -0.22); g.add(cup);
    return g;
  },
};

/** Recenter an imported scene: bbox centre on x/z = 0, bottom on y = 0 (optional). */
function normalize(obj, center) {
  if (!center) return obj;
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  obj.position.y -= box.min.y;
  return obj;
}

const greyCache = new Map();
/** Luminance copy of a texture, lifted toward white so a colour multiply reads as a pastel recolour. */
function greyTexture(tex) {
  if (greyCache.has(tex.uuid)) return greyCache.get(tex.uuid);
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
    const v = Math.round(255 * (0.45 + 0.55 * Math.pow(l, 0.8)));
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.magFilter = tex.magFilter; t.minFilter = tex.minFilter;
  greyCache.set(tex.uuid, t);
  return t;
}

class ModelStore {
  constructor() {
    this.defs = new Map();
    this.templates = new Map(); // id -> Object3D (normalized, facing +Z)
    this.placeholder = new Set();
    this.characters = new Map(); // id -> { scene, clips }
    // Hosts that only serve certain file types can remap model URLs (see README, "Hosting").
    const manager = new THREE.LoadingManager();
    if (typeof window !== 'undefined' && typeof window.RA_MODEL_URL === 'function') manager.setURLModifier(window.RA_MODEL_URL);
    this.loader = new GLTFLoader(manager);
    this.tintCache = new Map();
  }

  async load(manifest, onProgress) {
    const list = manifest.models || [];
    for (const d of list) this.defs.set(d.id, d);
    this.anims = manifest.characterAnimations || {};
    const files = new Map();
    const fetchGltf = (file) => {
      if (!files.has(file)) files.set(file, this.loader.loadAsync(BASE + file).catch(() => null));
      return files.get(file);
    };
    let done = 0;
    // shared animation library for all characters (same KayKit rig)
    const animFile = manifest.characterAnimationFile;
    const animGltf = animFile ? await fetchGltf(animFile) : null;
    this.clips = animGltf ? animGltf.animations : [];
    await Promise.all(list.map(async (d) => {
      if (d.category === 'character') {
        const g = d.file ? await fetchGltf(d.file) : null;
        if (g) {
          g.scene.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
          this.characters.set(d.id, { scene: g.scene, clips: [...this.clips, ...g.animations] });
        } else this.placeholder.add(d.id);
      } else {
        this.templates.set(d.id, await this.build(d, fetchGltf));
      }
      done++;
      if (onProgress) onProgress(done / list.length);
    }));
  }

  async build(d, fetchGltf) {
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    if (d.parts) {
      for (const p of d.parts) {
        const sub = this.templates.get(p.model) || (this.defs.get(p.model) ? await this.build(this.defs.get(p.model), fetchGltf) : null);
        if (!sub) continue;
        const c = sub.clone(true);
        c.position.set(...(p.pos || [0, 0, 0]));
        if (p.rotY) c.rotation.y = THREE.MathUtils.degToRad(p.rotY);
        if (p.scale) c.scale.setScalar(p.scale);
        inner.add(c);
      }
      if (d.parts.some((p) => this.placeholder.has(p.model))) this.placeholder.add(d.id);
    } else {
      const g = d.file ? await fetchGltf(d.file) : null;
      if (g) {
        const s = g.scene.clone(true);
        normalize(s, d.center !== false);
        inner.add(s);
      } else {
        this.placeholder.add(d.id);
        const fn = SHAPES[d.placeholder && d.placeholder.shape] || SHAPES.box;
        inner.add(fn(d.placeholder || {}));
      }
    }
    if (d.rotY) inner.rotation.y = THREE.MathUtils.degToRad(d.rotY);
    if (d.scale) inner.scale.setScalar(d.scale);
    if (d.offset) inner.position.set(...d.offset);
    root.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = d.castShadow !== false; m.receiveShadow = true;
        // softer, cozier shading than PBR for the flat-coloured KayKit atlas
        if (m.material && !m.material.isMeshLambertMaterial && !m.material.isMeshBasicMaterial) {
          const o = m.material;
          m.material = new THREE.MeshLambertMaterial({ map: o.map, color: o.color, transparent: o.transparent, opacity: o.opacity });
        }
      }
    });
    return root;
  }

  def(id) { return this.defs.get(id); }
  isPlaceholder(id) { return this.placeholder.has(id); }

  /** A fresh instance of a static model; tint multiplies material colours (strength from manifest). */
  instance(id, tint) {
    const t = this.templates.get(id);
    if (!t) return new THREE.Group();
    const c = t.clone(true);
    const d = this.defs.get(id);
    tint = tint || (d && d.tint);
    if (tint && d && d.tintable) this.applyTint(c, tint, d.tintStrength ?? 0.65, id, d.tintMode || (d.category === 'food' ? 'multiply' : 'recolor'));
    return c;
  }

  /**
   * Tint a model. 'recolor' (default for furniture) greys the texture first so the variant really
   * takes the new colour; 'multiply' just multiplies (subtle, used for food).
   */
  applyTint(obj, tint, strength, key, mode = 'recolor') {
    const col = new THREE.Color('#ffffff').lerp(new THREE.Color(tint), strength);
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const k = key + '|' + tint + '|' + mode + '|' + m.material.uuid;
      let mm = this.tintCache.get(k);
      if (!mm) {
        mm = m.material.clone();
        if (mode === 'recolor' && mm.map && mm.map.image) { mm.map = greyTexture(mm.map); mm.color = new THREE.Color(tint); }
        else mm.color = mm.color.clone().multiply(col);
        this.tintCache.set(k, mm);
      }
      m.material = mm;
    });
  }

  /** Skinned character instance + its own AnimationMixer and actions by clip name. */
  character(id) {
    const c = this.characters.get(id);
    const d = this.defs.get(id) || {};
    if (!c) {
      // placeholder character: capsule body + big head, no rig
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 10), mat('#9cc3e6')); body.position.y = 0.7; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mat('#fde3cf')); head.position.y = 1.75; g.add(head);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      return { root: g, mixer: null, actions: {}, bones: { hand: head, head } };
    }
    const root = SkeletonUtils.clone(c.scene);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of c.clips) actions[clip.name] = mixer.clipAction(clip);
    const bones = {};
    root.traverse((o) => {
      if (o.name === (d.hand || 'handslot.r')) bones.hand = o;
      if (o.name === (d.handL || 'handslot.l')) bones.handL = o;
      if (o.name === (d.head || 'head')) bones.head = o;
    });
    if (d.scale) root.scale.setScalar(d.scale);
    return { root, mixer, actions, bones };
  }
}

export const models = new ModelStore();

/** Render a model to a transparent square image (used for UI icons and portraits). */
let iconRenderer = null;
export function renderIcon(obj, size = 96, opts = {}) {
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    iconRenderer.setClearColor(0x000000, 0);
    iconRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  iconRenderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8a58f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.0); sun.position.set(-3, 6, 4); scene.add(sun);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z) * (opts.pad || 0.62);
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, -50, 50);
  const dir = new THREE.Vector3(1, opts.pitch ?? 0.9, 1).normalize();
  cam.position.copy(c).addScaledVector(dir, 10);
  cam.lookAt(c);
  iconRenderer.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = size; out.height = size;
  out.getContext('2d').drawImage(iconRenderer.domElement, 0, 0);
  scene.remove(obj);
  return out;
}
export { THREE };
