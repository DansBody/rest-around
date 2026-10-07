// The little 3D bar above the mini-game: the partner behind the espresso counter, acting out what the player's
// finger does, and the critic in front of it (a flat cut-out from the illustrations, so no 3D model is needed).
// Uses the game's own model store, character views and the Training tab's Stage, loading only the few models it
// needs. Kept cheap for phones: a short canvas, pixel ratio ≤ 1.5, no shadows, drawn at 30 fps.
import { THREE, models } from '../../src/models.js';
import { Stage } from '../../src/tryout3d.js';

const NEED = ['mochalatte', 'm_espresso', 'm_counter_plain', 'm_espresso_machine', 'dish_latte'];
let loading = null;
/** Loads the bar's models once (the café's manifest, filtered to what the bar uses). */
export function loadBar() {
  if (!loading) loading = (async () => {
    const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
    const m = await res.json();
    await models.load({ models: m.models.filter((d) => NEED.includes(d.id)) });
  })();
  return loading;
}

const tex = new THREE.TextureLoader();
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class BarStage extends Stage {
  /** `faces`: { neutral, happy, grumpy } image URLs of the critic. */
  constructor(canvas, faces, chef = 'mochalatte') {
    super(canvas, '#f3e4d2');
    this.gl.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.scene.fog = null;
    // the room: a warm floor and a back wall with a stripe of wainscot
    this.ground(40, 40, '#d6b089');
    this.mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshLambertMaterial({ color: '#f1dcc0' }), 0, 6, -3.2);
    this.mesh(new THREE.PlaneGeometry(40, 1.4), new THREE.MeshLambertMaterial({ color: '#c9946a' }), 0, 0.7, -3.18);
    // a shelf with a few cups on the wall
    this.mesh(new THREE.BoxGeometry(3.2, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: '#a8754d' }), 0.6, 3.1, -3.0);
    // the counter with the espresso machine, the partner behind it
    this.bar = models.instance('m_espresso');
    this.bar.position.set(0, 0, 0);
    this.scene.add(this.bar);
    this.chef = this.character({ model: chef }, 1.45, -0.55, -0.45);   // beside the machine, turned towards it
    // the drink, hidden until it is served
    this.cup = models.instance('dish_latte');
    this.cup.visible = false;
    this.scene.add(this.cup);
    // the critic: a cut-out on the customer side, facing the camera
    this.faces = {};
    for (const [k, url] of Object.entries(faces)) {
      const t = tex.load(url); t.colorSpace = THREE.SRGBColorSpace; this.faces[k] = t;
    }
    this.critic = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.faces.neutral, transparent: true }));
    this.critic.scale.set(1.3, 1.72, 1);
    this.criticHome = new THREE.Vector3(-1.95, 1.0, 1.5);
    this.critic.position.copy(this.criticHome);
    this.made.push(this.critic.material);
    this.scene.add(this.critic);
    // steam and sparkles
    this.dot = softDot(); this.made.push(this.dot);
    this.puffs = [];
    this.cam.position.set(0.1, 1.95, 5.9);
    this.cam.lookAt(0.1, 1.1, 0);
    this.cam.fov = 40; this.cam.updateProjectionMatrix();
    this.mood = 'neutral'; this.moodT = 0; this.act = 'idle'; this.actT = 0; this.steaming = false; this.t = 0; this.acc = 0;
    this.serveT = -1;
  }
  setMood(m) {
    if (!m || m === this.mood) return;
    this.mood = m; this.moodT = 0;
    this.critic.material.map = this.faces[m] || this.faces.neutral; this.critic.material.needsUpdate = true;
  }
  /** What the partner is doing: 'idle', 'work', 'steam', or a one-off 'cheer' / 'oops' that returns to idle. */
  setAct(a) {
    if (a === this.act && a !== 'cheer' && a !== 'oops') return;
    this.act = a; this.actT = 0;
    const clip = { idle: 'idle', work: 'cook', steam: 'shake', cheer: 'cheer', oops: 'hit', serve: 'carry' }[a] || 'idle';
    this.chef.play(clip, 0.15);
  }
  setSteam(on) { this.steaming = on; }
  /** The finished latte appears on the counter and slides over to the critic. */
  serve() { this.cup.visible = true; this.serveT = 0; this.setAct('serve'); }
  puff(x, y, z, color = '#ffffff', size = 0.35, vy = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color, transparent: true, depthWrite: false }));
    s.position.set(x, y, z); s.scale.setScalar(size);
    this.scene.add(s);
    this.puffs.push({ s, life: 1, vy, vx: (Math.random() - 0.5) * 0.4, grow: size });
  }
  /** A burst of golden sparkles round the critic (a perfect step). */
  sparkle() {
    for (let i = 0; i < 14; i++) {
      const p = this.criticHome;
      this.puff(p.x + (Math.random() - 0.5) * 1.4, p.y + (Math.random() - 0.2) * 1.4, p.z + 0.1, '#ffd25a', 0.16, 0.6 + Math.random());
    }
  }
  update(dt) {
    this.t += dt; this.moodT += dt; this.actT += dt;
    if ((this.act === 'cheer' && this.actT > 1.4) || (this.act === 'oops' && this.actT > 0.9)) this.setAct('idle');
    // the critic: bobs when pleased, shakes the head when not
    const c = this.critic.position;
    c.copy(this.criticHome);
    if (this.mood === 'happy') c.y += Math.abs(Math.sin(this.t * 7)) * 0.08 * Math.max(0, 1 - this.moodT / 2.5 + 0.4);
    if (this.mood === 'grumpy' && this.moodT < 0.7) c.x += Math.sin(this.moodT * 40) * 0.05 * (1 - this.moodT / 0.7);
    // steam from the machine's wand
    if (this.steaming && Math.random() < dt * 22) this.puff(0.55 + Math.random() * 0.1, 1.6, 0.35, '#ffffff', 0.25, 1.1);
    for (const p of this.puffs) {
      p.life -= dt * 1.1; p.s.position.y += p.vy * dt; p.s.position.x += p.vx * dt;
      p.s.scale.setScalar(p.grow * (1.6 - p.life * 0.6)); p.s.material.opacity = Math.max(0, p.life);
    }
    for (const p of this.puffs) if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); }
    this.puffs = this.puffs.filter((p) => p.life > 0);
    // serving: up on the counter, then across to the critic
    if (this.serveT >= 0) {
      this.serveT += dt;
      const k = Math.min(1, this.serveT / 1.1), e = 1 - (1 - k) * (1 - k);
      this.cup.position.set(0.2 - 1.0 * e, 1.44, 0.45 + 0.2 * e);
      this.cup.scale.setScalar(0.42);
    }
    for (const cv of this.chars) if (cv.inst.mixer) cv.inst.mixer.update(dt);
    // draw at 30 fps: plenty for this strip, and half the GPU work on a phone
    this.acc += dt;
    if (this.acc >= 1 / 31) { this.acc = 0; this.render(); }
  }
}
