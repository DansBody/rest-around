// The 3D stages for the Training tab's mini-games (ui/training.js runs the rules and draws the score on
// top). Each stage has its own small WebGL renderer on the card's canvas and the staff member's real
// character model:
//   BattingStage — a little ballpark seen from behind the catcher: a pitcher on the mound, the staff
//                  member at the plate with a bat, the pitch, the swing and where the ball goes.
//   SprintStage  — a running track seen from behind the runner, the camera following them to the line.
// Only meshes made here are disposed; character models share the model cache's geometry.
import { THREE } from './models.js';
import { assets } from './assets.js';
import { CharacterView, makeBat } from './charview.js';
import { randomLook } from './looks.js';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const easeOut = (k) => 1 - (1 - k) * (1 - k);

export class Stage {
  constructor(canvas, sky) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 30, 70);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8fb57f, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    this.made = [];   // geometries and materials made here (disposed with the stage)
    this.chars = [];
  }
  /** A mesh whose geometry and material belong to this stage. */
  mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    this.made.push(geo, mat);
    this.scene.add(m);
    return m;
  }
  /** A flat patch on the ground. */
  ground(w, d, color, x = 0, z = 0, y = 0) {
    const m = this.mesh(new THREE.PlaneGeometry(w, d), lam(color), x, y, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  character(look, x, z, yaw) {
    const cv = new CharacterView(this.scene, { look, x: 0, y: 0, dir: 1, pose: {} });
    cv.root.position.set(x, 0, z);
    cv.root.rotation.y = yaw;
    cv.play('idle', 0);
    this.chars.push(cv);
    return cv;
  }
  render() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w && h && (w !== this.w || h !== this.h)) { this.w = w; this.h = h; this.gl.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    this.gl.render(this.scene, this.cam);
  }
  dispose() {
    for (const cv of this.chars) cv.dispose(this.scene);
    for (const x of this.made) x.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}

// ------------------------------------------------------------------ batting
const PITCHER_Z = -11;
const STRIKE = new THREE.Vector3(0.05, 0.95, 0);       // where the pitch crosses the plate (the ring)
const RELEASE = new THREE.Vector3(0.15, 1.45, PITCHER_Z + 0.6);
const SWING = 0.4;                                      // seconds of the swing

export class BattingStage extends Stage {
  constructor(canvas, look) {
    super(canvas, '#bfe3f2');
    // the field: outfield grass with mowing stripes, the infield dirt, the mound, the plate, the fence
    this.ground(80, 80, '#79c070', 0, -20, -0.01);
    for (let i = -6; i < 6; i++) this.ground(80, 2.5, '#86ca7c', 0, i * 5 - 20, 0);
    this.mesh(new THREE.CircleGeometry(3.4, 40), lam('#d9a066'), 0, 0.01, 0.4).rotation.x = -Math.PI / 2;
    this.mesh(new THREE.CircleGeometry(1.6, 32), lam('#c98b4f'), 0, 0.012, PITCHER_Z).rotation.x = -Math.PI / 2;
    const plate = new THREE.Shape([[-0.22, -0.11], [0.22, -0.11], [0.22, 0.05], [0, 0.2], [-0.22, 0.05]].map(([x, y]) => new THREE.Vector2(x, y)));
    this.mesh(new THREE.ShapeGeometry(plate), lam('#ffffff'), 0, 0.02, 0.15).rotation.x = -Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(70, 1.6, 0.4), lam('#2f7a4a'), 0, 0.8, -32);
    this.mesh(new THREE.BoxGeometry(70, 0.15, 0.5), lam('#f5d36b'), 0, 1.65, -32);
    // the batter (the staff member, bat on the shoulder, side-on to the plate) and the pitcher (a guest)
    this.batter = this.character(look, -0.95, 0.15, Math.PI / 2);
    this.batterYaw = Math.PI / 2;
    // the bat swings from the grip out in front: held up at rest, out level through the ball in the swing
    this.bat = new THREE.Group();
    const bat = makeBat();
    bat.traverse((o) => { if (o.isMesh) this.made.push(o.geometry, o.material); });
    this.bat.add(bat);
    this.bat.position.set(...this.batter.batGrip());   // in the hands out front, clear of the body
    this.bat.scale.setScalar(1.5);   // a big cartoon bat reads at this size
    this.batter.root.add(this.bat);
    this.batPose(0);
    const pl = randomLook(); pl.shirt = '#4f6f9a';
    this.pitcher = this.character(pl, 0, PITCHER_Z, 0);
    // the hit circle, the ball and its shadow
    this.ring = this.mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), STRIKE.x, STRIKE.y, STRIKE.z);
    this.ball = this.mesh(new THREE.SphereGeometry(0.15, 16, 12), lam('#ffffff', { emissive: '#555555' }));
    this.shadow = this.mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.ball.visible = this.shadow.visible = false;
    this.cam.position.set(1.9, 2.4, 5.6);
    this.cam.lookAt(-1.0, 0.9, -4);
    this.swingT = -1; this.fly = null;
  }
  /** The bat's angle: `through` 0 = up on the shoulder, 1 = held out level in front; `wind` cocks it back first. */
  batPose(through, wind = 0) {
    this.bat.rotation.set(-0.2 - 0.25 * wind * (1 - through) + 1.77 * through, 0, 0.3 * (1 - through));
  }
  /** The pitcher winds up (arms up) for the next pitch. */
  windup() { this.pitcher.play('cheer', 0.15); }
  /** The ball is on its way: `u` 0 at release, 1 at the circle (and on past it if nobody swings). */
  pitch(u) {
    if (u === 0) this.pitcher.play('idle', 0.2);
    const p = RELEASE.clone().lerp(STRIKE, u);
    p.y += Math.sin(Math.min(1, u) * Math.PI) * 0.45;
    if (u > 1) p.y = STRIKE.y - (u - 1) * 1.2;
    this.ball.position.copy(p);
    this.ball.visible = true; this.fly = null;
  }
  /** The ball is gone (missed, or the next pitch). */
  clearBall() { this.ball.visible = false; this.fly = null; }
  swing() { this.swingT = 0; }
  /** Hit: `perfect` sends it high over the fence, a good hit drives it into the outfield. */
  hit(perfect) {
    const side = (Math.random() - 0.5) * (perfect ? 3 : 12);
    this.fly = { v: new THREE.Vector3(side, perfect ? 10 : 5.5, perfect ? -26 : -15) };
  }
  cheer() { this.batter.play('cheer', 0.15); }
  /** `near`: the pitch is in the hitting window (the ring lights up). */
  update(dt, near) {
    if (this.swingT >= 0) {
      this.swingT += dt;
      const k = Math.min(1, this.swingT / SWING);
      // a short wind-back, then the whole body whips round through the ball and follows through
      const wind = k < 0.3 ? k / 0.3 : 1, through = k < 0.3 ? 0 : easeOut(Math.min(1, (k - 0.3) / 0.35));
      this.batter.root.rotation.y = this.batterYaw - 0.6 * wind + 2.1 * through;   // hips turn toward the mound
      this.batPose(through, wind);
      if (this.swingT > SWING + 0.45) { this.swingT = -1; this.batter.root.rotation.y = this.batterYaw; this.batPose(0); }
    }
    if (this.fly && this.ball.visible) {
      this.fly.v.y -= 9.8 * dt;
      this.ball.position.addScaledVector(this.fly.v, dt);
      if (this.ball.position.y < 0.1) { this.ball.position.y = 0.1; this.fly.v.multiplyScalar(0.5); this.fly.v.y = Math.abs(this.fly.v.y); }
    }
    this.shadow.visible = this.ball.visible;
    if (this.ball.visible) this.shadow.position.set(this.ball.position.x, 0.03, this.ball.position.z);
    this.ring.material.color.set(near ? '#ffd23f' : '#ffffff');
    this.ring.scale.setScalar(near ? 1.15 : 1);
    for (const cv of this.chars) if (cv.inst.mixer) cv.inst.mixer.update(dt);
    this.render();
  }
}

// ------------------------------------------------------------------ sprint
export const TRACK = 36;   // metres (world units) from the start line to the finish

export class SprintStage extends Stage {
  constructor(canvas, look) {
    super(canvas, '#bfe3f2');
    const L = TRACK, mid = -L / 2;
    // grass, the red track with its lanes, the start and finish lines
    this.ground(60, L + 50, '#7cc47a', 0, mid, -0.01);
    this.ground(4.2, L + 30, '#d9735b', 0, mid, 0);
    for (const x of [-2.1, -0.7, 0.7, 2.1]) this.ground(0.06, L + 30, '#fff4ee', x, mid, 0.005);
    this.ground(4.2, 0.12, '#ffffff', 0, 0, 0.006);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
    const g = cv.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1d1d1f' : '#ffffff'; g.fillRect(i * 4, j * 4, 4, 4); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    this.made.push(tex);
    this.ground(4.2, 0.5, '#ffffff', 0, -L, 0.007).material.map = tex;
    // the finish arch: two posts and a banner
    for (const x of [-2.4, 2.4]) this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), lam('#ffffff'), x, 1.4, -L);
    this.mesh(new THREE.BoxGeometry(5, 0.55, 0.08), lam('#2f9bff'), 0, 2.6, -L);
    // distance markers and a few trees along the sides, so speed reads
    for (let z = -2; z > -L - 12; z -= 3) {
      this.mesh(new THREE.ConeGeometry(0.14, 0.4, 8), lam(z % 6 ? '#ffffff' : '#ff8a3d'), -2.6, 0.2, z);
      this.mesh(new THREE.ConeGeometry(0.14, 0.4, 8), lam(z % 6 ? '#ffffff' : '#ff8a3d'), 2.6, 0.2, z);
    }
    for (let i = 0; i < 14; i++) {
      const z = -i * 4.5 + 4, x = (i % 2 ? -1 : 1) * (5.5 + (i % 3));
      this.mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), lam('#8a6a4a'), x, 0.5, z);
      this.mesh(new THREE.IcosahedronGeometry(0.9, 0), lam(['#5fae4f', '#6cbf5a', '#4f9a45'][i % 3], { flatShading: true }), x, 1.6, z);
    }
    this.runner = this.character(look, 0, 0, Math.PI);   // facing down the track, away from the camera
    this.z = 0; this.anim = 'idle'; this.lean = 0;
    this.placeCamera(1);
  }
  placeCamera(k) {
    const want = new THREE.Vector3(0.6, 2.4, this.z + 5);
    this.cam.position.lerp(want, k);
    this.cam.lookAt(0, 1.0, this.z - 5);
  }
  /** `frac` of the way to the line; `pace` taps per second lately; `mode`: 'ready' | 'run' | 'stumble' | 'won' | 'lost'. */
  update(dt, frac, pace, mode) {
    const r = this.runner;
    this.z += (-TRACK * frac - this.z) * Math.min(1, dt * 10);
    r.root.position.z = this.z;
    const anim = mode === 'won' ? 'cheer' : mode === 'stumble' ? 'hit' : mode === 'run' && pace > 0.5 ? 'walk' : 'idle';
    if (anim !== this.anim) { this.anim = anim; r.play(anim, 0.12); }
    // legs keep time with the taps; leaning into the run
    const speed = anim === 'walk' ? Math.min(3.2, 0.8 + pace * 0.32) : 1;
    this.lean += ((anim === 'walk' ? Math.min(0.28, pace * 0.03) : 0) - this.lean) * Math.min(1, dt * 8);
    r.root.rotation.x = -this.lean;
    if (r.inst.mixer) r.inst.mixer.update(dt * speed);
    for (const cv of this.chars) if (cv !== r && cv.inst.mixer) cv.inst.mixer.update(dt);
    this.placeCamera(Math.min(1, dt * 6));
    this.render();
  }
}
