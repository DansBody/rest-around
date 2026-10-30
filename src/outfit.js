// Patterns and tops: the paper doll's outer layer over a cast character's own colours (design/prologue/OPENING_PLAN.md,
// 紙娃娃介面). The species never changes; a pattern lies on the fur, a top restyles the clothes.
//   look.pat = { id, c }  a pattern (PATTERNS) in ink colour c, on the fur region
//   look.top = { id }     a top (TOPS) over the clothes region, in the clothes colour (look.shirt) and its own second colour
// Neither is a texture: each character's pattern mask is its own region map (manifest `regions`: red fur, green shirt)
// times a pattern drawn in code where it lands, so every one of the cast takes every pattern with nothing painted per model.
//   3D (CharacterView): in the character's bind space, so the pattern rides along with the skin as it moves; sized to
//                       the head's width (wear.js measures it) and wrapped round the body's upright axis.
//   pixel sprites (SpriteView): in sprite pixels, on the palette slots of the fur and shirt keys the bake left
//                       (tools/sprites/bake.mjs), so the same patterns come out as crisp pixel art.
// The sticker pictures in the paper doll use patPx below, the sprites' rule, so the stickers look like the café.
import { THREE, models } from './models.js';
import { shape } from './wear.js';

/** Patterns for the fur (k: the shaders' number for it). */
export const PATTERNS = [
  { id: 'dots', name: 'Polka dots', k: 1 },
  { id: 'patches', name: 'Patches', k: 2 },
  { id: 'stripes', name: 'Tabby stripes', k: 3 },
  { id: 'socks', name: 'Socks', k: 4 },
  { id: 'freckles', name: 'Freckles', k: 5 },
];
/** Tops over the clothes: `c` is the colour the top comes in (the clothes colour is set to it when it is put on), `c2` its second colour. */
export const TOPS = [
  { id: 'tee', name: 'Plain tee', k: 0 },
  { id: 'breton', name: 'Striped tee', k: 1, c2: '#fbf7ee' },
  { id: 'overalls', name: 'Denim overalls', k: 2, c: '#3f5daa', c2: '#a9bbe4' },
  { id: 'plaid', name: 'Plaid shirt', k: 3, c2: '#fbf7ee' },
  { id: 'knit', name: 'Cable knit', k: 4, c: '#efe4cf' },
  { id: 'dotted', name: 'Dotted blouse', k: 5, c2: '#fbf7ee' },
  { id: 'denim', name: 'Denim jacket', k: 6, c: '#5574bf' },
  { id: 'vest', name: 'Grey vest', k: 4, c: '#8f8f96' },
];
export const patternById = (id) => PATTERNS.find((p) => p.id === id);
export const topById = (id) => TOPS.find((p) => p.id === id);

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
/** A saved pattern made safe (null for none or an unknown one). */
export function cleanPat(v) {
  return v && patternById(v.id) && isHex(v.c) ? { id: v.id, c: v.c.toLowerCase() } : null;
}
/** A saved top made safe (null for none or an unknown one). */
export function cleanTop(v) {
  return v && topById(v.id) ? { id: v.id } : null;
}

/**
 * One pixel of a pattern or top, the sprites' rule (x right, y down, in sprite pixels; `ground` is the feet row):
 * { w: how much of the second colour, mul: shade on the base }.
 */
export function patPx(kind, k, x, y, ground = 74) {
  const m = (a, b) => ((a % b) + b) % b;
  const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  if (kind === 'pat') {
    if (k === 1) { const cx = m(x + m(Math.floor(y / 6), 2) * 3, 6), cy = m(y, 6); return { w: cx < 2 && cy < 2 ? 1 : 0, mul: 1 }; }
    if (k === 2) return { w: valueNoise(x / 7, y / 7, hash) > 0.6 ? 1 : 0, mul: 1 };
    if (k === 3) return { w: m(y + Math.floor(2 * Math.sin(x * 0.3)), 5) < 2 ? 1 : 0, mul: 1 };
    if (k === 4) return { w: y >= ground - 8 ? 1 : 0, mul: 1 };
    if (k === 5) return { w: hash(x, y) > 0.9 ? 1 : 0, mul: 1 };
    return { w: 0, mul: 1 };
  }
  if (k === 1) return { w: m(y, 4) < 2 ? 1 : 0, mul: 1 };
  if (k === 2) return { w: m(x, 3) < 1 ? 1 : 0, mul: 1 };
  if (k === 3) { const a = m(x, 6) < 2, b = m(y, 6) < 2; return { w: a && b ? 1 : a || b ? 0.5 : 0, mul: 1 }; }
  if (k === 4) return { w: 0, mul: m(x, 2) < 1 ? 0.86 : 1 };
  if (k === 5) return { w: m(x, 4) === 0 && m(y, 4) === 0 ? 1 : 0, mul: 1 };
  if (k === 6) return { w: 0, mul: m(x + y, 4) < 1 ? 0.8 : 1 };
  return { w: 0, mul: 1 };
}
function valueNoise(x, y, hash) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

// ------------------------------------------------------------------ pixel sprites
/** The sprites' pattern rule, for the card shader (spriteview.js): needs uniforms ofReg, ofSize, ofGround, patK, patC, topK, topC2. */
export const SPRITE_GLSL = `
uniform sampler2D ofReg; uniform vec2 ofSize; uniform float ofGround; uniform float patK; uniform vec3 patC; uniform float topK; uniform vec3 topC2;
float ofHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ofNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ofHash(i), ofHash(i + vec2(1.0, 0.0)), f.x), mix(ofHash(i + vec2(0.0, 1.0)), ofHash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 ofLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// x: how much of the second colour, y: shade on the base
vec2 ofPat(float k, vec2 p) {
  if (k < 1.5) { vec2 c = mod(p + vec2(mod(floor(p.y / 6.0), 2.0) * 3.0, 0.0), 6.0); return vec2(step(c.x, 1.5) * step(c.y, 1.5), 1.0); }
  if (k < 2.5) return vec2(step(0.6, ofNoise(p / 7.0)), 1.0);
  if (k < 3.5) return vec2(step(mod(p.y + floor(2.0 * sin(p.x * 0.3)), 5.0), 1.5), 1.0);
  if (k < 4.5) return vec2(step(ofGround - 8.0, p.y), 1.0);
  return vec2(step(0.9, ofHash(p)), 1.0);
}
vec2 ofTop(float k, vec2 p) {
  if (k < 1.5) return vec2(step(mod(p.y, 4.0), 1.5), 1.0);
  if (k < 2.5) return vec2(step(mod(p.x, 3.0), 0.5), 1.0);
  if (k < 3.5) { float a = step(mod(p.x, 6.0), 1.5), b = step(mod(p.y, 6.0), 1.5); return vec2(max(a, b) * 0.5 + a * b * 0.5, 1.0); }
  if (k < 4.5) return vec2(0.0, mix(1.0, 0.86, step(mod(p.x, 2.0), 0.5)));
  if (k < 5.5) return vec2(step(mod(p.x, 4.0), 0.5) * step(mod(p.y, 4.0), 0.5), 1.0);
  return vec2(0.0, mix(1.0, 0.8, step(mod(p.x + p.y, 4.0), 0.5)));
}
// c: the palette colour (linear) of index i; uv: the card's uv inside the frame
vec3 ofApply(vec3 c, float i, vec2 uv) {
  vec4 r = texture2D(ofReg, vec2((i + 0.5) / 32.0, 0.5));
  float code = floor(r.r * 255.0 / 60.0 + 0.5), ramp = r.g * 255.0 / 128.0;
  vec2 p = floor(vec2(uv.x * ofSize.x, (1.0 - uv.y) * ofSize.y));
  if (code == 1.0 && patK > 0.5) { vec2 s = ofPat(patK, p); c = mix(c, ofLinear(clamp(patC * ramp, 0.0, 1.0)), s.x); }
  if (code == 2.0 && topK > 0.5) { vec2 s = ofTop(topK, p); c = mix(c, ofLinear(clamp(topC2 * ramp, 0.0, 1.0)), s.x) * s.y; }
  return c;
}`;
const srgb = (hex) => { const v = parseInt(hex.slice(1), 16); return new THREE.Vector3((v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); };
const NONE = new THREE.DataTexture(new Uint8Array(4 * 32), 32, 1);
NONE.needsUpdate = true;
/**
 * The card uniforms for a sheet and a look: which palette slots are fur (1) or clothes (2), with the light the bake
 * measured on each (`meta.keys`), and the look's pattern and top. Sheets without keys get none.
 */
export function spriteOutfit(meta, look = {}) {
  const pat = cleanPat(look.pat), top = cleanTop(look.top), T = top && topById(top.id);
  const u = { ofReg: { value: NONE }, ofSize: { value: new THREE.Vector2(meta.grid.canvas, meta.grid.height || meta.grid.canvas) }, ofGround: { value: meta.grid.ground },
    patK: { value: 0 }, patC: { value: new THREE.Vector3() }, topK: { value: 0 }, topC2: { value: new THREE.Vector3(1, 1, 1) } };
  if (!meta.keys || (!pat && !(T && T.k))) return u;
  const b = new Uint8Array(4 * 32), slot = new Map(meta.palette.map((hex, i) => [hex.toLowerCase(), i + 1]));
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  for (const [region, code] of [['fur', 1], ['shirt', 2]]) {
    const key = meta.keys[region];
    if (key) key.mark.forEach((mk, j) => {
      const i = slot.get(hex(mk));
      if (!i) return;
      b[i * 4] = code * 60; b[i * 4 + 1] = Math.min(255, Math.round((key.ramp[j][0] + key.ramp[j][1] + key.ramp[j][2]) / 3 * 128));
    });
  }
  const reg = new THREE.DataTexture(b, 32, 1);
  reg.magFilter = reg.minFilter = THREE.NearestFilter;
  reg.needsUpdate = true;
  u.ofReg.value = reg;
  if (pat) { u.patK.value = patternById(pat.id).k; u.patC.value = srgb(pat.c); }
  if (T && T.k) { u.topK.value = T.k; u.topC2.value = srgb(T.c2 || '#ffffff'); }
  return u;
}

// ------------------------------------------------------------------ 3D characters
const VERT = `
#ifdef USE_SKINNING
  vOfP = (bindMatrix * vec4(transformed, 1.0)).xyz;
#else
  vOfP = transformed;
#endif`;
const FRAG_PARS = `
uniform sampler2D ofReg; uniform vec4 ofBox; uniform float ofK; uniform float patK; uniform vec3 patC; uniform float furL; uniform float topK; uniform vec3 topC2; uniform float shirtL;
varying vec3 vOfP;
float ofH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float ofN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ofH(i), ofH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(ofH(i + vec3(0.0, 1.0, 0.0)), ofH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(ofH(i + vec3(0.0, 0.0, 1.0)), ofH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(ofH(i + vec3(0.0, 1.0, 1.0)), ofH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float ofDot(vec2 q, float g, float r) { q.x += mod(floor(q.y / g), 2.0) * g * 0.5; vec2 c = (floor(q / g) + 0.5) * g; return 1.0 - smoothstep(r * 0.75, r, length(q - c)); }
float ofBand(float x, float w) { float f = fract(x); return smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(w, w + 0.03, f)); }
float ofPat(float k, vec3 P, vec2 q) {
  if (k < 1.5) return ofDot(q, 0.24, 0.065);
  if (k < 2.5) return smoothstep(0.57, 0.61, ofN(P * 2.4 + 3.1));
  if (k < 3.5) return ofBand(P.y * 6.0 + 0.25 * sin(q.x * 5.0), 0.3);
  if (k < 4.5) return 1.0 - smoothstep(0.14 * ofBox.w, 0.17 * ofBox.w, P.y);
  return ofDot(q, 0.1, 0.022) * step(0.5, ofH(floor(vec3(q / 0.1, 0.0))));
}
// x: how much of the second colour, y: shade on the base
vec2 ofTop(float k, vec3 P, vec2 q) {
  if (k < 1.5) return vec2(ofBand(P.y * 7.0, 0.45), 1.0);
  if (k < 2.5) return vec2(ofBand(q.x * 12.0, 0.14), 1.0);
  if (k < 3.5) { float a = ofBand(P.y * 5.0, 0.35), b = ofBand(q.x * 5.0, 0.35); return vec2(max(a, b) * 0.5 + a * b * 0.45, 1.0); }
  if (k < 4.5) return vec2(0.0, 0.84 + 0.16 * (0.5 + 0.5 * cos(q.x * 70.0)));
  if (k < 5.5) return vec2(ofDot(q, 0.12, 0.028), 1.0);
  return vec2(0.0, 1.0 - 0.16 * ofBand((q.x + P.y) * 30.0, 0.35));
}`;
const FRAG = `
{
  vec3 ofR = texture2D(ofReg, vMapUv).rgb;
  vec3 P = vec3(vOfP.x - ofBox.x, vOfP.y - ofBox.z, vOfP.z - ofBox.y) * ofK;
  vec2 q = vec2(atan(P.x, P.z) * 0.6, P.y);
  float ofL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  if (patK > 0.5 && ofR.r > 0.02) diffuseColor.rgb = mix(diffuseColor.rgb, patC * clamp(ofL / furL, 0.3, 1.6), ofPat(patK, P, q) * ofR.r);
  if (topK > 0.5 && ofR.g > 0.02) {
    vec2 s = ofTop(topK, P, q);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, topC2 * clamp(ofL / shirtL, 0.3, 1.6), s.x) * s.y, ofR.g);
  }
}`;

const regTex = new Map();   // model id -> its region map as a texture
function regionTexture(id, map) {
  let t = regTex.get(id);
  if (!t) {
    const img = models.regionMaps.get(id);
    if (!img) return null;
    t = new THREE.Texture(img);
    t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT;
    t.needsUpdate = true;
    regTex.set(id, t);
  }
  return t;
}
const boxes = new Map();   // model id -> [cx, cz, y0, height, 1 / head width] in bind space
function bindBox(id, inst) {
  if (boxes.has(id)) return boxes.get(id);
  const s = shape(id, inst);
  let y0 = Infinity;
  inst.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.geometry.computeBoundingBox();
    y0 = Math.min(y0, o.geometry.boundingBox.clone().applyMatrix4(o.bindMatrix).min.y);
  });
  const b = s && y0 < Infinity ? [(s.head.box.min.x + s.head.box.max.x) / 2, (s.head.box.min.z + s.head.box.max.z) / 2, y0, s.head.top - y0, 1 / s.head.size.x] : null;
  boxes.set(id, b);
  return b;
}
const lin = (hex) => new THREE.Color(hex);
const lum = (c) => Math.max(0.02, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
const rgbHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * The shader uniforms of a look's pattern and top on a cast character instance (null when it wears neither, or
 * the model has no region map to lay them on). Kept on each mesh (userData.outfit) so a material made again later
 * (CharacterView.setGlow) gets them back with patchOutfit.
 */
export function outfitUniforms(id, inst, look) {
  const pat = cleanPat(look.pat), top = cleanTop(look.top), T = top && topById(top.id);
  if (!pat && !(T && T.k)) return null;
  const def = models.def(id) || {}, ref = def.recolor || {}, box = bindBox(id, inst);
  if (!box || !models.regionMaps.get(id)) return null;
  const fur = lin(look.fur || (ref.fur ? rgbHex(ref.fur) : '#c8c8c8')), shirt = lin(look.shirt || (ref.shirt ? rgbHex(ref.shirt) : '#969696'));
  return {
    ofReg: { value: null }, ofBox: { value: new THREE.Vector4(box[0], box[1], box[2], box[3] * box[4]) }, ofK: { value: box[4] },
    patK: { value: pat ? patternById(pat.id).k : 0 }, patC: { value: lin(pat ? pat.c : '#000000') }, furL: { value: lum(fur) },
    topK: { value: T ? T.k : 0 }, topC2: { value: lin(T && T.c2 ? T.c2 : '#ffffff') }, shirtL: { value: lum(shirt) },
  };
}

/** Add the pattern and top to one material (it must have a map; chained with any onBeforeCompile already on it). */
export function patchOutfit(m, u) {
  if (!m || !m.map || !u) return;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vOfP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT);
    sh.fragmentShader = FRAG_PARS + '\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>' + FRAG);
  };
  m.customProgramCacheKey = () => 'outfit';
  m.needsUpdate = true;
}

/** Put a look's pattern and top on a character instance (its meshes get materials of their own). */
export function applyOutfit(root, id, inst, look) {
  const u = outfitUniforms(id, inst, look);
  if (!u) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.map) return;
    const reg = regionTexture(id, o.material.map);
    if (!reg) return;
    u.ofReg.value = reg;
    o.material = o.material.clone();
    delete o.material.userData.rim;   // a clone keeps the flag but not the shader patch: CharacterView puts the rim back on
    o.userData.outfit = u;
    patchOutfit(o.material, u);
  });
}
