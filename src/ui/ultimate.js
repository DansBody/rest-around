// Signature-card cut-ins for the battle prototype (ui/battle.js): the "大絕" moment, after the ultimates of Princess
// Connect (a slanted band sweeps across with the character on it), Blue Archive (a quick hard cut with the skill name
// slammed in) and Star Rail / Wuthering Waves (the character's own 3D performance with a moving camera, landing on
// the foe in the same space).
// Refillit's version: the grey battle freezes and drains, a denim band with speed lines tears across, and the team
// member performs on it as their real 3D model drawn as 64-grid pixel art (the café side is the side with colour)
// while the camera cuts and moves; the foe it is aimed at stands in the same 3D space as a grey halftone model.
//   Time Pause (Mocha Latte): a giant clock face races and stops dead — everything stops with it, Mocha mid-pose,
//     the speed lines, the ringing alarm clock — and the camera whips across to the clock as it frosts over.
//   Pounce (Cheetie): a crouch, a dash across the space with afterimages, a leap, a hit-stop on impact, and the
//     foe's colour splashing back from where she struck.
// Motions the clips don't have (crouch, leap) are posed on the bones by code, on top of the playing clip.
// Web Animations for the 2D layers, a small WebGL stage of its own for the 3D; every time is divided by the battle
// speed; a tap skips to the end. Without the 3D models (or WebGL) the character is a still cut-out instead.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { THREE, models } from '../models.js';
import { CharacterView } from '../charview.js';
import { staffLook } from '../looks.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';

/** Cards that get a cut-in, and what they show.
 *  T: the beats in ms at speed 1 (hit = the big moment: time stops / the blow lands).
 *  perf: the 3D performance — clips in order (`at` ms, optional `speed`) and the camera's shots: `at` ms, azimuth
 *  (deg, 0 = from +z; `rel` makes it relative to the way the performer faces), distance (in heights of what it
 *  frames), height (fraction of it), roll (deg), `cut` for a hard cut instead of a move, and `on: 'foe' | 'both' |
 *  'path'` to frame the target, the two of them, or the middle of the performer's run (a move between subjects
 *  pans across the space). `act(ms, ctx)` moves and poses the performer by code. target: the foe model.
 *  freeze: 'after' (the performer stops at the hit and stays stopped) or 'hitstop' (a short stop on impact).
 *  foeFx: 'ice' (frosts over) or 'splash' (its colour splashes back from the hit point). */
export const ULTS = {
  timestop: {
    who: 'mochalatte', title: 'Time Pause', en: 'TIME PAUSE', line: 'Shh. Let time stand still for a moment.',
    theme: 'clock', stamp: 'STOP', target: 'clock', freeze: 'after', foeFx: 'ice',
    T: { band: 120, chara: 260, line: 420, name: 880, race: 880, hit: 1750, fx: 2380, out: 2800, end: 3250 },
    perf: {
      // cheer loops every 0.8 s with the paw highest at 0.4 s: starting it at 550 freezes it paw-up at the stop (1750)
      clips: [{ at: 0, key: 'talk' }, { at: 550, key: 'cheer' }],
      shots: [
        { at: 280, az: -55, dist: 1.75, y: 0.6, roll: -4, cut: true },      // face, close, from the side (in a panel)
        { at: 840, az: -25, dist: 1.9, y: 0.58, roll: -2 },                // a slow orbit round to the front
        { at: 850, az: 24, dist: 2.7, y: 0.32, roll: 3, cut: true },        // hard cut: full body from low down
        { at: 1750, az: 14, dist: 2.55, y: 0.44, roll: 1 },                 // pushing in while the clock races
        { at: 1830, az: 10, dist: 2.15, y: 0.5, roll: 7 },                  // STOP: a punch in, tilted, still head to toe
        { at: 2050, az: 8, dist: 2.1, y: 0.5, roll: 7 },
        { at: 2200, az: -6, dist: 4.6, y: 0.5, roll: 0, on: 'both' },      // whip out: both of them in one frozen frame
        { at: 2380, az: -24, dist: 3.6, y: 0.5, roll: -6, on: 'foe' },     // and in on the frozen alarm clock
        { at: 2800, az: -32, dist: 3.25, y: 0.5, roll: -6, on: 'foe' },
      ],
    },
  },
  pounce: {
    who: 'cheetie', title: 'Pounce', en: 'POUNCE', line: 'Gotcha!',
    theme: 'dash', stamp: '12', target: 'clock', freeze: 'hitstop', foeFx: 'splash',
    T: { band: 120, chara: 260, line: 420, name: 860, dash: 860, leap: 1240, hit: 1480, fx: 1480, out: 2600, end: 3050 },
    perf: {
      clips: [{ at: 0, key: 'idle' }, { at: 860, key: 'walk', speed: 2.6 }, { at: 1240, key: 'walk', speed: 0.4 }, { at: 1640, key: 'cheer' }],
      shots: [
        { at: 280, az: 30, rel: true, dist: 1.85, y: 0.44, roll: 5, cut: true },   // crouched low, eyes on the prey
        { at: 840, az: 14, rel: true, dist: 1.6, y: 0.44, roll: 3 },
        { at: 860, az: -86, rel: true, dist: 5.4, y: 0.42, roll: 0, on: 'path', cut: true },   // side-on, still: she streaks across
        { at: 1240, az: -80, rel: true, dist: 5.0, y: 0.5, roll: -3, on: 'path' },
        { at: 1480, az: 12, dist: 2.5, y: 0.55, roll: -10, on: 'foe', cut: true },   // the blow lands
        { at: 1640, az: 16, dist: 2.6, y: 0.55, roll: -8, on: 'foe' },
        { at: 2500, az: 48, dist: 3.1, y: 0.5, roll: -2, on: 'foe' },      // a slow orbit round the colour coming back
      ],
      act: pounceAct,
    },
  },
};

const ART = 'assets/battle/cutin/';
// testing: hold the 3D performance at a moment (ms) so a frame can be looked at; null plays it in time
let held = null;
export function holdUlt(ms) { held = ms; }
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const OUT = 'cubic-bezier(.2,.8,.3,1)', SNAP = 'cubic-bezier(.3,1.6,.4,1)', IN = 'cubic-bezier(.6,0,.8,.3)';
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const span = (ms, a, b) => clamp01((ms - a) / (b - a));

/** Sound, only once audio is running (a tap has unlocked it). */
function sound(fn) {
  if (!audio.enabled || !audio.ctx || audio.ctx.state !== 'running') return;
  try { fn(audio); } catch { /* audio is best effort */ }
}

// ------------------------------------------------------------------ the 3D stage (one, kept between cut-ins)
// Drawn like the café's 64-grid pixel art (design/art-direction/PLAN.md): the model is rendered small with no
// antialiasing, its edge made hard and inked with a 1-px #1F2A4A outline (as the baked sprites are), then shown at
// PX CSS px per pixel. In the wide shot the character stands about as many pixels tall as its 64-px sprite.
const W3 = 340, H3 = 472, PX = 4, PW = W3 / PX, PH = H3 / PX, SS = 3;   // SS: rendered SS× larger, then majority-voted down
const INK = [0x1f, 0x2a, 0x4a];
let stage = null;
function getStage() {
  if (stage !== null) return stage;
  try {
    const glCanvas = document.createElement('canvas');
    const gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: true });
    gl.setClearColor(0x000000, 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NeutralToneMapping;   // and the lights below: the same as the sprite bake (tools/sprites/bake.html)
    gl.setPixelRatio(1);
    gl.setSize(PW * SS, PH * SS, false);
    const canvas = h('canvas.ult-3d', { width: PW, height: PH });
    const trail = h('canvas.ult-3d.ult-trail', { width: PW, height: PH });   // afterimages, behind the figure
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#FFF8EC', '#B7A9C9', 1.7));
    const key = new THREE.DirectionalLight('#ffffff', 2.0);
    key.position.set(-3, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#bcd0ff', 0.8);
    rim.position.set(4, 3, -5);
    scene.add(rim);
    const big = document.createElement('canvas');
    big.width = PW * SS; big.height = PH * SS;
    stage = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), trail, tctx: trail.getContext('2d'),
      glCanvas, big, bctx: big.getContext('2d', { willReadFrequently: true }), gl, scene,
      cam: new THREE.PerspectiveCamera(30, W3 / H3, 0.05, 60), views: {} };
  } catch (e) {
    console.warn('No 3D stage for cut-ins', e);
    stage = false;
  }
  return stage;
}
/** The team member on the 3D stage (made once per character): height, feet, and its bones by name. */
function performer(st, who) {
  if (!st.views[who]) {
    const cv = new CharacterView(st.scene, { look: staffLook(who), x: 0, y: 0, dir: 1, pose: {} }, { shadow: false });
    const box = new THREE.Box3().setFromObject(cv.inst.root);
    const bones = {}, rest = [];
    cv.inst.root.traverse((o) => { if (o.isBone) { bones[o.name] = o; rest.push([o, o.quaternion.clone()]); } });
    st.views[who] = { cv, bones, rest, height: Math.max(0.5, box.max.y - box.min.y), base: box.min.y };
  }
  for (const [id, v] of Object.entries(st.views)) v.cv.root.visible = id === who;
  const v = st.views[who];
  v.cv.root.position.set(0, 0, 0);
  v.cv.root.rotation.set(0, 0, 0);   // facing +z, towards a camera at azimuth 0
  v.cv.root.scale.set(1, 1, 1);
  return v;
}
/** Turn a bone a little more about its own axes, on top of what the clip set this frame. */
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function bend(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  bone.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z)));
}

// ------------------------------------------------------------------ foes in 3D: grey halftone until their colour returns
/** The foe models: file (tools/build_prop.py output), height and place in performer heights (x to the performer's
 *  right as the camera sees it, z behind), and which way it faces. */
const FOE_ART = { clock: { file: 'assets/battle/models/foe_clock.gltf', height: 0.8, x: 1.7, z: -1.0, yaw: -0.45 } };
const foeModels = {};
/** Load the foe models and make the 3D stage ahead of the first cut-in (the battle calls this when it opens). */
export function preloadUlts() {
  if (!getStage()) return;
  for (const [id, art] of Object.entries(FOE_ART)) {
    if (foeModels[id] !== undefined) continue;
    foeModels[id] = null;
    new GLTFLoader().load(art.file, (g) => { foeModels[id] = greyFoe(g.scene); }, undefined, (e) => console.warn('No 3D foe', id, e));
  }
}
/** The grey world's look on a model: its own colours drained to a printed grey under a halftone dot screen. Its
 *  colour comes back everywhere (uColour 1) or splashes back round a point (uHit, out to uRadius, with a dotted
 *  edge); uIce frosts it in a cold blue. */
function greyFoe(root) {
  const u = { uColour: { value: 0 }, uIce: { value: 0 }, uHit: { value: new THREE.Vector3() }, uRadius: { value: 0 } };
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.MeshLambertMaterial({ map: o.material.map || null, color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n\tvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uColour;\nuniform float uIce;\nuniform vec3 uHit;\nuniform float uRadius;\nvarying vec3 vWorldP;\n'
        + sh.fragmentShader.replace('#include <opaque_fragment>', `
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        vec2 cell = mod(gl_FragCoord.xy, 9.0) - 4.5;
        float ink = step(length(cell), (1.0 - lum) * 6.0);
        vec3 grey = mix(vec3(0.88, 0.87, 0.85), vec3(0.30, 0.31, 0.34), ink * 0.9) * (0.62 + 0.38 * lum);
        float d = distance(vWorldP, uHit) / max(uRadius, 0.0001);
        float edge = step(length(cell) / 4.5, (1.0 - d) * 4.0);   // the edge breaks up into dots, like ink soaking in
        float back = max(uColour, uRadius > 0.0 ? max(step(d, 0.75), edge * step(d, 1.0)) : 0.0);
        vec3 col = mix(grey, outgoingLight * 1.08, back);
        col = mix(col, col * vec3(0.55, 0.74, 1.08) + vec3(0.06, 0.10, 0.20), uIce);
        outgoingLight = col;
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'greyfoe';
    o.material = m;
  });
  const box = new THREE.Box3().setFromObject(root);
  const group = new THREE.Group();
  group.add(root);
  return { group, u, height: Math.max(0.01, box.max.y - box.min.y), base: box.min.y };
}

/** The render onto the shown canvas as pixel art, the way tools/sprites/pixelize.py makes the sprites: each pixel
 *  takes the colour most of its SS×SS block agrees on (so eyes and outlines stay crisp, no in-between colours),
 *  is solid or empty, and every empty pixel that touches the figure is inked. */
function pixelPass(st) {
  const { ctx, bctx } = st, BW = PW * SS;
  bctx.clearRect(0, 0, BW, PH * SS);
  bctx.drawImage(st.glCanvas, 0, 0);
  const src = bctx.getImageData(0, 0, BW, PH * SS).data;
  const img = ctx.createImageData(PW, PH), d = img.data;
  const solid = new Uint8Array(PW * PH), keys = new Int32Array(SS * SS), counts = new Uint8Array(SS * SS);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      let n = 0, filled = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * BW + x * SS + sx) * 4;
          if (src[o + 3] < 110) continue;
          filled++;
          const k = ((src[o] >> 3) << 10) | ((src[o + 1] >> 3) << 5) | (src[o + 2] >> 3);   // 5 bits a channel
          let j = 0;
          while (j < n && keys[j] !== k) j++;
          if (j === n) { keys[n] = k; counts[n++] = 0; }
          counts[j]++;
        }
      }
      const i = y * PW + x, o = i * 4;
      if (filled * 2 <= SS * SS) continue;   // mostly empty: left for the outline
      let best = 0;
      for (let j = 1; j < n; j++) if (counts[j] > counts[best]) best = j;
      const k = keys[best];
      d[o] = ((k >> 10) & 31) * 8 + 4; d[o + 1] = ((k >> 5) & 31) * 8 + 4; d[o + 2] = (k & 31) * 8 + 4; d[o + 3] = 255;
      solid[i] = 1;
    }
  }
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x, o = i * 4;
      if (solid[i]) continue;
      const edge = (x > 0 && solid[i - 1]) || (x < PW - 1 && solid[i + 1]) || (y > 0 && solid[i - PW]) || (y < PH - 1 && solid[i + PW]);
      if (edge) { d[o] = INK[0]; d[o + 1] = INK[1]; d[o + 2] = INK[2]; d[o + 3] = 255; } else d[o + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}
/** Afterimages: the figure's denim silhouette left behind each frame, fading. on = false lets the trail fade out. */
function trailPass(st, on) {
  const c = st.tctx;
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'rgba(0, 0, 0, 0.32)';
  c.fillRect(0, 0, PW, PH);
  if (!on) return;
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.55;
  c.drawImage(st.canvas, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = '#6A84C8';
  c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'source-over';
}
/** Put the camera where the shots say at time `ms` (moves are eased, cuts jump). subject(on) → { at (ground point),
 *  base, height } of what a shot frames; a move from one subject to the other pans across the space between them. */
function cameraAt(shots, ms, subject, cam) {
  let i = 0;
  while (i + 1 < shots.length && shots[i + 1].at <= ms) i++;
  const a = shots[i], b = shots[i + 1];
  const place = (sh) => {
    const s = subject(sh.on), az = (sh.az * Math.PI) / 180 + (sh.rel ? s.yaw : 0), H = s.height;
    const target = new THREE.Vector3(s.at.x, s.base + H * sh.y, s.at.z);
    const pos = new THREE.Vector3(target.x + Math.sin(az) * sh.dist * H, target.y + H * 0.05, target.z + Math.cos(az) * sh.dist * H);
    return { pos, target, roll: sh.roll };
  };
  let p = place(a);
  if (b && !b.cut && ms > a.at) {
    const q = place(b), k = smooth(Math.min(1, (ms - a.at) / (b.at - a.at)));
    p = { pos: p.pos.lerp(q.pos, k), target: p.target.lerp(q.target, k), roll: p.roll + (q.roll - p.roll) * k };
  }
  cam.position.copy(p.pos);
  cam.lookAt(p.target);
  cam.rotateZ((p.roll * Math.PI) / 180);
}

// ------------------------------------------------------------------ Pounce, posed by code
/** Cheetie's pounce: crouch (a low, coiled stance), dash towards the foe, leap (stretched out, paws first) onto it,
 *  bounce off and land. Bones: chest +x leans forward, arm_l −y / arm_r +y reach forward, legs +x kick back,
 *  tail +x lifts, head −x looks up. Returns the contact point for the hit. */
/** Where Cheetie's paws meet the foe (on the ground), in front of it on her side. */
function pounceContact(H, foeAt) {
  return foeAt ? foeAt.clone().add(new THREE.Vector3(-0.42 * H, 0, 0.32 * H)) : new THREE.Vector3(1.2 * H, 0, -0.6 * H);
}
function pounceAct(ms, { live, foeAt, T }) {
  const H = live.height, root = live.cv.root, b = live.bones;
  const start = new THREE.Vector3(0, 0, 0);
  const contact = pounceContact(H, foeAt);
  const runEnd = start.clone().lerp(contact, 0.55);
  const landing = contact.clone().add(new THREE.Vector3(-0.55 * H, 0, 0.35 * H));
  let pos = start.clone(), lift = 0, crouch = 0, stretch = 0, pitch = 0;
  if (ms < T.dash) {   // coiled, low, wiggling before the spring
    crouch = smooth(span(ms, 200, 600));
    pos.x -= Math.sin(ms * 0.03) * 0.015 * H * crouch;
  } else if (ms < T.leap) {   // the dash
    const k = span(ms, T.dash, T.leap);
    pos = start.clone().lerp(runEnd, k * k * 0.4 + k * 0.6);
    crouch = 0.35; pitch = 0.45;
  } else if (ms < T.hit) {   // the leap: a low arc, stretched out
    const k = span(ms, T.leap, T.hit);
    pos = runEnd.clone().lerp(contact, k);
    lift = Math.sin(k * Math.PI * 0.85) * 0.55 * H;
    stretch = smooth(clamp01(k * 2.2)); pitch = 0.3 + 0.5 * k;
  } else {   // bounce off and land
    const k = span(ms, T.hit + 120, T.hit + 520);   // the first 120 ms: the hit-stop holds her on the foe
    pos = contact.clone().lerp(landing, smooth(k));
    lift = ms < T.hit + 120 ? 0.32 * H : Math.sin((1 - k) * Math.PI * 0.5) * 0.32 * H * (1 - k) + Math.sin(k * Math.PI) * 0.18 * H;
    stretch = 1 - smooth(k); pitch = 0.8 * (1 - k);
    crouch = k > 0.85 ? (1 - span(k, 0.85, 1)) * 0.6 : 0;   // a little give on landing
  }
  root.position.set(pos.x, lift, pos.z);
  const aim = ms < T.hit + 120 ? contact.clone().sub(start) : contact.clone().sub(landing).multiplyScalar(-1);
  root.rotation.set(0, Math.atan2(aim.x, aim.z) * (ms < 300 ? smooth(ms / 300) : 1), 0);
  // squash when coiled, stretch when flying
  root.scale.set(1 + 0.08 * crouch - 0.05 * stretch, 1 - 0.14 * crouch + 0.1 * stretch, 1 + 0.08 * crouch + 0.12 * stretch);
  bend(b.chest, 0.35 * crouch + pitch * 0.9 + 0.25 * stretch);
  bend(b.head, -0.3 * crouch - 0.45 * stretch - pitch * 0.4);
  bend(b.arm_l, 0, -0.5 * crouch - 1.35 * stretch, 0.25 * stretch);
  bend(b.arm_r, 0, 0.5 * crouch + 1.35 * stretch, -0.25 * stretch);
  bend(b.leg_l, 0.95 * stretch - 0.25 * crouch);
  bend(b.leg_r, 0.95 * stretch - 0.25 * crouch);
  bend(b.tail, 0.5 * crouch + 0.7 * stretch);
  return contact.clone().add(new THREE.Vector3(0.18 * H, 0.55 * H, -0.12 * H));
}

/** Play the cut-in for card `id` over the battle frame. Resolves when it is over (or skipped).
 *  opts.foe: the foe id it is aimed at (its 3D model is shown only when it has one). */
export function playUlt(frame, id, speed = 1, opts = {}) {
  const u = ULTS[id];
  if (!u || quiet()) return Promise.resolve();
  const T = u.T, s = speed, anims = [];
  // fill 'both' holds the first frame through the delay; a later animation of a property already animated must
  // only fill forwards, or its first frame would win from the start
  const A = (el, frames, at, dur, easing = OUT, fill = 'both') => { anims.push(el.animate(frames, { delay: at / s, duration: dur / s, easing, fill })); };

  const st = u.perf && models.def(u.who) ? getStage() : false;
  const live = st ? performer(st, u.who) : null;
  // the foe it is aimed at, in the same space (once its model has loaded); without it the camera stays on the performer
  const target = opts.foe || u.target;
  const foe = live && FOE_ART[target] && foeModels[target] ? foeModels[target] : null;
  for (const f of Object.values(foeModels)) if (f) f.group.visible = f === foe;
  let foeAt = null;
  if (foe) {
    const art = FOE_ART[target], k = (art.height * live.height) / foe.height;
    if (!foe.group.parent) st.scene.add(foe.group);
    foe.group.scale.setScalar(k);
    foeAt = new THREE.Vector3(art.x * live.height, live.base - foe.base * k, art.z * live.height);
    foe.group.position.copy(foeAt);
    foe.group.rotation.set(0, art.yaw, 0);
    foe.u.uColour.value = 0; foe.u.uIce.value = 0; foe.u.uRadius.value = 0;
  }
  const shots = u.perf ? u.perf.shots : [];   // without the foe's model, its shots frame the performer
  const mateAt = new THREE.Vector3();
  const pathAt = live ? pounceContact(live.height, foeAt).multiplyScalar(0.72) : null;   // most of the way along a run at the foe
  const subject = (on) => {
    const yaw = live.cv.root.rotation.y;
    if (on === 'foe' && foe) return { at: foeAt, base: live.base, height: foe.height * foe.group.scale.x, yaw };
    if (on === 'both' && foe) return { at: foeAt.clone().add(mateAt).multiplyScalar(0.5), base: live.base, height: live.height, yaw };
    if (on === 'path') return { at: pathAt, base: live.base, height: live.height, yaw };
    return { at: mateAt, base: live.base, height: live.height, yaw };
  };

  const dim = h('div.ult-dim');
  const theme = u.theme === 'clock' ? clockFace(T) : u.theme === 'dash' ? dashLines(T) : null;
  const band = h('div.ult-band', h('i.ult-lines'));
  const chara = live ? h('div.ult-chara.live', st.trail, st.canvas) : h('div.ult-chara', h('img', { src: ART + u.who + '.webp', alt: '' }));
  const panel = live ? h('div.ult-panel') : null;   // the close-up sits in a slanted comic panel until the hard cut
  if (!live) chara.style.setProperty('--art', `url(${ART + u.who}.webp)`);
  const name = h('div.ult-name', h('small', u.en), h('b', t(u.title)));
  const line = h('div.ult-line', h('span', '「' + t(u.line) + '」'));
  const stamp = h('div.ult-stamp' + (u.foeFx === 'splash' ? '.dmg' : ''), u.stamp);
  const flash = h('div.ult-flash');
  const root = h('div.ult.' + u.theme, dim, theme && theme.el, band, panel, chara, name, line, stamp, flash);
  frame.appendChild(root);
  if (st) st.tctx.clearRect(0, 0, PW, PH);

  // the battle freezes and drains to grey
  A(dim, [{ opacity: 0 }, { opacity: 1 }], 0, 180, 'linear');
  sound((a) => a.noise(0.35, { vol: 0.12, freq: 900, q: 0.6 }));
  // the band tears across, speed lines streaming (Time Pause: until time stops, and they stop too)
  A(band, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], T.band, 260);
  const lines = u.freeze === 'after' ? T.hit - T.band : T.out - T.band;
  A(band.firstChild, [{ backgroundPosition: '0 0' }, { backgroundPosition: `-${Math.round(lines * (u.theme === 'dash' ? 1.6 : 0.7))}px 0` }], T.band, lines, 'linear');
  // the team member on it, in colour
  A(chara, [{ transform: 'translateX(-340px) rotate(-8deg)', opacity: 0 }, { transform: 'translateX(10px) rotate(-3deg)', opacity: 1, offset: 0.7 }, { transform: 'translateX(0) rotate(-3deg)', opacity: 1 }], T.chara, 340, SNAP);
  if (!live) A(chara, [{ translate: '0 0' }, { translate: '14px -4px' }], T.chara + 380, T.out - T.chara - 380, 'linear');
  else {
    // the close-up is cropped to the panel; at the hard cut the whole figure is free on the band
    const P = 'polygon(6% 22%, 100% 12%, 96% 66%, 0% 74%)', FREE = 'polygon(-40% -40%, 140% -40%, 140% 140%, -40% 140%)';
    A(chara, [{ clipPath: P }, { clipPath: P, offset: 0.999 }, { clipPath: FREE }], 0, T.name, 'linear');
    A(panel, [{ transform: 'translateX(-340px) rotate(-8deg)', opacity: 0 }, { transform: 'translateX(10px) rotate(-3deg)', opacity: 1, offset: 0.7 }, { transform: 'translateX(0) rotate(-3deg)', opacity: 1 }], T.chara, 340, SNAP);
    A(panel, [{ opacity: 1 }, { opacity: 0 }], T.name, 1, 'linear', 'forwards');
  }
  sound((a) => a.play('ability'));
  // the line, typed out over the close-up
  A(line.firstChild, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], T.line, 380, 'steps(12, end)');
  A(line, [{ opacity: 1 }, { opacity: 0 }], T.name - 40, 120, 'linear', 'forwards');
  // the hard cut: the name plate slams in from the right
  A(name, [{ transform: 'translateX(320px) rotate(-6deg) scale(1.4)', opacity: 0 }, { transform: 'translateX(-10px) rotate(-6deg) scale(.96)', opacity: 1, offset: 0.65 }, { transform: 'translateX(0) rotate(-6deg) scale(1)', opacity: 1 }], T.name, 320, SNAP);
  A(flash, [{ opacity: 0 }, { opacity: 0.6, offset: 0.2 }, { opacity: 0 }], T.name - 30, 160, 'linear');
  sound((a) => { a.tone(140, 0.18, { type: 'square', vol: 0.12, at: T.name / 1000 / s, slide: -60 }); a.noise(0.12, { vol: 0.18, at: T.name / 1000 / s, freq: 500, q: 0.7 }); });
  if (theme) theme.play(A, s);
  // the big moment: flash, shake, the stamp (STOP / the damage)
  A(flash, [{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], T.hit, 260, 'linear', 'forwards');
  A(stamp, [{ transform: 'rotate(8deg) scale(2.6)', opacity: 0 }, { transform: 'rotate(8deg) scale(.92)', opacity: 1, offset: 0.6 }, { transform: 'rotate(8deg) scale(1)', opacity: 1 }], T.hit, 240, SNAP);
  A(frame, [{ translate: '0 0' }, { translate: '-9px 5px' }, { translate: '7px -4px' }, { translate: '-4px 2px' }, { translate: '0 0' }], T.hit, 280, 'steps(4, end)', 'forwards');
  if (u.freeze === 'after') A(chara, [{ filter: 'none' }, { filter: 'grayscale(.15) contrast(1.15) brightness(1.08)' }], T.hit, 60, 'linear', 'forwards');
  sound((a) => {
    const at = T.hit / 1000 / s;
    if (u.foeFx === 'splash') { a.tone(70, 0.35, { type: 'square', vol: 0.22, at, slide: -30 }); a.noise(0.25, { vol: 0.3, at, freq: 700, q: 0.5 }); a.play('levelup'); }
    else { a.tone(90, 0.5, { type: 'triangle', vol: 0.28, at, slide: -40 }); a.noise(0.4, { vol: 0.14, at, freq: 5200, q: 1.2, type: 'highpass' }); }
  });
  if (u.theme === 'dash') sound((a) => { a.noise(0.4, { vol: 0.16, at: T.dash / 1000 / s, freq: 2400, q: 0.5 }); a.noise(0.25, { vol: 0.14, at: T.leap / 1000 / s, freq: 3200, q: 0.6 }); });
  // out: the band and everything on it slide off, the theme swells and fades
  for (const el of [band, chara, name, stamp]) A(el, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '220px 0' }], T.out, 300, IN, 'forwards');
  A(dim, [{ opacity: 1 }, { opacity: 0 }], T.out + 100, 300, 'linear', 'forwards');
  sound((a) => a.noise(0.3, { vol: 0.1, at: T.out / 1000 / s, freq: 1400, q: 0.6 }));

  // the 3D performance: clips on cue, posed by code, the camera along its shots, frozen at the hit as the ult says
  let raf = 0, last = performance.now(), ms = 0, clip = -1, hitAt = null;
  const perf = u.perf;
  const frozen = (m) => (u.freeze === 'after' ? m >= T.hit : m >= T.hit && m < T.hit + 120);
  const playClip = (i, fade) => {
    const c = perf.clips[i];
    live.cv.current = null;
    live.cv.play(c.key, fade);
    const act = live.cv.inst.actions[live.cv.anims[c.key]];
    if (act) act.timeScale = c.speed || 1;
  };
  const draw = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000) * s;
    last = now;
    const mixer = live.cv.inst.mixer;
    // back to the rest pose first: a clip only sets the bones it keys, and the code's bends must not pile up on the rest
    for (const [bone, q] of live.rest) bone.quaternion.copy(q);
    if (held != null) {
      ms = held;
      const i = Math.max(0, perf.clips.findLastIndex((c) => c.at <= ms));
      if (i !== clip) { clip = i; playClip(i, 0); }
      const c = perf.clips[i], m = u.freeze === 'after' ? Math.min(ms, T.hit) : ms;
      if (mixer) mixer.setTime(((m - c.at) / 1000) * (c.speed || 1));
    } else {
      ms = ms + dt * 1000;
      while (clip + 1 < perf.clips.length && perf.clips[clip + 1].at <= ms) { clip++; playClip(clip, clip ? 0.08 : 0); }
      if (mixer) mixer.update(frozen(ms) ? 0 : dt);
    }
    // the performer's own moves, and where the blow lands
    const pm = frozen(ms) ? (u.freeze === 'after' ? Math.min(ms, T.hit) : T.hit) : ms;
    const hit = perf.act ? perf.act(pm, { live, foeAt, T }) : null;
    if (hit) hitAt = hit;
    mateAt.set(live.cv.root.position.x, 0, live.cv.root.position.z);
    if (foe) {
      if (u.foeFx === 'ice') {
        // ringing until time stops (and stopped mid-shake), then frosting over once the camera is on it
        const f = Math.min(ms, T.hit);
        foe.group.rotation.set(0, FOE_ART[target].yaw, Math.sin(f * 0.09) * 0.09);
        foe.group.position.y = foeAt.y + Math.abs(Math.sin(f * 0.045)) * 0.05 * live.height;
        foe.u.uIce.value = smooth(span(ms, T.fx, T.fx + 260));
      } else {
        // ringing until struck; knocked back, wobbling, its colour splashing out from the hit
        const f = Math.min(ms, T.hit), after = Math.max(0, ms - T.hit - 120), w = Math.exp(-after / 380);
        const knock = ms >= T.hit ? (1 - Math.exp(-(ms - T.hit) / 90)) : 0;
        foe.group.rotation.set(-0.38 * knock * w - 0.06 * knock, FOE_ART[target].yaw + 0.12 * knock, Math.sin(f * 0.09) * 0.08 * (1 - knock) + Math.sin(after * 0.03) * 0.12 * w * knock);
        foe.group.position.set(foeAt.x + 0.16 * live.height * knock, foeAt.y, foeAt.z - 0.1 * live.height * knock);
        if (hitAt) foe.u.uHit.value.copy(hitAt);
        foe.u.uRadius.value = ms < T.hit ? 0 : live.height * 0.72 * (1 - Math.exp(-(ms - T.hit) / 260));
      }
    }
    cameraAt(shots, ms, subject, st.cam);
    st.gl.render(st.scene, st.cam);
    pixelPass(st);
    trailPass(st, u.theme === 'dash' && ms >= T.dash && ms < T.hit);
    raf = requestAnimationFrame(draw);
  };
  if (live) {
    if (live.cv.inst.mixer) live.cv.inst.mixer.stopAllAction();
    live.cv.current = null;
    raf = requestAnimationFrame(draw);
  }
  const total = T.end / s;

  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
      root.remove();
      resolve();
    };
    const timer = setTimeout(end, total);
    root.addEventListener('click', (e) => { e.stopPropagation(); end(); });
  });
}

/** Time Pause's world: a giant clock face; the second hand races round, ticking, then stops dead and the glass cracks. */
function clockFace(T) {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 236 : 220, r1 = 250;
    return `<line x1="${280 + Math.sin(a) * r0}" y1="${280 - Math.cos(a) * r0}" x2="${280 + Math.sin(a) * r1}" y2="${280 - Math.cos(a) * r1}" stroke="#1F2A4A" stroke-width="${i % 5 ? 2 : 6}"/>`;
  }).join('');
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].map((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<text x="${280 + Math.sin(a) * 190}" y="${280 - Math.cos(a) * 190 + 9}" text-anchor="middle" font-size="26" fill="#1F2A4A" font-family="Refillit LCD, monospace">${n}</text>`;
  }).join('');
  const el = h('div.ult-clock', { html: `<svg viewBox="0 0 560 560" aria-hidden="true">
    <circle cx="280" cy="280" r="268" fill="#F4EFE6" stroke="#1F2A4A" stroke-width="8"/>
    <circle cx="280" cy="280" r="256" fill="none" stroke="#3F5DAA" stroke-width="10"/>
    <circle cx="280" cy="280" r="150" fill="none" stroke="#1F2A4A" stroke-width="1.5" stroke-dasharray="4 6"/>
    ${ticks}${nums}
    <g class="ult-hand-h"><rect x="272" y="150" width="16" height="140" fill="#1F2A4A"/></g>
    <g class="ult-hand-m"><rect x="275" y="70" width="10" height="220" fill="#1F2A4A"/></g>
    <g class="ult-hand-s"><rect x="278" y="40" width="4" height="270" fill="#3F5DAA"/><circle cx="280" cy="60" r="10" fill="#3F5DAA"/></g>
    <circle cx="280" cy="280" r="14" fill="#1F2A4A"/><circle cx="280" cy="280" r="5" fill="#fff"/>
    <g class="ult-crack" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="square">
      <path d="M280 280 L180 120 L150 60"/><path d="M280 280 L420 170 L500 150"/><path d="M280 280 L330 450 L310 530"/>
      <path d="M280 280 L110 330 L40 320"/><path d="M180 120 L120 150"/><path d="M420 170 L440 100"/><path d="M330 450 L400 470"/>
    </g></svg>` });
  const sec = el.querySelector('.ult-hand-s'), min = el.querySelector('.ult-hand-m'), crack = el.querySelector('.ult-crack');
  for (const g of [sec, min, el.querySelector('.ult-hand-h')]) { g.style.transformOrigin = '280px 280px'; g.style.transformBox = 'view-box'; }
  const race = T.hit - T.race;
  return {
    el,
    play(A, s) {
      A(el, [{ transform: 'translate(-50%, -50%) scale(.35) rotate(-40deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.04) rotate(4deg)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 }], T.race - 120, 520, OUT);
      // racing, then a dead stop with a little recoil
      A(sec, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(1080deg)', offset: 0.9 }, { transform: 'rotate(1076deg)', offset: 0.95 }, { transform: 'rotate(1080deg)' }], T.race, race + 80, 'cubic-bezier(.2,.4,.6,1)');
      A(min, [{ transform: 'rotate(40deg)' }, { transform: 'rotate(130deg)' }], T.race, race, 'cubic-bezier(.2,.4,.6,1)');
      A(crack, [{ opacity: 0, strokeDasharray: '0 800' }, { opacity: 1, strokeDasharray: '800 0' }], T.hit, 200, 'linear');
      A(el, [{ filter: 'invert(0)' }, { filter: 'invert(1)' }, { filter: 'invert(0)' }], T.hit, 220, 'steps(2, end)');
      A(el, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.25)' }], T.out + 50, 320, IN, 'forwards');
      // ticks while it races, slowing into the stop
      sound((a) => { let at = T.race / 1000, gap = 0.05; while (at < T.hit / 1000 - 0.02) { a.tone(2400, 0.025, { type: 'square', vol: 0.04, at: at / s }); at += gap; gap *= 1.06; } });
    },
  };
}

/** Pounce's world: manga focus lines (集中線) closing in on where the blow will land, and a burst ring on impact. */
function dashLines(T) {
  const cx = 250, cy = 330;
  const spokes = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2 + (i % 3) * 0.02, r0 = 120 + (i * 37) % 70, w = 0.012 + ((i * 13) % 7) * 0.004;
    const p = (r, d) => `${(cx + Math.cos(a + d) * r).toFixed(1)},${(cy + Math.sin(a + d) * r).toFixed(1)}`;
    return `<polygon points="${p(r0, 0)} ${p(900, -w)} ${p(900, w)}" fill="${i % 4 ? '#1F2A4A' : '#3F5DAA'}"/>`;
  }).join('');
  const el = h('div.ult-burst', { html: `<svg viewBox="0 0 390 844" aria-hidden="true"><g class="ult-rays">${spokes}</g>
    <circle class="ult-ring" cx="${cx}" cy="${cy}" r="40" fill="none" stroke="#fff" stroke-width="10"/>
    <circle class="ult-ring2" cx="${cx}" cy="${cy}" r="40" fill="none" stroke="#F6CDBF" stroke-width="5"/></svg>` });
  const rays = el.querySelector('.ult-rays'), ring = el.querySelector('.ult-ring'), ring2 = el.querySelector('.ult-ring2');
  for (const g of [rays, ring, ring2]) { g.style.transformOrigin = `${cx}px ${cy}px`; g.style.transformBox = 'view-box'; }
  return {
    el,
    play(A) {
      A(el, [{ opacity: 0 }, { opacity: 1 }], T.dash, 120, 'linear');
      A(rays, [{ transform: 'scale(1.6)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], T.dash, T.hit - T.dash, 'cubic-bezier(.5,0,.9,.6)');
      A(rays, [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(.92) rotate(4deg)' }, { transform: 'scale(1.05) rotate(-2deg)' }], T.hit, 300, 'steps(3, end)', 'forwards');
      A(ring, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(6)', opacity: 0 }], T.hit, 420, OUT);
      A(ring2, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(4.2)', opacity: 0 }], T.hit + 60, 460, OUT);
      A(el, [{ opacity: 1 }, { opacity: 0 }], T.out, 300, IN, 'forwards');
    },
  };
}
