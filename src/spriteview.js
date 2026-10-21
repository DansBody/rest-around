// A baked 64-px pixel sprite on a card for one agent (design/art-direction/PLAN.md, step 3), in pixel-art mode, for
// characters whose manifest entry names a `sprite` sheet (baked by tools/sprites/bake.mjs). Same interface as
// CharacterView. The front or back strip comes from the heading relative to the camera, mirrored for the left; a
// turn, spin or bat swing flips the card through its edge, and a knock-out tumbles it, Paper Mario style. Held things
// are the small 3D props, put where the bake measured the hand or the tray.
import { THREE, models, TILE } from './models.js';
import { DIR_YAW, SIT_FORWARD, SWING, GLOW, contactShadow, makeBat } from './charview.js';

const BASE = 'assets/';
const MARK = 0.7;     // alpha the card writes: the pixel pass shows these pixels as baked (they were tone mapped in the bake)
const PIVOT = 0.7;    // height the card tumbles round when knocked out
const FLIP = 0.09;    // seconds for the card to flip from one side to the other
/** Day and night on the sprites (1 at noon): the renderer sets it from its sun and sky. */
export const SPRITE_LIGHT = { value: new THREE.Color(1, 1, 1) };

const sheets = new Map();   // id -> { meta, tex } once loaded (null while loading or if it failed)
/** The loaded sprite sheet of a character, or null: none baked, or still loading (the first call starts the load). */
export function spriteSheet(id) {
  const def = models.def(id);
  if (!def || !def.sprite) return null;
  if (sheets.has(id)) return sheets.get(id);
  sheets.set(id, null);
  const url = BASE + def.sprite, dir = url.slice(0, url.lastIndexOf('/') + 1);
  fetch(url).then((r) => r.json()).then((meta) => new THREE.TextureLoader().loadAsync(dir + meta.image).then((tex) => {
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    sheets.set(id, { meta, tex });
  })).catch((e) => console.warn('sprite sheet', id, e));
  return null;
}

const tmpV = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpU = new THREE.Vector3();
function cardMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, rect: { value: new THREE.Vector4(0, 0, 1, 1) }, light: SPRITE_LIGHT, glow: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec4 rect; uniform vec3 light; uniform vec3 glow; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, rect.xy + vUv * rect.zw);
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb * light + glow, ${MARK.toFixed(2)});
      }`,
  });
}

export class SpriteView {
  constructor(scene, agent) {
    this.sprite = true;
    this.agent = agent;
    const look = agent.look || {};
    this.modelId = look.model || 'guest_b';
    this.def = models.def(this.modelId) || {};
    this.anims = this.def.animations || {};
    const { meta, tex } = spriteSheet(this.modelId);
    this.meta = meta;
    const G = this.grid = meta.grid;
    this.root = new THREE.Group();
    this.face = new THREE.Group();          // turned to face the camera
    this.tumble = new THREE.Group();        // rolls round PIVOT when knocked out
    this.tumble.position.y = PIVOT;
    this.mat = cardMaterial(tex);
    const size = G.canvas / G.ppu;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.translate(0, size / 2 - (G.canvas - G.ground) / G.ppu, 0);   // the feet row on the floor
    this.card = new THREE.Mesh(geo, this.mat);
    this.card.position.y = -PIVOT;
    this.card.castShadow = false;
    this.tumble.add(this.card); this.face.add(this.tumble); this.root.add(this.face);
    this.scale = look.scale || 1;
    this.shadow = contactShadow();
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    scene.add(this.root);
    this.yaw = DIR_YAW[agent.dir ?? 1];
    this.flip = 1;
    this.t = 0;
    this.held = {};
    this.heldKey = null;
    this.frame = null;     // the anchors of the frame on show
    this.play('idle', 0);
  }

  play(key) {
    const name = this.anims[key] || this.anims.idle;
    if (this.current === name) return;
    this.current = name;
    this.clip = this.meta.clips[name] || this.meta.clips[this.anims.idle] || Object.values(this.meta.clips)[0];
    this.t = 0;
  }

  setHeld(held) {
    const key = held ? held.id + '|' + (held.dish || '') : null;
    if (key === this.heldKey) return;
    this.heldKey = key;
    for (const o of Object.values(this.held)) o.visible = false;
    if (!held) return;
    let o = this.held[key];
    if (!o) {
      o = new THREE.Group();
      if (held.id === 'held_bat') {   // in the near hand, held up ready to swing (the tray point goes behind the card when she winds up)
        const bat = makeBat(); bat.rotation.set(-0.2, 0, 0.3); o.add(bat);
        o.userData.anchor = 'hand';
      } else if (held.id === 'held_tray') {
        o.add(models.instance('m_tray'));
        if (held.dish) {
          const dish = models.instance(held.dish === 'dirty_plate' ? 'm_plate_dirty' : held.dish);
          dish.scale.setScalar(0.55); dish.position.y = 0.04; o.add(dish);
        }
        o.userData.anchor = 'tray';
      } else {
        const id = { held_broom: 'm_broom', held_wrench: 'm_wrench', held_shaker: 'm_mug' }[held.id] || 'm_mug';
        const p = models.instance(id);
        if (id === 'm_mug') p.scale.setScalar(1.4);
        o.add(p);
        o.userData.anchor = 'hand';
      }
      o.traverse((m) => { m.castShadow = false; });
      this.root.add(o);
      this.held[key] = o;
    }
    o.visible = true;
  }

  /** A point of the card (sprite px u, v of the frame on show, standing d units out toward the camera) in root space. */
  cardPoint(u, v, d, out) {
    const G = this.grid, c = this.camYaw, s = this.k;
    const x = (u - G.canvas / 2) / G.ppu * this.flip * s, y = (G.ground - v) / G.ppu * this.sy * s;
    // out toward the camera along its line of sight, so the point stays where the bake put it on screen
    return out.set(Math.cos(c) * x + Math.sin(c) * d * s, y + d * s * Math.tan(this.pitch), -Math.sin(c) * x + Math.cos(c) * d * s);
  }

  update(dt, g) {
    const a = this.agent;
    const p = a.pose || {};
    let x = a.x * TILE, z = a.y * TILE, y = 0;
    let target = DIR_YAW[a.dir ?? 1];
    let anim = 'idle';
    const seated = a.onTile && (p.mode === 'sit' || p.mode === 'eat' || p.mode === 'wait');
    if (seated) {
      const ch = a.onTile;
      x = (ch.x + 0.5) * TILE; z = (ch.y + 0.5) * TILE;
      target = DIR_YAW[ch.dir];
      const fwd = this.def.sitForward ?? SIT_FORWARD;
      x += Math.sin(target) * fwd; z += Math.cos(target) * fwd;
      anim = 'sit';
    } else if (p.moving) anim = p.held && p.held.id === 'held_tray' ? 'carry' : 'walk';
    else if (p.mode && p.mode !== 'idle' && p.mode !== 'carry') anim = p.mode;
    if (p.hop > 0 && p.hop < 1) y += Math.sin(p.hop * Math.PI) * 0.35;
    if (a.fly) y += a.fly.h;
    if (p.shake) x += Math.sin((p.t || 0) * 45) * 0.05;
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.root.position.set(x, y, z);
    this.shadow.position.y = 0.02 - y;
    this.shadow.visible = y < 2;
    this.shadow.scale.setScalar(1 / (1 + y * 0.6));
    let swing = 0;
    if (a.swingT > 0) { const k = 1 - a.swingT / SWING; swing = k < 0.55 ? -0.9 * (k / 0.55) : -0.9 + 3.6 * Math.min(1, (k - 0.55) / 0.25); }
    const yaw = this.yaw + (a.spinT > 0 ? (1 - a.spinT / 0.8) * Math.PI * 4 : 0) + swing;

    // which way the card looks: heading relative to the camera (f = toward it, mirrored when walking left)
    const cam = g.camera;
    this.camYaw = cam.yaw; this.pitch = cam.pitch;
    this.pixelExact(g.renderer, x, y, z);
    let r = yaw - cam.yaw;
    r = Math.atan2(Math.sin(r), Math.cos(r));
    const dir = Math.cos(r) >= 0 ? 'f' : 'b', side = Math.sin(r) >= 0 ? 1 : -1;
    this.flip += Math.sign(side - this.flip) * Math.min(Math.abs(side - this.flip), (2 * dt) / FLIP);
    if (Math.abs(this.flip) < 0.12) this.flip = 0.12 * side;   // never quite edge-on
    this.face.rotation.y = cam.yaw;
    this.tumble.rotation.z = a.fly ? a.fly.spin : 0;
    this.card.scale.set(this.flip * this.k, this.sy * this.k, 1);

    this.play(anim);
    this.t += dt * (a.speedMul || 1);
    const c = this.clip, k = Math.floor(this.t * c.fps) % c.n;
    const rect = c.frames[dir][k], W = this.meta.size[0], H = this.meta.size[1];
    this.mat.uniforms.rect.value.set(rect[0] / W, 1 - (rect[1] + rect[3]) / H, rect[2] / W, rect[3] / H);
    this.frame = c.anchors[dir][k];

    this.setHeld(p.held);
    const o = this.heldKey && this.held[this.heldKey];
    if (o) {
      const at = this.frame[o.userData.anchor] || this.frame.tray;
      this.cardPoint(at[0], at[1], at[2], o.position);
      o.rotation.y = yaw;
    }
  }

  /**
   * Size the card so one sprite pixel covers one scene pixel where it stands (the renderer draws PPU scene pixels to a
   * world unit at the look-at point; nearer or farther, perspective changes that by a little), and stretch it upright
   * so its pixels stay square with the camera looking down on it.
   */
  pixelExact(r, x, y, z) {
    this.k = this.scale; this.sy = 1 / Math.cos(this.pitch);
    if (!r || !r.cam) return;
    const cam = r.cam, rel = tmpV.set(x, y + 1, z).sub(cam.position);
    cam.getWorldDirection(tmpF);
    tmpU.setFromMatrixColumn(cam.matrixWorld, 1);
    const depth = rel.dot(tmpF), above = Math.atan2(rel.dot(tmpU), depth), down = Math.asin(-rel.y / rel.length());
    const perPx = (2 * depth * Math.tan((cam.fov * Math.PI) / 360)) / r.gl.domElement.height;
    this.k = this.scale * Math.min(1.4, Math.max(0.7, perPx * this.grid.ppu));
    this.sy = Math.cos(above) / Math.cos(down);
  }

  /** Light the card up in `GLOW` (0 = off): the tour's focus. */
  setGlow(k) {
    k = Math.round(k * 20) / 20;
    if (k === (this.glow || 0)) return;
    this.glow = k;
    this.mat.uniforms.glow.value.copy(GLOW).multiplyScalar(k * 0.5);
  }

  /** World position just above the top of the sprite on show (for bubbles and name tags). */
  headTop(out) {
    const f = this.frame;
    if (!f || this.camYaw === undefined) { out.copy(this.root.position); out.y += 2.6; return out; }
    this.cardPoint(f.head ? f.head[0] : this.grid.canvas / 2, f.top, 0, out);
    out.add(this.root.position);
    out.y += 0.3;
    return out;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.mat.dispose();
    this.card.geometry.dispose();
  }
}
