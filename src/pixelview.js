// The pixel look (design/art-direction/PLAN.md, steps 1 and 3) outside the café: the café's renderer draws its scene
// this way, and the paper doll and the character portraits draw the 3D model the same way, so a character looks one
// drawing everywhere: lit in the sprites' three flat steps (the ramp tools/sprites/bake.html bakes them with), drawn
// at PPU pixels per world unit (the baked sprites' grid), blown up with nearest sampling, with a 1-px INK outline.
// Settings → Display → Pixel art off: the smooth models, as before (pixelLook.on).
import { THREE } from './models.js';
import { patchOutfit } from './outfit.js';

export const PPU = 24;
export const INK = '#1F2A4A';

/** Whether the pixel look is on (the renderer keeps it in step with Settings → Display → Pixel art). */
export const pixelLook = { on: true };

export const TOON_RAMP = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
TOON_RAMP.minFilter = TOON_RAMP.magFilter = THREE.NearestFilter; TOON_RAMP.needsUpdate = true;
const toonTwins = new WeakMap();   // smooth material -> its toon twin, shared like the smooth ones are
export function toonOf(m) {
  if (!m || m.isMeshToonMaterial || m.isMeshBasicMaterial || m.isShaderMaterial) return m;
  let t = toonTwins.get(m);
  if (!t) {
    t = new THREE.MeshToonMaterial({ map: m.map, color: m.color, gradientMap: TOON_RAMP, transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest });
    toonTwins.set(m, t);
  }
  return t;
}
/** A fresh furniture instance (or a thing on it, or a character) in toon light; a pattern or top (outfit.js) stays on. */
export function toonize(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const was = o.material;
    o.material = Array.isArray(was) ? was.map(toonOf) : toonOf(was);
    if (o.userData.outfit && o.material !== was && !o.material.userData.outfit) { o.material.userData.outfit = true; patchOutfit(o.material, o.userData.outfit); }
  });
  return root;
}

/** The sprite bake's light (tools/sprites/bake.html), for a scene of one character seen from the front (+z). */
export function bakeLights(scene) {
  scene.add(new THREE.HemisphereLight('#FFF8EC', '#B7A9C9', 1.7));
  const sun = new THREE.DirectionalLight('#ffffff', 2.0);
  sun.position.set(-3, 6, 6);
  scene.add(sun);
}

/**
 * The ink pass for a renderer of its own (the paper doll's, the portraits'): the scene goes to a low-res target with
 * its depth, then a full-screen pass inks a pixel when it is opaque and a 4-neighbour is empty or clearly farther
 * (as the café's renderer.js pixelKit, which also draws the sky and the street's glitch), tone maps it and puts it on
 * the canvas, keeping the empty pixels transparent. The renderer should use NeutralToneMapping, as the bake.
 */
export class InkPass {
  constructor(gl) {
    this.gl = gl;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  kit(w, h) {
    if (this.rt && this.w === w && this.h === h) return;
    this.free();
    this.w = w; this.h = h;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h), minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.quad.material = this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        ink: { value: new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(INK.slice(i, i + 2), 16) / 255)) },   // sRGB: drawn after the conversion
        near: { value: 0.1 }, far: { value: 50 }, ortho: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform vec3 ink; uniform float near; uniform float far; uniform float ortho;
        varying vec2 vUv;
        float lin(float d) { if (ortho > 0.5) return near + d * (far - near); float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
        void main() {
          vec4 c = texture2D(tColor, vUv);
          if (c.a < 0.5) { gl_FragColor = vec4(0.0); return; }
          float d = lin(texture2D(tDepth, vUv).x);
          float edge = 0.0;
          vec2 o[4];
          o[0] = vec2(texel.x, 0.0); o[1] = vec2(-texel.x, 0.0); o[2] = vec2(0.0, texel.y); o[3] = vec2(0.0, -texel.y);
          for (int i = 0; i < 4; i++) {
            vec4 cn = texture2D(tColor, vUv + o[i]);
            float dn = lin(texture2D(tDepth, vUv + o[i]).x);
            if (cn.a < 0.5 || dn - d > 0.006 * d + 0.15) edge = 1.0;
          }
          gl_FragColor = vec4(c.rgb, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          if (edge > 0.5) gl_FragColor = vec4(ink, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
  }
  /** Draw `scene` through `cam` at w×h pixels onto the renderer's canvas (or `target`). */
  render(scene, cam, w, h, target = null) {
    const gl = this.gl;
    this.kit(w, h);
    const u = this.mat.uniforms;
    u.near.value = cam.near; u.far.value = cam.far; u.ortho.value = cam.isOrthographicCamera ? 1 : 0;
    const clear = gl.getClearAlpha();
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(target);
    gl.setClearAlpha(clear);
    gl.render(this.scene, this.cam);
  }
  free() {
    if (!this.rt) return;
    this.rt.depthTexture.dispose(); this.rt.dispose(); this.mat.dispose();
    this.rt = null;
  }
  dispose() { this.free(); this.quad.geometry.dispose(); }
}
