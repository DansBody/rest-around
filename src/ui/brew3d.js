// The hand brew on the cart's counter in 3D (prototype): the game's own look instead of brew.js's photo stickers.
// Low-poly props made in code (a scale, the colourist's bag of beans and a bowl, a hand grinder, a dripper on a glass
// server, a gooseneck kettle, the counter under the cart's awning), lit in the café's three flat toon steps with a
// 1-px ink outline, drawn at the café's pixel size. The camera eases from station to station along the counter:
//   dose   hold to tip the bag over the bowl on the scale: beans tumble in, the last few still in the air when you let go;
//          a measuring spoon digs a few out of the bowl and tips them back into the bag
//   grind  the grinder's lid lifts off, the bowl tips its beans in and is set down, the lid goes back on; then draw
//          circles round it and the crank follows the finger
//   bloom, pour   the dripper on its server slides onto the scale; the kettle's spout follows the finger (a touch pours a
//          little above itself, so the finger doesn't hide the stream), the water stands in the cone and drains
//          into the server, where the coffee comes in grey and gains its colour as the stream keeps to the dot.
// Scored by brew.js's scoreBrew, the same rules as the sticker version. Opened from the DEV tab (手沖 3D) and ?brew3d.
import { THREE } from '../models.js';
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { scoreBrew, verdictLine, POUR, DOSING } from './brew.js';

const { DOSE, BLOOM, FULL, SPILL, FILL_S, SETTLE, RING, GUIDE, LAP, NEAR, CUP_G } = POUR;
const { DOSE_OK, BEAN_RATE, RAMP: TIP_RAMP, LAG, SCOOP, BOWL_MAX, TURNS } = DOSING;
const INK = '#1F2A4A';
const PX = 2.4;                 // screen px per drawn pixel, as the café (renderer.js)
const LIFT = 34;                // css px: a finger on glass pours this far above itself
// the dripper, in cm (1 unit = 1 cm): it sits on the server, the server on the scale, the scale on the counter
const SCALE_TOP = 2.4, SERVER_H = 10.2, DRIP_Y = SCALE_TOP + SERVER_H;
const CONE = { r0: 1.5, y0: 1.3, r1: 5.6, y1: 9.3 };   // the paper's inside: radius r0 at height y0 (above DRIP_Y) to r1 at y1
const BED_Y = 5, RIM_Y = 8.6;   // the grounds' top and the highest the water stands, above DRIP_Y
const coneR = (y) => CONE.r0 + (CONE.r1 - CONE.r0) * (y - CONE.y0) / (CONE.y1 - CONE.y0);
const BED_R = coneR(BED_Y);     // the bed's radius: the unit the ring, the dot and NEAR are measured in
const STREAM = 9;               // cm from the spout down to the water (more when the kettle must clear the rim)
const RIM_CLEAR = 7.6, RIM_TOP = 9.9;   // the dripper's rim with room to spare: radius, and height above DRIP_Y
const DRAIN = 0.45;             // of the water standing in the cone, the share that drains through each second
const HOLDS = 0.42;             // the cone is full to its rim at this much of the cup standing in it
const SERVER_FULL = 7.6;        // cm of coffee in the server for a full cup
const GREY = new THREE.Color('#8e8e8e'), COFFEE = new THREE.Color('#7a3a17');
// along the counter: the dripper waits on the left till the beans are ground, the grinder stands on the right
const PARK = new THREE.Vector3(-21, -SCALE_TOP, -4);   // the dripper and its server's offset while they wait on the counter
const GRIND = new THREE.Vector3(21, 0, -3), CRANK_Y = 11.6, CRANK_R = 6.4;   // the grinder's foot, the crank's height and reach
const PILE = 150, BEAN_G = DOSE / 140;   // beans the bowl can show, and grams a bean (140 beans to a dose)
const SCOOP_S = 1.2, TAKE = 0.42, SPILL_K = 0.8;   // a scoop's length (s); when in it the beans leave the bowl, and go into the bag
const FALLING = 32;                      // beans in the air at once, at most
const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hiss(dur, o) { if (audio.enabled && audio.ctx && audio.ctx.state === 'running') try { audio.noise(dur, o); } catch { /* no sound */ } }

// the café's toon ramp (renderer.js TOON_RAMP): three flat steps
const RAMP = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.needsUpdate = true;
const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...o });
const flat = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
/** A mesh that casts and takes the sun's shadow. */
function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
function canvasTex(w, hgt, draw, nearest = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  draw(c.getContext('2d'), w, hgt);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  if (nearest) tx.magFilter = THREE.NearestFilter;
  return tx;
}

/** The counter, the scale, the server and the dripper, the kettle, a few things at the back, the awning's edge. */
function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aab0bb');   // the street beyond, grey after the rain
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8f7a66, 0.84));
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.05);
  sun.position.set(-26, 60, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 10, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // the counter: oak planks running side to side
  const planks = canvasTex(64, 64, (x, w, hh) => {
    x.fillStyle = '#9a6a43'; x.fillRect(0, 0, w, hh);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = ['#9a6a43', '#a3734a', '#93633e', '#9f6f47'][i]; x.fillRect(0, i * 16, w, 15);
      x.fillStyle = '#6e4529'; x.fillRect(0, i * 16 + 15, w, 1);
      x.fillStyle = 'rgba(110,69,41,.35)'; x.fillRect((i * 23) % w, i * 16 + 6, 9, 1);
    }
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(3, 4);
  const counter = mesh(new THREE.BoxGeometry(110, 6, 110), toon('#ffffff', { map: planks }), false);
  counter.position.set(0, -3, 22);   // its back edge 33 cm behind the dripper, its front well past the bottom of the view
  scene.add(counter);
  // the street below and beyond the counter's back edge: grey stones in a running bond, still wet
  const stones = canvasTex(64, 64, (x, w, hh) => {
    x.fillStyle = '#7f858f'; x.fillRect(0, 0, w, hh);
    for (let row = 0; row < 4; row++) for (let i = -1; i < 3; i++) {
      x.fillStyle = ['#a3a9b2', '#9aa0aa', '#a9aeb6', '#959ba5'][(row + i + 4) % 4];
      x.fillRect(i * 32 + (row % 2) * 16 + 1, row * 16 + 1, 30, 14);
    }
    x.fillStyle = 'rgba(220,228,236,.35)'; x.fillRect(5, 20, 12, 2); x.fillRect(40, 52, 9, 2);   // puddle glints
  });
  stones.wrapS = stones.wrapT = THREE.RepeatWrapping; stones.repeat.set(26, 12);
  const street = mesh(new THREE.PlaneGeometry(260, 120), toon('#ffffff', { map: stones }), false);
  street.rotation.x = -Math.PI / 2; street.position.set(0, -40, -90);
  scene.add(street);

  // the scale: dark body, steel plate, the LCD's dark glass at the front (the grams are drawn over it in HTML)
  const scale = new THREE.Group();
  scale.add(mesh(new THREE.BoxGeometry(15, 2, 16), toon('#2f3442')));
  const plate = mesh(new THREE.BoxGeometry(13, 0.4, 11.5), toon('#c3c7cf'));
  plate.position.set(0, 1.2, -1.6); scale.add(plate);
  const lcd = mesh(new THREE.BoxGeometry(7, 0.2, 2.4), toon('#3e4a45'), false);
  lcd.position.set(0, 1.05, 6); scale.add(lcd);
  scale.position.y = 1;
  scene.add(scale);

  // the dripper on its server (and the thread of coffee between them) move as one: they wait on the counter (PARK)
  // till the beans are ground, then go onto the scale
  const rig = new THREE.Group();
  scene.add(rig);
  // the server: glass, with the coffee inside drawn as its own solid so it outlines through the glass
  const server = new THREE.Group();
  server.position.set(0, SCALE_TOP, -1.6);
  const glass = new THREE.Mesh(lathe([[0, 0], [4.6, 0], [5.1, 0.7], [5.3, 3], [5.1, 6.4], [4.3, 8.8], [3.7, 9.6], [3.9, SERVER_H]], 24),
    toon('#dbe8f0', { transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  server.add(glass);
  const coffeeMat = toon(GREY.clone());
  const coffee = mesh(lathe([[0, 0], [4.55, 0], [4.95, 0.6], [5.1, 3], [4.9, 6.4], [4.15, 8.8], [0, 8.8]], 20), coffeeMat, false);
  coffee.position.y = 0.15; coffee.scale.y = 0.001;
  server.add(coffee);
  const lip = mesh(new THREE.TorusGeometry(3.85, 0.18, 6, 24), toon('#c9d6de'), false);   // the glass's rim, so it reads
  lip.rotation.x = Math.PI / 2; lip.position.y = SERVER_H; server.add(lip);
  rig.add(server);

  // the dripper: cream ceramic cone on a flange, the paper inside, the grounds, the water standing on them
  const drip = new THREE.Group();
  drip.position.set(0, DRIP_Y, -1.6);
  const cream = toon('#f1ebe0');
  drip.add(mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.5, 28), cream));
  const foot = mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 20), cream); foot.position.y = -0.5; drip.add(foot);
  const cone = mesh(lathe([[2.2, 0.2], [6.6, 8.6], [6.9, 9.2], [6.1, 9.3], [CONE.r1 + 0.2, CONE.y1], [CONE.r0 + 0.2, CONE.y0], [1.2, 0.6]], 28), cream);
  cone.material = toon('#f1ebe0', { side: THREE.DoubleSide });
  drip.add(cone);
  const handle = mesh(new THREE.TorusGeometry(1.7, 0.55, 6, 12, Math.PI * 1.3), cream);
  handle.position.set(7.4, 5.4, 0); handle.rotation.z = -Math.PI * 0.65; drip.add(handle);
  const paper = mesh(lathe([[CONE.r0, CONE.y0], [CONE.r1, CONE.y1], [CONE.r1 + 0.5, CONE.y1 + 0.9]], 24), toon('#fbfaf5', { side: THREE.DoubleSide }), false);
  drip.add(paper);
  const bedMat = toon('#3b2416', { side: THREE.DoubleSide });
  const bed = mesh(lathe([[0, BED_Y + 0.55], [BED_R * 0.55, BED_Y + 0.35], [BED_R, BED_Y]], 20), bedMat, false);
  drip.add(bed);
  const poolMat = toon('#5a2f16');
  const pool = mesh(new THREE.CircleGeometry(1, 28), poolMat, false);
  pool.rotation.x = -Math.PI / 2; pool.visible = false;
  drip.add(pool);
  // the ring the stream should keep in, and the dot to follow, on the water (or the bed)
  const ringMat = flat('#ffffff', { transparent: true, opacity: 0.55, depthWrite: false });
  const rings = new THREE.Group();
  for (const r of RING) { const m = new THREE.Mesh(new THREE.RingGeometry(r * BED_R - 0.09, r * BED_R + 0.09, 40), ringMat); m.rotation.x = -Math.PI / 2; rings.add(m); }
  drip.add(rings);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), flat('#ffffff'));
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 20), flat('#fff3c8', { transparent: true, opacity: 0.6, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2;
  const guide = new THREE.Group(); guide.add(dot, halo); guide.visible = false;
  drip.add(guide);
  // the bloom: the grounds swell, pale bubbles on top
  const bubbles = new THREE.Group();
  const bubMat = toon('#c99a6a');
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, rr = BED_R * (0.15 + 0.6 * ((i * 37) % 10) / 10);
    const b = mesh(new THREE.SphereGeometry(0.28 + (i % 3) * 0.08, 6, 5), bubMat, false);
    b.position.set(Math.cos(a) * rr, BED_Y + 0.5, Math.sin(a) * rr); bubbles.add(b);
  }
  bubbles.visible = false; drip.add(bubbles);
  rig.add(drip);

  // the drip from the dripper's foot into the server, and the stream from the spout
  const dribble = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 5), toon('#5a2f16'), false);
  dribble.geometry.translate(0, -0.5, 0); dribble.position.set(0, DRIP_Y - 0.9, -1.6); dribble.visible = false;
  rig.add(dribble);
  const stream = mesh(new THREE.CylinderGeometry(0.2, 0.15, 1, 6), toon('#e4eef5'), false);
  stream.geometry.translate(0, -0.5, 0); stream.visible = false;
  scene.add(stream);
  const splash = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 16), flat('#ffffff', { transparent: true, opacity: 0.8, depthWrite: false }));
  splash.rotation.x = -Math.PI / 2; splash.visible = false;
  scene.add(splash);

  // the kettle: built with its spout tip at the group's origin, so it tips round the tip and the stream never jumps
  const kettle = new THREE.Group();
  const kb = new THREE.Group(); kettle.add(kb);
  const steel = toon('#b4bac4'), wood = toon('#8a5a3a');   // brushed steel: a dark kettle reads as one ink blob
  const body = mesh(lathe([[0, 0], [5.2, 0], [5.8, 0.8], [6, 5.5], [5.2, 8.6], [3.4, 9.8], [0, 10.1]], 22), steel);
  kb.add(body);
  const knob = mesh(new THREE.SphereGeometry(1, 10, 8), wood); knob.position.y = 10.5; kb.add(knob);
  const neck = new THREE.CatmullRomCurve3([[5.2, 1.6], [9.2, 2.4], [12.4, 7], [14.8, 11.4], [17, 12.2], [18.6, 11]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  kb.add(mesh(new THREE.TubeGeometry(neck, 24, 0.5, 7), steel));
  const grip = new THREE.CatmullRomCurve3([[-5.6, 8], [-10, 9], [-11, 4], [-6, 1.6]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  kb.add(mesh(new THREE.TubeGeometry(grip, 16, 0.85, 7), wood));
  kb.position.set(-18.6, -11, 0);   // the spout's tip to the origin
  kettle.rotation.y = -2;           // the body behind the dripper and to the right; the spout reaching forward and left
  scene.add(kettle);
  // points on the kettle's skin (the neck's centre line, and rings round the body's base, belly and shoulder) that
  // draw() keeps above the dripper's rim, so the kettle never sinks through it
  const skin = neck.getPoints(16).map((p) => p.clone().setY(p.y - 0.5));
  for (const [r, y] of [[5.8, 0.8], [6, 5.5], [5.2, 8.6]]) for (let i = 0; i < 12; i++) skin.push(new THREE.Vector3(Math.cos(i * Math.PI / 6) * r, y, Math.sin(i * Math.PI / 6) * r));
  for (const p of skin) p.add(kb.position);

  // the dose: a cream bowl on the scale, beans piling up in it (one instanced bean, turned every which way), and
  // more beans in the air between the bag and the bowl
  const bowl = new THREE.Group();
  bowl.position.set(0, SCALE_TOP, -1.6);
  bowl.add(mesh(lathe([[0, 0], [3, 0], [4.3, 0.7], [4.9, 2.8], [4.6, 2.9], [4, 0.9], [0, 0.55]], 24), toon('#f1ebe0', { side: THREE.DoubleSide })));
  const beanGeo = new THREE.IcosahedronGeometry(1, 0); beanGeo.scale(0.4, 0.3, 0.6);
  const beanMat = toon('#5b331c');
  const beans = new THREE.InstancedMesh(beanGeo, beanMat, PILE);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < PILE; i++) {   // a mound: rings of beans, each layer smaller, the first in the bowl's floor
    const layer = Math.floor(i / 42), j = i % 42, rr = (3.5 - layer * 0.95) * Math.sqrt((j + 0.5) / 42), a = j * 2.39996 + layer;
    e.set(i * 1.7, i * 2.3, i * 0.9); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(Math.cos(a) * rr, 0.85 + layer * 0.45 + (1 - rr / 3.6) * 0.2, Math.sin(a) * rr), q, new THREE.Vector3(1, 1, 1));
    beans.setMatrixAt(i, m4);
  }
  beans.count = 0; beans.castShadow = true;
  bowl.add(beans);
  scene.add(bowl);
  const falling = new THREE.InstancedMesh(beanGeo, beanMat, FALLING);
  falling.count = 0; falling.frustumCulled = false;
  scene.add(falling);

  // the colourist's bag of beans: kraft paper, the top rolled open, a cream label with their palette on it; built with
  // its mouth at the group's origin, so it tips round the mouth (draw() turns it)
  const bag = new THREE.Group();
  const sack = mesh(new THREE.BoxGeometry(7, 11, 4.2), toon('#b48c5f')); sack.position.y = -5.9; bag.add(sack);
  const cuff = mesh(new THREE.BoxGeometry(7.5, 1.3, 4.7), toon('#c7a070')); cuff.position.y = -0.5; bag.add(cuff);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.6), flat('#2a1a10')); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.17; bag.add(mouth);
  const labelTex = canvasTex(32, 32, (x) => {
    x.fillStyle = '#f3ead6'; x.fillRect(0, 0, 32, 32);
    const wells = ['#e3c36b', '#e7a3b4', '#3f5daa', '#2f3448', '#9fc6e8', '#d9b48a', '#7fae6a', '#e5664a'];
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(16, 16, 11, 0, Math.PI * 2); x.fill();
    wells.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(16 + Math.cos(i * Math.PI / 4) * 7.5, 16 + Math.sin(i * Math.PI / 4) * 7.5, 2.3, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = '#3f5daa'; x.beginPath(); x.arc(16, 16, 3, 0, Math.PI * 2); x.fill();
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), toon('#ffffff', { map: labelTex }));
  label.position.set(0, -6.2, 2.12); bag.add(label);
  bag.position.set(2.6, SCALE_TOP + 9.5, -1.6);
  scene.add(bag);
  // the measuring spoon: a steel cup on a flat handle, built with the cup's middle at the origin, so it tips round the
  // beans it holds; it lies beside the scale till it's wanted (draw() moves it)
  const spoon = new THREE.Group();
  spoon.rotation.order = 'YXZ';   // turned on the counter, then tipped round its handle
  spoon.add(mesh(lathe([[0, -0.9], [1.1, -0.75], [1.6, -0.1], [1.7, 0.35], [1.5, 0.35], [1.4, -0.05], [1, -0.55], [0, -0.7]], 16), toon('#b4bac4', { side: THREE.DoubleSide })));
  const shaft = mesh(new THREE.BoxGeometry(6, 0.3, 0.9), toon('#b4bac4')); shaft.position.set(-4.5, 0.6, 0); shaft.rotation.z = -0.14; spoon.add(shaft);
  const spoonBeans = [];   // a scoop's worth (SCOOP g), shown while it's carried
  for (let i = 0; i < 6; i++) {
    const b = mesh(beanGeo, beanMat, false), a = i * 1.05;
    b.position.set(i < 5 ? Math.cos(a) * 0.7 : 0, i < 5 ? -0.25 : 0.15, i < 5 ? Math.sin(a) * 0.7 : 0);
    b.rotation.set(i * 1.3, i * 2.1, i * 0.7); spoon.add(b); spoonBeans.push(b);
  }
  scene.add(spoon);

  // the hand grinder: a wooden foot, a steel body, a cap, and the crank on top that turns round the body's axis
  const grinder = new THREE.Group();
  grinder.position.copy(GRIND);
  const gwood = toon('#8a5a3a'), gsteel = toon('#b4bac4');
  const gfoot = mesh(new THREE.CylinderGeometry(3.6, 3.8, 1.4, 20), gwood); gfoot.position.y = 0.7; grinder.add(gfoot);
  const gbody = mesh(new THREE.CylinderGeometry(3, 3.1, 8.6, 20), gsteel); gbody.position.y = 5.7; grinder.add(gbody);
  const gband = mesh(new THREE.CylinderGeometry(3.15, 3.15, 1.6, 20), gwood); gband.position.y = 4.4; grinder.add(gband);
  // the hopper's mouth, dark, under the lid; the lid (cap and crank) lifts off as one, round the cap's middle
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), flat('#1d140e')); hole.rotation.x = -Math.PI / 2; hole.position.y = 10.02; grinder.add(hole);
  const lid = new THREE.Group(); lid.position.y = 10.5; grinder.add(lid);
  const gcap = mesh(new THREE.CylinderGeometry(2.4, 3.2, 1, 20), gsteel); lid.add(gcap);
  const crank = new THREE.Group(); crank.position.y = CRANK_Y - 10.5; lid.add(crank);
  const hub = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 10), gsteel); crank.add(hub);
  const arm = mesh(new THREE.BoxGeometry(CRANK_R, 0.45, 1), gsteel); arm.position.set(CRANK_R / 2, 0.2, 0); crank.add(arm);
  const knobG = mesh(new THREE.CylinderGeometry(0.85, 0.75, 2.6, 10), gwood); knobG.position.set(CRANK_R, 1.5, 0); crank.add(knobG);
  // how far the grind has got: a track round the crank's reach, filling denim-blue
  const grindRing = new THREE.Mesh(new THREE.RingGeometry(CRANK_R + 1.4, CRANK_R + 1.9, 48), flat('#fffaf0', { transparent: true, opacity: 0.45, depthWrite: false }));
  grindRing.rotation.x = -Math.PI / 2; grindRing.position.y = CRANK_Y - 0.4; grinder.add(grindRing);
  const grindFill = new THREE.Mesh(new THREE.RingGeometry(CRANK_R + 1.3, CRANK_R + 2, 48, 1, 0, 0.001), flat('#8fb0ff', { side: THREE.DoubleSide }));
  grindFill.rotation.x = -Math.PI / 2; grindFill.position.y = CRANK_Y - 0.35; grinder.add(grindFill);
  scene.add(grinder);

  // at the back of the counter: a stack of takeaway cups in denim sleeves, a jar of beans, the awning's edge above
  const cups = new THREE.Group();
  for (let i = 0; i < 5; i++) { const c = mesh(new THREE.CylinderGeometry(4.2, 3.2, 3.2, 18, 1, true), toon('#f7f3ea', { side: THREE.DoubleSide })); c.position.y = 1.6 + i * 1.3; cups.add(c); }
  const sleeve = mesh(new THREE.CylinderGeometry(4.25, 3.9, 2.2, 18), toon('#3f5daa')); sleeve.position.y = 7.4; cups.add(sleeve);
  cups.position.set(-24, 0, -18); scene.add(cups);
  const jar = new THREE.Group();
  jar.add(mesh(new THREE.CylinderGeometry(3.6, 3.6, 8, 16), toon('#5b321b')));
  jar.children[0].position.y = 4;
  const jarLid = mesh(new THREE.CylinderGeometry(3.9, 3.9, 1.4, 16), toon('#8a5a3a')); jarLid.position.y = 8.7; jar.add(jarLid);
  jar.position.set(-9, 0, -24); scene.add(jar);
  const stripes = canvasTex(128, 32, (x) => {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? '#fbf3e2' : '#3f5daa';
      x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 16, 18); x.arc(i * 16 + 8, 18, 8, 0, Math.PI); x.closePath(); x.fill();
    }
  });
  stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(2.5, 1);
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(130, 16), toon('#ffffff', { map: stripes, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  scene.add(awning);   // placed by fit(): along the top of the view

  return { scene, sun, rig, bowl, beans, falling, bag, spoon, spoonBeans, lid, crank, grindRing, grindFill, server, coffee, coffeeMat, drip, bed, bedMat, pool, rings, ringMat, guide, halo, bubbles, dribble, stream, splash, kettle, skin, awning };
}

/** The café's pixel pass (renderer.js pixelKit, without the street's glitch): ink where depth steps, then tone map. */
function pixelPass(cam) {
  const depth = new THREE.DepthTexture(4, 4);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: depth }, texel: { value: new THREE.Vector2() }, ink: { value: new THREE.Color(INK) }, near: { value: cam.near }, far: { value: cam.far } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform vec3 ink; uniform float near; uniform float far;
      varying vec2 vUv;
      float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
      void main() {
        vec4 c = texture2D(tColor, vUv);
        float d = lin(texture2D(tDepth, vUv).x);
        float edge = 0.0;
        vec2 o[4];
        o[0] = vec2(texel.x, 0.0); o[1] = vec2(-texel.x, 0.0); o[2] = vec2(0.0, texel.y); o[3] = vec2(0.0, -texel.y);
        for (int i = 0; i < 4; i++) {
          float dn = lin(texture2D(tDepth, vUv + o[i]).x);
          if (dn - d > 0.012 * d + 0.12) edge = 1.0;
        }
        gl_FragColor = vec4(mix(c.rgb, ink, edge), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    size(w, hh) { rt.setSize(w, hh); depth.image.width = w; depth.image.height = hh; mat.uniforms.texel.value.set(1 / w, 1 / hh); },
    draw(gl, s) { gl.setRenderTarget(rt); gl.setClearColor(s.background, 1); gl.render(s, cam); gl.setRenderTarget(null); gl.render(scene, cam2); },
    dispose() { depth.dispose(); rt.dispose(); mat.dispose(); },
  };
}

/**
 * Open the 3D hand brew over the game. Resolves with { score, verdict, why } once the cup is handed over.
 * @param game  held (and not drawn) while the cup is made
 * @param opts  { guest: a name to make it for }
 */
export function openBrew3d(game, opts = {}) {
  const still = quiet();
  const canvas = h('canvas.b3-gl');
  const step = h('div.br-step'), say = h('div.br-say');
  const tip = h('div.b3-tip');
  const grams = h('b.b3-g', '0');
  const level = h('i.b3-level');
  const bar = h('div.b3-bar', level);
  const lcd = h('div.b3-lcd', h('div.b3-read', grams, h('small', 'g')), bar);
  let gaugeMax = 1;
  /** The gauge under the scale for this step: its bands ([lo, hi, tag], of max). */
  const gauge = (max, bands) => {
    gaugeMax = max;
    for (const b of bar.querySelectorAll('.b3-band')) b.remove();
    for (const [lo, hi, tag] of bands) bar.prepend(h('i.b3-band', { style: { left: lo / max * 100 + '%', width: (hi - lo) / max * 100 + '%' } }, h('span', tag)));
  };
  const scoop = h('button.btn', { onclick: () => scoopOut() }, t('Scoop a little out'));
  const doseDone = h('button.btn.primary', { disabled: true, onclick: () => toGrind() }, t('Into the grinder'));
  const root = h('div#brew3d.dose', canvas, h('div.br-head', step, say), lcd, tip, h('div.b3-btns', scoop, doseDone));
  document.body.appendChild(root);
  const held = game.hold, covered = game.covered;
  game.hold = true; game.covered = true;   // the café waits, and isn't drawn under us
  audio.unlock();

  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 0.82;
  const cam = new THREE.PerspectiveCamera(34, 1, 4, 260);
  const s = buildScene();
  const pass = pixelPass(cam);
  // where the camera looks at each step; it eases from one to the next
  const STATION = {
    dose: new THREE.Vector3(1.5, 6, -1.6),
    grind: new THREE.Vector3(GRIND.x, 8, GRIND.z + 0.5),
    brew: new THREE.Vector3(0, DRIP_Y + 1, -1.6),
  };
  const LOOK = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(57)), Math.cos(THREE.MathUtils.degToRad(57)));
  const LCD_AT = new THREE.Vector3(0, 2.2, 6);   // the scale's window (buildScene)
  const camAt = STATION.dose.clone();
  let station = STATION.dose, camDist = 80, vt = 1, ht = 1;
  /** Size the drawing to the screen at the café's pixel size, and back the camera off until the work fits. */
  const fit = () => {
    const w = innerWidth, hh = innerHeight;
    gl.setPixelRatio(1 / PX); gl.setSize(w, hh, false);
    canvas.style.width = w + 'px'; canvas.style.height = hh + 'px';
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    pass.size(size.x, size.y);
    cam.aspect = w / hh;
    vt = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); ht = vt * cam.aspect;
    camDist = Math.max(12 / ht, 17 / vt);   // the dripper big enough to trace round with a thumb (the kettle may run off the side)
    cam.updateProjectionMatrix();
    aimCam();
  };
  /** The camera at camAt, the awning's edge across the top of its view (30 cm from the eye, as wide as the view). */
  const aimCam = () => {
    cam.position.copy(camAt).addScaledVector(LOOK, camDist);
    cam.lookAt(camAt);
    cam.updateMatrixWorld();
    const D = 30, halfH = D * vt, halfW = D * ht;
    s.awning.quaternion.copy(cam.quaternion);
    s.awning.position.copy(cam.position).add(new THREE.Vector3(0, halfH - halfW * 0.1, -D).applyQuaternion(cam.quaternion));
    s.awning.scale.set(halfW * 2.2 / 130, halfW * 0.24 / 16, 1);
    const p = LCD_AT.clone().project(cam);
    lcd.style.left = (p.x + 1) / 2 * innerWidth + 'px';
    lcd.style.top = (1 - p.y) / 2 * innerHeight + 'px';
  };
  addEventListener('resize', fit);

  const r = { dose: DOSE, bloom: 0, wait: 0, water: 0, inRing: 1, spilled: false };
  let phase = 'dose', water = 0, standing = 0, finger = null, pouring = false, last = performance.now();
  let bloomAt = 0, ringT = 0, pourT = 0, sfxT = 0, gAng = -Math.PI / 2, swell = 0, served = 0, tilt = 0, near = false, time = 0;
  let tipping = false, tipT = 0, poured = 0, dose = 0, beanT = 0, bagTilt = 0;              // the dose
  let scoopK = -1, scoopsLeft = 0, spoonN = 0, spoonKeys = null;                             // the spoon
  let loadT = -1, loadLeft = 0, loadBeanT = 0;                                               // into the grinder
  let turned = 0, lastAng = null, crankAng = 0, rigGo = -1;                                  // the grind, then the move
  const flying = [];   // beans in the air: { t, x, z } (t from 0 at the bag's mouth to 1 in the bowl), or { t, dur, from, to }
  const aim = new THREE.Vector3(5, 0, -1.6 + 6);   // where the spout is over (x, z); y is the water's
  const show = (n, text) => { step.textContent = n; say.textContent = text; };
  show(t('1 / 4  Beans'), t('Hold to tip the bag onto the scale, {g} g. Let go a little early: the last beans are still falling.', { g: DOSE }));
  gauge(22, [[DOSE - DOSE_OK, DOSE + DOSE_OK, DOSE + ' g']]);
  s.rig.position.copy(PARK);
  s.kettle.visible = false;

  // ---------------- 1. dose (as brew.js: the bag tips faster the longer it's held; what leaves it lands LAG later)
  const doseFrame = (dt) => {
    if (phase !== 'dose') return;
    if (tipping) {
      tipT += dt;
      const rate = BEAN_RATE[0] + (BEAN_RATE[1] - BEAN_RATE[0]) * clamp(tipT / TIP_RAMP, 0, 1);
      const out = Math.min(rate * dt * (0.8 + 0.4 * Math.random()), BOWL_MAX - poured);   // in clumps, till the bowl is full
      poured += out;
      if ((beanT += out) > 0.3 && flying.length < FALLING) { beanT = 0; flying.push({ t: 0, x: (Math.random() - 0.5) * 2.4, z: (Math.random() - 0.5) * 2.4, spin: Math.random() * 6 }); }
      if ((sfxT += dt) > 0.09) { sfxT = 0; hiss(0.04, { vol: 0.05, freq: 3200, q: 3 }); }
    }
    if (poured - dose < 0.01) dose = poured;
    else dose += (poured - dose) * (1 - Math.exp(-dt / LAG));   // at full tilt about 1.5 g is still in the air
    doseDone.disabled = dose < 3;
  };
  const startTip = () => { if (scoopK < 0) { tipping = true; tipT = 0; } };   // not while the spoon is over the bowl
  const stopTip = () => { if (!tipping) return; tick(performance.now()); tipping = false; };
  /** The spoon digs SCOOP g out of the bowl (drawWork moves it); taps while it's busy wait their turn. */
  function scoopOut() {
    if (phase !== 'dose') return;
    if (scoopK < 0) { if (poured <= 0) return; scoopK = 0; spoonKeys = null; stopTip(); }
    else if (scoopsLeft < 3) scoopsLeft++;
  }
  function toGrind() {
    if (phase !== 'dose') return;
    const owed = (scoopK >= 0 && scoopK < TAKE ? 1 : 0) + scoopsLeft;   // a scoop already asked for still comes out
    poured = Math.max(0, poured - owed * SCOOP);
    scoopK = -1; scoopsLeft = 0; spoonN = 0;
    tipping = false; flying.length = 0;
    dose = poured; r.dose = Math.round(dose * 10) / 10;
    phase = 'load'; loadT = 0; loadLeft = dose; station = STATION.grind;   // the lid off, the beans in, the lid on
    root.classList.remove('dose'); root.classList.add('grind');
    audio.play('pop');
    show(t('2 / 4  Grind'), t('Lid off, beans in, lid back on.'));
  }

  // ---------------- 2. grind: the crank follows the finger round the grinder's axis; three turns grind the dose
  const grindAt = (e) => {
    const p = onPlane(e, GRIND.y + CRANK_Y);
    if (!p) return;
    const ang = Math.atan2(p.z - GRIND.z, p.x - GRIND.x);
    if (lastAng != null) {
      const d = Math.atan2(Math.sin(ang - lastAng), Math.cos(ang - lastAng));
      turned += Math.abs(d);
      if ((sfxT += Math.abs(d)) > 0.5) { sfxT = 0; hiss(0.05, { vol: 0.08, freq: 2400, q: 2 }); }
    }
    lastAng = ang; crankAng = ang;
    const k = clamp(turned / (TURNS * 2 * Math.PI), 0, 1);
    s.grindFill.geometry.dispose();
    s.grindFill.geometry = new THREE.RingGeometry(CRANK_R + 1.3, CRANK_R + 2, 48, 1, Math.PI / 2, -Math.max(0.001, k * Math.PI * 2));
    if (k >= 1) toBrew();
  };
  function toBrew() {
    phase = 'move'; lastAng = null; finger = null;
    station = STATION.brew; rigGo = 0;   // the dripper, its paper now holding the grounds, slides onto the scale
    root.classList.remove('grind');
    audio.play('pop');
  }
  const arrived = () => {   // the dripper is on the scale: the bloom
    phase = 'bloom';
    s.kettle.visible = true;
    root.classList.add('brew');
    gauge(1.12, [[...BLOOM, t('Bloom')], [...FULL, t('Full')]]);
    show(t('3 / 4  Bloom'), t('Hold to pour a little, up to Bloom under the scale, then let go.'));
  };

  // ---------------- the finger, on a level plane (the water's surface, the crank's height)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const surfaceY = () => DRIP_Y + BED_Y + (RIM_Y - BED_Y) * clamp(standing / HOLDS, 0, 1.04);
  /** Where the finger is on the plane at height y (a touch reaches a little above itself), or null. */
  function onPlane(e, y) {
    const lift = e.pointerType === 'touch' ? LIFT : 0;
    ndc.set(e.clientX / innerWidth * 2 - 1, -((e.clientY - lift) / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    plane.constant = -y;
    return ray.ray.intersectPlane(plane, hit);
  }
  /** Where the finger is over the dripper, relative to its middle; the spout stays over it, give or take. */
  const at = (e) => {
    if (!onPlane(e, surfaceY())) return null;
    const dx = hit.x - s.drip.position.x, dz = hit.z - s.drip.position.z, d = Math.hypot(dx, dz), cap = BED_R * 1.7;
    const k = d > cap ? cap / d : 1;
    return { x: dx * k, z: dz * k };
  };
  let pressed = false;
  const onDown = (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* gone */ }
    pressed = true;
    if (phase === 'dose') startTip();
    else if (phase === 'grind') { lastAng = null; grindAt(e); }
    else { finger = at(e) || finger; startPour(); }
  };
  const onMove = (e) => {
    if (phase === 'grind') { if (pressed) grindAt(e); return; }
    if (phase === 'dose' || phase === 'load' || phase === 'move') return;
    if (!finger && e.pointerType !== 'mouse') return;
    const p = at(e); if (p) finger = p;
  };
  const onUp = () => { pressed = false; stopTip(); lastAng = null; stopPour(); finger = null; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---------------- bloom and pour (as brew.js, with the water standing in the cone and draining into the server)
  const startPour = () => {
    if (phase !== 'bloom' && phase !== 'settle' && phase !== 'pour') return;
    tick(performance.now());
    pouring = true;
  };
  const stopPour = () => {
    if (!pouring) return;
    tick(performance.now());
    pouring = false;
    if (phase === 'bloom' && water > 0.02) {
      r.bloom = water;
      phase = 'settle';
      bloomAt = performance.now();
      show(t('3 / 4  Bloom'), t('The grounds swell and bubble. Wait till the bubbles settle, then pour again.'));
      setTimeout(() => {
        if (phase !== 'settle' && phase !== 'pour') return;
        s.guide.visible = true;   // the dot comes up: where to start the main pour
        if (phase === 'settle') show(t('3 / 4  Bloom'), t('The bubbles have settled. Put the stream on the glowing dot and pour again.'));
      }, SETTLE[0] * 1000);
    } else if (phase === 'pour' && water >= FULL[0] * 0.5) finish();
  };
  const step3d = (dt) => {
    time += dt;
    if (pouring && (phase === 'bloom' || phase === 'settle' || phase === 'pour')) {
      if (phase === 'settle') {   // pouring again: the bloom is over, however long it had
        r.wait = (performance.now() - bloomAt) / 1000;
        phase = 'pour';
        s.guide.visible = true;
        show(t('4 / 4  Pour'), t('Keep the stream on the dot as it circles. Let go at Full.'));
      }
      water += dt / FILL_S; standing += dt / FILL_S;
      if (phase === 'pour' && finger) {
        gAng += (dt * 2 * Math.PI) / LAP;
        const gx = Math.cos(gAng) * GUIDE * BED_R, gz = Math.sin(gAng) * GUIDE * BED_R;
        near = Math.hypot(finger.x - gx, finger.z - gz) / BED_R <= NEAR;
        const d = Math.hypot(finger.x, finger.z) / BED_R;
        pourT += dt; if (near) ringT += dt;
        tip.textContent = near ? '' : d < RING[0] ? t('Too close to the middle') : d > RING[1] ? t('That is the paper') : t('Follow the dot');
        // the coffee coming through takes its colour from how well the stream keeps to the dot
        s.coffeeMat.color.copy(GREY).lerp(COFFEE, clamp(ringT / Math.max(pourT, 0.5), 0, 1));
      }
      if ((sfxT += dt) > 0.12) { sfxT = 0; hiss(0.16, { vol: 0.05, freq: 700, q: 0.6, type: 'lowpass' }); }
      if (water >= SPILL) { r.spilled = true; finish(); }
    }
    // the cone drains into the server
    const out = Math.min(standing, standing * DRAIN * dt * (phase === 'done' ? 3 : 1));
    standing -= out; served += out;
    // the bloom swells the grounds, then they settle
    const blooming = phase === 'settle' && (performance.now() - bloomAt) / 1000 < SETTLE[0];
    swell += ((blooming ? 1 : 0) - swell) * Math.min(1, dt * 3);
  };

  // ---------------- drawing
  const tipAt = new THREE.Vector3(), tmpP = new THREE.Vector3(), mouthAt = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const BOWL_AT = new THREE.Vector3(0, SCALE_TOP, -1.6), toP = new THREE.Vector3();
  const POUR_AT = new THREE.Vector3(GRIND.x, GRIND.y + 15.4, GRIND.z - 4.4);   // the bowl's middle while it's tipped over the hopper, behind it
  const HOLE = new THREE.Vector3(GRIND.x, GRIND.y + 10, GRIND.z), BOWL_DOWN = new THREE.Vector3(12.5, 0, -12);
  const SPOON_REST = new THREE.Vector3(10.5, 0.95, 4.5);                      // beside the scale
  const ease = (k) => k * k * (3 - 2 * k), seg = (u, a, b) => ease(clamp((u - a) / (b - a), 0, 1));
  // the spoon's handle points to the front and right on the counter and in the bowl, to the front and left (clear of the
  // bag) over the bag's mouth, where it tips toward the bag
  const Y0 = 2.2, Y1 = 0.64;
  /** A scoop's path, [k, where, roll round the handle, pitch, turn]: over the bowl, into the pile, up, over the bag's mouth and tipped, back. */
  const scoopPath = () => {
    const top = BOWL_AT.y + 0.9 + Math.min(1.6, s.beans.count / PILE * 1.8);
    const v = (x, y, z) => new THREE.Vector3(BOWL_AT.x + x, y, BOWL_AT.z + z);
    const over = mouthAt.clone().add(new THREE.Vector3(-2.4, 2.6, 0.4));
    return [[0, SPOON_REST, 0, 0.2, Y0], [0.2, v(0.8, top + 3.2, 1), -0.2, -0.2, Y0], [0.36, v(0.6, top - 0.3, 0.2), -0.5, -0.45, Y0],
      [0.5, v(0.4, BOWL_AT.y + 7.5, 1.4), 0, -0.1, 1.4], [0.68, over, 0, -0.1, Y1], [0.78, over, 1.9, -0.1, Y1], [0.86, over, 1.9, -0.1, Y1], [1, SPOON_REST, 0, 0.2, Y0]];
  };
  let lift = 0;
  /** The dose and the grind: the camera, the bag and the beans, the bowl on its way to the grinder, the crank, the dripper's move. */
  const drawWork = (dt) => {
    camAt.lerp(station, Math.min(1, dt * 3));
    aimCam();
    // the bag lies on its side over the bowl and tips mouth-down while held
    bagTilt += ((tipping ? 1 : 0) - bagTilt) * Math.min(1, dt * 8);
    s.bag.rotation.z = 1.05 + 0.95 * bagTilt;
    s.bag.visible = phase === 'dose';
    mouthAt.set(-Math.sin(s.bag.rotation.z), Math.cos(s.bag.rotation.z), 0).multiplyScalar(0.8).add(s.bag.position);
    // the beans in the bowl
    s.beans.count = Math.min(PILE, Math.round((phase === 'dose' ? dose : loadLeft) / BEAN_G));
    const pileTop = BOWL_AT.y + 0.9 + Math.min(1.6, s.beans.count / PILE * 1.8);
    // the spoon: a scoop takes its beans out of the pile at TAKE and tips them into the bag at SPILL_K
    if (scoopK >= 0) {
      spoonKeys = spoonKeys || scoopPath();
      const k0 = scoopK; scoopK = Math.min(1, scoopK + dt / SCOOP_S);
      if (k0 < TAKE && scoopK >= TAKE) {
        const g = Math.min(SCOOP, poured);
        poured -= g; dose = Math.min(dose, poured);
        spoonN = Math.round(g / BEAN_G);
        hiss(0.12, { vol: 0.06, freq: 1800, q: 1.5 });
      }
      if (k0 < SPILL_K && scoopK >= SPILL_K) {
        for (let i = 0; i < spoonN; i++) flying.push({ t: -i * 0.06, dur: 0.3, from: s.spoon.position.clone(), to: mouthAt.clone().add(new THREE.Vector3(0.2, -0.3, (Math.random() - 0.5) * 2)), spin: Math.random() * 6 });
        spoonN = 0;
        hiss(0.1, { vol: 0.05, freq: 3000, q: 3 });
      }
      if (scoopK >= 1) { scoopK = -1; if (scoopsLeft > 0 && poured > 0) { scoopsLeft--; scoopK = 0; spoonKeys = scoopPath(); } else scoopsLeft = 0; }
    }
    const path = scoopK >= 0 ? spoonKeys : [[0, SPOON_REST, 0, 0.2, Y0], [1, SPOON_REST, 0, 0.2, Y0]];
    const kk = Math.max(0, scoopK);
    let j = 0; while (j < path.length - 2 && kk >= path[j + 1][0]) j++;
    const [ka, pa, ra, ta, ya] = path[j], [kb, pb, rb, tb, yb] = path[j + 1], w = ease(clamp((kk - ka) / (kb - ka), 0, 1));
    s.spoon.position.lerpVectors(pa, pb, w);
    s.spoon.rotation.set(ra + (rb - ra) * w, ya + (yb - ya) * w, ta + (tb - ta) * w);
    s.spoonBeans.forEach((b, i) => { b.visible = i < spoonN; });
    // into the grinder: the lid comes off and is held up to one side; the bowl goes over the open hopper and is tipped
    // till it's empty, then set down on the counter; the lid goes back on
    if (loadT >= 0) {
      const u0 = loadT, u = (loadT += dt);
      const off = seg(u, 0, 0.6) - seg(u, 2.2, 2.75);
      s.lid.position.set(5.5 * off, 10.5 + 6 * off, 2 * off); s.lid.rotation.set(0.3 * off, 0, -0.5 * off);   // its side and crank to the camera
      const there = seg(u, 0, 1), away = seg(u, 2, 2.7);
      if (away > 0) { s.bowl.position.lerpVectors(POUR_AT, BOWL_DOWN, away); s.bowl.position.y += Math.sin(away * Math.PI) * 4; }
      else { s.bowl.position.lerpVectors(BOWL_AT, POUR_AT, there); s.bowl.position.y += Math.sin(there * Math.PI) * 5; }
      s.bowl.rotation.x = 1.2 * (seg(u, 0.95, 1.15) - seg(u, 1.95, 2.2));   // tipped toward the camera: the beans slide out of it
      if (u > 1.1 && loadLeft > 0) {
        const out = Math.min(loadLeft, dose * dt / 0.8); loadLeft -= out;
        if ((loadBeanT += out) > BEAN_G * 2.5 && flying.length < FALLING) {
          loadBeanT = 0; s.bowl.updateMatrixWorld();
          flying.push({ t: 0, dur: 0.28, from: s.bowl.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.4, 4.4)),
            to: HOLE.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.6, 0, (Math.random() - 0.5) * 2.6)), spin: Math.random() * 6 });
        }
        if ((sfxT += dt) > 0.07) { sfxT = 0; hiss(0.04, { vol: 0.06, freq: 2600, q: 3 }); }
      }
      if (u0 < 2.75 && u >= 2.75) hiss(0.1, { vol: 0.14, freq: 380, q: 1.2 });   // the lid clunks back on
      if (u >= 2.95) { loadT = -1; phase = 'grind'; show(t('2 / 4  Grind'), t('Draw circles round the grinder to turn it.')); }
    }
    // the beans in the air: from the bag's mouth onto the pile, or along their own path (off the spoon, out of the bowl)
    for (let i = flying.length - 1; i >= 0; i--) if ((flying[i].t += dt / (flying[i].dur || LAG * 2)) >= 1) flying.splice(i, 1);
    let n = 0;
    for (const f of flying) {
      if (f.t < 0 || n >= FALLING) continue;   // not off the spoon yet
      const k = f.t, a = f.from || mouthAt, b = f.to || toP.set(BOWL_AT.x + f.x, pileTop, BOWL_AT.z + f.z);
      e3.set(f.spin * k, f.spin * 0.7 * k, f.spin * 1.3 * k); q.setFromEuler(e3);
      tmpP.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k * k, a.z + (b.z - a.z) * k);
      s.falling.setMatrixAt(n++, m4.compose(tmpP, q, one));
    }
    s.falling.count = n; s.falling.instanceMatrix.needsUpdate = true;
    s.crank.rotation.y = -crankAng;
    s.grindRing.visible = s.grindFill.visible = phase === 'grind';
    // the dripper and its server slide off the counter onto the scale
    if (rigGo >= 0) {
      rigGo = Math.min(1, rigGo + dt / 0.9);
      const k = rigGo * rigGo * (3 - 2 * rigGo);
      s.rig.position.copy(PARK).multiplyScalar(1 - k); s.rig.position.y += Math.sin(k * Math.PI) * 5;
      if (rigGo >= 1) { rigGo = -1; s.rig.position.set(0, 0, 0); arrived(); }
    }
  };
  const draw = (dt) => {
    drawWork(dt);
    const sy = surfaceY();
    // the kettle eases over the finger (or waits up and to the right), tips while pouring
    const want = finger ? { x: finger.x, z: finger.z } : { x: BED_R * 1.6, z: BED_R * 1.1 };
    aim.x += (want.x - aim.x) * Math.min(1, dt * 18); aim.z += (want.z - aim.z) * Math.min(1, dt * 18);
    tilt += ((pouring ? 1 : 0) - tilt) * Math.min(1, dt * 10);
    tipAt.set(s.drip.position.x + aim.x, sy + STREAM + (1 - tilt) * 3, s.drip.position.z + aim.z);
    s.kettle.position.copy(tipAt);
    s.kettle.rotation.z = -0.32 * tilt;   // tipped, round its own spout
    // lift the whole kettle (the stream grows longer) until no point of its skin is inside the rim and below its top;
    // up at once, down slowly, so it doesn't bob as the spout circles
    s.kettle.updateMatrixWorld(true);
    let need = 0;
    for (const p of s.skin) {
      tmpP.copy(p).applyMatrix4(s.kettle.matrixWorld);
      if (Math.hypot(tmpP.x - s.drip.position.x, tmpP.z - s.drip.position.z) < RIM_CLEAR) need = Math.max(need, DRIP_Y + RIM_TOP - tmpP.y);
    }
    lift = need > lift ? need : lift + (need - lift) * Math.min(1, dt * 2);
    s.kettle.position.y += lift; tipAt.y += lift;
    // the stream from the spout to the water, a splash where it lands
    s.stream.visible = s.splash.visible = pouring;
    if (pouring) {
      s.stream.position.copy(tipAt); s.stream.scale.set(1, tipAt.y - sy, 1);
      s.stream.position.x += Math.sin(time * 23) * 0.05;
      s.splash.position.set(tipAt.x, sy + 0.05, tipAt.z);
      const k = (time * 3) % 1; s.splash.scale.setScalar(0.6 + k * 1.2); s.splash.material.opacity = 0.9 * (1 - k);
    }
    // the water standing in the cone, the grounds (swollen in the bloom), the ring and the dot on top
    const wy = sy - DRIP_Y;
    s.pool.visible = standing > 0.004;
    s.pool.position.y = wy + 0.02; s.pool.scale.setScalar(coneR(wy) - 0.05);
    s.bed.position.y = swell * 0.7; s.bedMat.color.set(swell > 0.05 ? '#5b3a22' : '#3b2416');
    s.bubbles.visible = swell > 0.2; s.bubbles.position.y = swell * 0.7;
    s.rings.visible = phase === 'pour' || s.guide.visible;
    s.rings.position.y = Math.max(wy, BED_Y + 0.6) + 0.04;
    s.ringMat.color.set(phase === 'pour' && pouring ? (near ? '#8fb0ff' : '#e5664a') : '#ffffff');
    const gx = Math.cos(gAng) * GUIDE * BED_R, gz = Math.sin(gAng) * GUIDE * BED_R;
    s.guide.position.set(gx, s.rings.position.y + 0.3, gz);
    s.halo.scale.setScalar(1 + 0.25 * Math.sin(time * 6));
    // the coffee rising in the server, and the thread of it from the dripper's foot while the cone drains
    const lvl = clamp(served, 0, 1.1) * SERVER_FULL / 8.8;
    s.coffee.scale.y = Math.max(0.001, lvl);
    s.dribble.visible = standing > 0.01;
    s.dribble.scale.y = Math.max(0.1, DRIP_Y - 0.9 - (SCALE_TOP + 0.15 + lvl * 8.8));
    // the scale's LCD (HTML over the 3D, so it stays sharp), the gauge's bands on it
    const amount = phase === 'dose' ? dose : water;
    grams.textContent = phase === 'dose' ? dose.toFixed(1) : Math.round(water * CUP_G);
    grams.classList.toggle('ok', phase === 'dose' && Math.abs(dose - DOSE) <= DOSE_OK);
    level.style.width = Math.min(amount, gaugeMax) / gaugeMax * 100 + '%';
    root.classList.toggle('pouring', pouring);
    root.classList.toggle('near', near && pouring && phase === 'pour');
    pass.draw(gl, s.scene);
  };

  // for tests (synthetic pointers): where the dot and the bed's middle are on screen, in css px
  const onScreen = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  root.probe = () => ({ phase, water, dose, turned, scoopK, loadT, dot: onScreen(s.guide.getWorldPosition(new THREE.Vector3())), bed: onScreen(new THREE.Vector3(0, DRIP_Y + BED_Y, -1.6)),
    crank: onScreen(new THREE.Vector3(GRIND.x, GRIND.y + CRANK_Y, GRIND.z)), crankR: onScreen(new THREE.Vector3(GRIND.x + CRANK_R, GRIND.y + CRANK_Y, GRIND.z)) });

  let raf = 0;
  function tick(now) { const dt = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now; doseFrame(dt); step3d(dt); return dt; }
  const loop = () => { const dt = tick(performance.now()); draw(dt); raf = requestAnimationFrame(loop); };
  fit();
  raf = requestAnimationFrame(loop);

  // ---------------- the cup
  let resolve;
  const result = new Promise((res) => { resolve = res; });
  function finish() {
    if (phase === 'done') return;
    phase = 'done'; pouring = false; finger = null;
    r.water = water;
    r.inRing = pourT ? ringT / pourT : 0;
    if (!r.wait) r.wait = (performance.now() - bloomAt) / 1000;
    const res = scoreBrew(r);
    s.guide.visible = false; tip.textContent = '';
    s.coffeeMat.color.copy(GREY).lerp(COFFEE, res.score / 100);
    setTimeout(() => serve(res), still ? 0 : 1600);   // the last of the water runs through first
  }
  function serve(res) {
    audio.play(res.score >= 80 ? 'levelup' : 'serve');
    const card = h('div.br-result',
      h('div.br-cup', h('i.br-cup-glow', { style: { opacity: res.score / 100 } }), h('i.br-cup-img')),
      h('div.br-score', h('b', res.score), h('span', t('% colour back'))),
      h('div.br-verdict', verdictLine(res.why, r.dose)),
      h('button.btn.primary', { onclick: () => close(res) }, opts.guest ? t('Hand it to {name}', { name: opts.guest }) : t('Serve')));
    root.appendChild(card);
    root.classList.add('served');
  }
  function close(res) {
    cancelAnimationFrame(raf);
    removeEventListener('resize', fit);
    game.hold = held; game.covered = covered;
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 300, fill: 'forwards' });
    a.finished.catch(() => {}).then(() => {
      root.remove();
      pass.dispose();
      s.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
      gl.dispose(); gl.forceContextLoss();
    });
    resolve({ score: res.score, verdict: res.verdict, why: res.why });
  }
  return result;
}
