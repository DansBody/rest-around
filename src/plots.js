// Garden plot meshes, shared by the 3D garden and the Garden panel thumbnails.
import { THREE, models } from './models.js';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const SPOTS = [[-0.4, -0.35], [0.4, -0.35], [0, 0.05], [-0.4, 0.4], [0.4, 0.4]];
export const SPROUT_UNTIL = 0.35;

/** Wooden frame + soil bed. Returns { group, soilMat }. */
export function buildPlot(soilTexture) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 1.8), lam('#c79a62'));
  frame.position.y = 0.14; frame.castShadow = true; frame.receiveShadow = true; g.add(frame);
  const soilMat = lam('#ffffff', { map: soilTexture || null });
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.3, 1.55), soilMat);
  soil.position.y = 0.16; soil.receiveShadow = true; g.add(soil);
  return { group: g, soilMat };
}

/** Five sprouts (young) or five of the grown crop. */
export function buildCrops(crop, prog) {
  const cg = new THREE.Group();
  for (const [dx, dz] of SPOTS) {
    let m;
    if (prog < SPROUT_UNTIL) {
      m = new THREE.Group();
      const leaf = lam('#7cc47a');
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 5), lam('#5fae4f')); stem.position.y = 0.11; m.add(stem);
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), leaf); l.scale.set(1.2, 0.45, 0.7); l.position.set(s * 0.09, 0.24, 0); l.rotation.z = s * 0.5; m.add(l); }
    } else m = models.instance('ing_' + crop);
    const w = new THREE.Group(); w.add(m); w.position.set(dx, 0.31, dz); cg.add(w);
  }
  return cg;
}

/** Crop scale for a growth fraction. */
export function cropScale(prog) { return prog < SPROUT_UNTIL ? 0.6 + prog * 1.5 : 0.35 + prog * 0.35; }
