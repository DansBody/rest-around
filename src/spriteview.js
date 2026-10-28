// A baked 64-px pixel sprite on a card for one agent (design/art-direction/PLAN.md, step 3), in pixel-art mode, for
// characters whose manifest entry names a `sprite` sheet (baked by tools/sprites/bake.mjs). Same interface as
// CharacterView. The front or back strip comes from the heading relative to the camera, mirrored for the left; a
// turn, spin or bat swing flips the card through its edge, and a knock-out tumbles it, Paper Mario style. Held things
// are the small 3D props, put where the bake measured the hand or the tray. A sheet goes to the GPU as one byte per
// pixel (its palette index) plus a palette strip, so each loaded sheet costs about 1 MB. The guests share one sheet
// whose fur and shirt are key slots: each guest's own palette strip fills them with its colours under the light the
// bake measured (a palette swap), and its ears are small cards of their own behind the body, hung on the ear points
// the bake measured in every frame.
import { THREE, models, TILE } from './models.js';
import { DIR_YAW, SIT_FORWARD, SWING, GLOW, contactShadow, makeBat } from './charview.js';

const BASE = 'assets/';
const MARK = 0.7;     // alpha the card writes: the pixel pass shows these pixels as baked (they were tone mapped in the bake)
const PIVOT = 0.7;    // height the card tumbles round when knocked out
const FLIP = 0.09;    // seconds for the card to flip from one side to the other
const PAL = 32;       // palette strip width (transparent + the sheet's colours + ink)
const EAR_GEO = new THREE.PlaneGeometry(1, 1);   // an ear card, sized per ear
/** Day and night on the sprites (1 at noon): the renderer sets it from its sun and sky. */
export const SPRITE_LIGHT = { value: new THREE.Color(1, 1, 1) };

const sheets = new Map();   // id -> { meta, tex, pal } once loaded (null while loading or if it failed)
/** The loaded sprite sheet of a character, or null: none baked, or still loading (the first call starts the load). */
export function spriteSheet(id) {
  const def = models.def(id);
  if (!def || !def.sprite) return null;
  if (sheets.has(id)) return sheets.get(id);
  sheets.set(id, null);
  const url = BASE + def.sprite, dir = url.slice(0, url.lastIndexOf('/') + 1);
  fetch(url).then((r) => r.json()).then((meta) => new THREE.ImageLoader().loadAsync(dir + meta.image).then((img) => {
    sheets.set(id, { meta, tex: indexTexture(img, meta.palette), pal: paletteBytes(meta.palette) });
  })).catch((e) => console.warn('sprite sheet', id, e));
  return null;
}

/** The sheet as palette indices (0 transparent, 1.. the JSON palette), one byte a pixel, bottom row first like a loaded image. */
function indexTexture(img, palette) {
  const w = img.width, h = img.height, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
  const index = new Map(palette.map((hex, i) => [parseInt(hex.slice(1), 16), i + 1]));
  for (let y = 0; y < h; y++) {
    const row = (h - 1 - y) * w;
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
      if (px[o + 3] < 128) continue;
      out[row + x] = index.get((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]) || 0;
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** The palette strip's bytes (sRGB; index 0, transparent, left empty). */
function paletteBytes(palette) {
  const b = new Uint8Array(PAL * 4);
  palette.forEach((hex, i) => {
    const v = parseInt(hex.slice(1), 16), o = (i + 1) * 4;
    b[o] = v >> 16; b[o + 1] = (v >> 8) & 255; b[o + 2] = v & 255; b[o + 3] = 255;
  });
  return b;
}
const palettes = new Map();   // sheet id -> its palette strip, shared by its cards (each guest has its own)
function paletteTexture(bytes) {
  const t = new THREE.DataTexture(bytes, PAL, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const ONE = new THREE.Color(1, 1, 1);
/**
 * The card's material; `shared` holds the uniforms every card of one character shares (sheet, palette, light, glow,
 * tint), so a guest's ears take the same colours as its body.
 */
function cardMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, rect: { value: new THREE.Vector4(0, 0, 1, 1) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform sampler2D pal; uniform vec4 rect; uniform vec3 light; uniform vec3 glow; uniform vec3 tint; varying vec2 vUv;
      void main() {
        float i = floor(texture2D(map, rect.xy + vUv * rect.zw).r * 255.0 + 0.5);
        if (i < 0.5) discard;
        vec3 c = texture2D(pal, vec2((i + 0.5) / ${PAL.toFixed(1)}, 0.5)).rgb;
        gl_FragColor = vec4(c * tint * light + glow, ${MARK.toFixed(2)});
      }`,
  });
}

/**
 * A guest's palette strip: the sheet's, with its key slots (`meta.keys`: per region the marker colour of each shade
 * and the light it caught, relative to the key grey) painted in the guest's fur and shirt (sRGB hex).
 */
function guestPalette(sheet, colors) {
  const b = sheet.pal.slice(), slot = new Map(sheet.meta.palette.map((hex, i) => [hex, i + 1]));
  for (const [region, key] of Object.entries(sheet.meta.keys)) {
    const v = parseInt(String(colors[region]).replace('#', ''), 16), rgb = [v >> 16, (v >> 8) & 255, v & 255];
    key.mark.forEach((m, j) => {
      const o = slot.get(hexOf(m)) * 4;
      for (let c = 0; c < 3; c++) b[o + c] = Math.min(255, Math.round(rgb[c] * key.ramp[j][c]));
    });
  }
  return paletteTexture(b);
}
const hexOf = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

export class SpriteView {
  constructor(scene, agent) {
    this.sprite = true;
    this.agent = agent;
    const look = agent.look || {};
    this.modelId = look.model || 'guest_b';
    this.def = models.def(this.modelId) || {};
    this.anims = this.def.animations || {};
    const sheet = spriteSheet(this.modelId), meta = sheet.meta;
    this.meta = meta;
    const G = this.grid = meta.grid;
    this.root = new THREE.Group();
    this.face = new THREE.Group();          // turned to face the camera
    this.tumble = new THREE.Group();        // rolls round PIVOT when knocked out
    this.tumble.position.y = PIVOT;
    this.H = G.height || G.canvas;
    let pal;
    if (meta.keys) {   // a guest, or one of the cast: its own palette (the texture's own colours where it has none)
      const ref = this.def.recolor || {}, grey = { fur: [200, 200, 200], shirt: [150, 150, 150], light: [240, 240, 240] };
      pal = this.ownPal = guestPalette(sheet, Object.fromEntries(Object.keys(meta.keys).map((k) => [k, look[k] || hexOf(ref[k] || grey[k])])));
    } else {
      pal = palettes.get(this.modelId);
      if (!pal) palettes.set(this.modelId, (pal = paletteTexture(sheet.pal)));
    }
    this.uniforms = { map: { value: sheet.tex }, pal: { value: pal }, light: SPRITE_LIGHT, glow: { value: new THREE.Color(0, 0, 0) }, tint: { value: ONE } };
    if (look.tint) this.uniforms.tint = { value: new THREE.Color('#ffffff').lerp(new THREE.Color(look.tint), 0.35) };
    this.mat = cardMaterial(this.uniforms);
    const geo = new THREE.PlaneGeometry(G.canvas / G.ppu, this.H / G.ppu);
    geo.translate(0, this.H / 2 / G.ppu - (this.H - G.ground) / G.ppu, 0);   // the feet row on the floor
    this.card = new THREE.Mesh(geo, this.mat);
    this.card.position.y = -PIVOT;
    this.card.castShadow = false;
    this.tumble.add(this.card); this.face.add(this.tumble); this.root.add(this.face);
    // ears (guests): one small card per ear just behind the body card, so the head covers the ear's root
    this.ears = [];
    const style = meta.ears && look.ears && meta.ears[look.ears];
    if (style) for (const side of ['l', 'r']) {
      const m = new THREE.Mesh(EAR_GEO, cardMaterial(this.uniforms));
      m.userData = { side };
      m.castShadow = false;
      this.card.add(m);
      this.ears.push(m);
    }
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

  /** Hang the ears on this frame's ear points (whole sprite px, so their pixels line up with the body's); -> top row. */
  placeEars(dir) {
    const G = this.grid, W = this.meta.size[0], H = this.meta.size[1];
    let top = Infinity;
    for (const m of this.ears) {
      const e = this.meta.ears[this.agent.look.ears][dir][m.userData.side], at = this.frame[m.userData.side === 'l' ? 'earL' : 'earR'];
      if (!e || !at) { m.visible = false; continue; }
      const [x, y, w, h] = e.rect;
      const left = Math.round(at[0] - e.anchor[0]), up = Math.round(at[1] - e.anchor[1]);
      m.visible = true;
      m.position.set((left + w / 2 - G.canvas / 2) / G.ppu, (G.ground - up - h / 2) / G.ppu, -0.04);
      m.scale.set(w / G.ppu, h / G.ppu, 1);
      m.material.uniforms.rect.value.set(x / W, 1 - (y + h) / H, w / W, h / H);
      top = Math.min(top, up);
    }
    return top;
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
    // true size, stretched upright by the camera's pitch so its pixels are square at the look-at point (where the renderer
    // puts PPU scene pixels to a unit); a per-character stretch from its own view angle made sprites low on screen grow
    // tall when zoomed in, and sizing the card to the canvas made them grow and shrink with the zoom
    this.k = this.scale; this.sy = 1 / Math.cos(cam.pitch);
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
    this.earTop = this.ears.length ? this.placeEars(dir) : Infinity;

    this.setHeld(p.held);
    const o = this.heldKey && this.held[this.heldKey];
    if (o) {
      const at = this.frame[o.userData.anchor] || this.frame.tray;
      this.cardPoint(at[0], at[1], at[2], o.position);
      o.rotation.y = yaw;
    }
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
    this.cardPoint(f.head ? f.head[0] : this.grid.canvas / 2, Math.min(f.top, this.earTop), 0, out);
    out.add(this.root.position);
    out.y += 0.3;
    return out;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.mat.dispose();
    for (const m of this.ears) m.material.dispose();
    if (this.ownPal) this.ownPal.dispose();
    this.card.geometry.dispose();
  }
}
