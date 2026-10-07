// Steam in the 3D scene: wisps over a brewing espresso machine, the hiss of its steam wand, and the curl off a hot
// cup. Every puff is one point in a single THREE.Points cloud (one draw call, the soft round shape is worked out
// in the fragment shader, no texture), moved on the CPU from a small ring of particles. Cheap enough for phones.
import { THREE } from './models.js';

const MAX = 320;
// per kind: life (s), start / end size (world units), peak opacity, rise speed, sideways sway, drag
const KIND = {
  wisp: { life: [1.4, 2.0], size: [0.1, 0.5], alpha: 0.32, rise: [0.35, 0.55], sway: 0.1, drag: 0.6 },
  cup: { life: [1.2, 1.7], size: [0.07, 0.32], alpha: 0.4, rise: [0.25, 0.4], sway: 0.06, drag: 0.6 },
  burst: { life: [0.9, 1.5], size: [0.05, 0.75], alpha: 0.42, rise: [0.5, 0.8], sway: 0.14, drag: 3.5 },
};

const VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    vAlpha = alpha;
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;              // 0 at the centre, 1 at the edge
    if (r2 > 1.0) discard;
    float a = vAlpha * pow(1.0 - r2, 1.6);
    // a bright core and a faintly cool-grey rim, so a puff still reads against the cream walls
    gl_FragColor = vec4(uColor * mix(vec3(1.0), vec3(0.8, 0.83, 0.88), r2), a);
  }`;

export class Steam {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.p = Array.from({ length: MAX }, () => ({ age: 0, life: 0 }));
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(1, 0.98, 0.94) } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;   // the particles move every frame; the bounds would be stale
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.live = 0;
  }

  /** Pixels per world unit at distance 1: the canvas height over the camera's vertical field of view. */
  resize(heightPx, fovDeg) { this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); }

  /** Dim the steam with the light (1 = full day). */
  setLight(k) { const c = 0.45 + 0.55 * Math.min(1, Math.max(0, k)); this.mat.uniforms.uColor.value.setRGB(c, c * 0.98, c * 0.94); }

  /** One puff of `kind` at a world position, optionally pushed along `vel` (world units / s). */
  emit(at, kind = 'wisp', vel = null) {
    const K = KIND[kind], q = this.p[this.next], i = this.next;
    this.next = (this.next + 1) % MAX;
    const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
    q.age = 0; q.life = rnd(K.life); q.k = K;
    q.x = at.x + (Math.random() - 0.5) * 0.04; q.y = at.y; q.z = at.z + (Math.random() - 0.5) * 0.04;
    q.vx = vel ? vel.x : 0; q.vy = vel ? vel.y : 0; q.vz = vel ? vel.z : 0;
    q.rise = rnd(K.rise); q.ph = Math.random() * 6.28; q.fq = 2 + Math.random() * 2;
    this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
  }

  /** The steam wand's hiss: a quick jet along `dir` that slows and billows up. */
  burst(at, dir, n = 22) {
    const v = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      v.copy(dir).multiplyScalar(1.6 + Math.random() * 1.2);
      v.x += (Math.random() - 0.5) * 0.6; v.z += (Math.random() - 0.5) * 0.6;
      this.emit(at, 'burst', v);
      this.p[(this.next + MAX - 1) % MAX].age = -j * 0.03;   // a jet over ~0.6 s rather than one blob
    }
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      const q = this.p[i];
      if (q.age >= q.life) { this.alpha[i] = 0; continue; }
      q.age += dt;
      if (q.age < 0) { this.alpha[i] = 0; live++; continue; }
      const K = q.k, k = Math.min(1, q.age / q.life), drag = Math.exp(-K.drag * dt);
      q.vx *= drag; q.vy *= drag; q.vz *= drag;
      const sway = Math.sin(q.age * q.fq + q.ph) * K.sway;
      q.x += (q.vx + sway) * dt; q.z += (q.vz + Math.cos(q.age * q.fq * 0.7 + q.ph) * K.sway * 0.6) * dt;
      q.y += (q.vy + q.rise * (0.4 + k)) * dt;     // buoyant: it rises faster as it warms the air around it
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.size[i] = K.size[0] + (K.size[1] - K.size[0]) * Math.sqrt(k);
      this.alpha[i] = K.alpha * Math.sin(Math.min(1, k * 1.15) * Math.PI) * (1 - k * 0.3);
      live++;
    }
    this.live = live;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}
