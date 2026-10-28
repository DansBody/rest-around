// Ears for the guest bodies, made in code: the guest models have smooth earless heads with an ear_l /
// ear_r bone at each upper corner, and each guest gets a pair in its own fur colour (pink inside).
// The ears hang on those bones, so they follow the head and wiggle with the clips.
// The cast body (CastBase) also has a `face` bone at the front of the muzzle and a `crown` bone on top of
// the head, for the head-type parts that aren't ears (cheeks, beaks, wool); bodies without them skip those.
import * as THREE from 'three';

const GLOW = 0.18;          // the same self-glow as the characters (tools/build_character.py)
const INNER = '#f7c1c9';
const LIGHT = '#f8f6f0';    // muzzle/belly colour when none is given
const geoCache = new Map();
const matCache = new Map();

function material(color) {
  let m = matCache.get(color);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0, emissive: c.clone().multiplyScalar(GLOW) });
    matCache.set(color, m);
  }
  return m;
}

// sheep wool: a cap of puffs on the crown
const wool = (x, y, z, r) => ({ geo: () => new THREE.SphereGeometry(r, 20, 14).translate(x, y, z), bone: 'crown', color: 'light' });

/**
 * Shapes per style. Each part sits in its bone's space (up = +y, front = +z), base at the origin.
 * bone   'ear' (default: one per ear bone, mirrored), 'face' or 'crown' (one, or a mirrored pair with `pair`)
 * tilt   tip outwards about z; rx / ry turn about x / y (mirrored for the right side)
 * color  'fur' (default), 'inner' (pink), 'light' (muzzle colour) or a fixed colour; shade darkens the fur
 */
const SHAPES = {
  // pointed, a little flattened front to back
  cat: () => [
    { geo: () => new THREE.ConeGeometry(0.23, 0.4, 24).translate(0, 0.16, 0).scale(1, 1, 0.5), tilt: 0.32 },
    { geo: () => new THREE.ConeGeometry(0.14, 0.27, 24).translate(0, 0.14, 0).scale(1, 1, 0.3), tilt: 0.32, z: 0.05, color: 'inner' },
  ],
  // small half-buried round
  bear: () => [
    { geo: () => new THREE.SphereGeometry(0.17, 24, 16).scale(1, 0.95, 0.55).translate(0, 0.07, 0), tilt: 0.45 },
    { geo: () => new THREE.SphereGeometry(0.1, 20, 12).scale(1, 0.95, 0.3).translate(0, 0.08, 0), tilt: 0.45, z: 0.06, color: 'inner' },
  ],
  // big round (mouse / hamster)
  round: () => [
    { geo: () => new THREE.SphereGeometry(0.23, 24, 16).scale(1, 1, 0.4).translate(0, 0.14, 0), tilt: 0.6 },
    { geo: () => new THREE.SphereGeometry(0.15, 20, 12).scale(1, 1, 0.25).translate(0, 0.15, 0), tilt: 0.6, z: 0.06, color: 'inner' },
  ],
  // long, upright with a slight lean out
  bunny: () => [
    { geo: () => new THREE.CapsuleGeometry(0.13, 0.46, 8, 20).translate(0, 0.3, 0).scale(1, 1, 0.55), tilt: 0.12, x: -0.17 },
    { geo: () => new THREE.CapsuleGeometry(0.075, 0.36, 8, 16).translate(0, 0.32, 0).scale(1, 1, 0.3), tilt: 0.12, x: -0.17, z: 0.05, color: 'inner' },
  ],
  // floppy: from the upper side of the head, hanging down the cheek
  dog: () => [
    { geo: () => new THREE.CapsuleGeometry(0.16, 0.34, 8, 20).translate(0, -0.24, 0).scale(1, 1, 0.45), tilt: -0.45, x: 0.1, y: -0.08, z: 0.02, shade: 0.8 },
  ],
  // hamster: tiny ears low on the sides and puffed-out cheeks in the muzzle colour
  tiny: () => [
    { geo: () => new THREE.SphereGeometry(0.12, 20, 12).scale(1, 0.95, 0.5).translate(0, 0.05, 0), tilt: 0.7, x: -0.02 },
    { geo: () => new THREE.SphereGeometry(0.075, 16, 10).scale(1, 0.95, 0.3).translate(0, 0.055, 0), tilt: 0.7, x: -0.02, z: 0.05, color: 'inner' },
    { geo: () => new THREE.SphereGeometry(0.15, 24, 16).scale(1, 0.85, 0.6), bone: 'face', pair: true, x: 0.4, y: -0.05, z: -0.25, color: 'light' },
  ],
  // sheep: curled horns on the sides and a cap of wool framing the face
  curl: () => [
    { geo: () => new THREE.TorusGeometry(0.11, 0.05, 10, 28, Math.PI * 1.7), ry: Math.PI / 2, x: 0.24, y: -0.26, z: 0.06, color: '#c9a06a' },
    wool(0, 0, 0, 0.24), wool(0.24, -0.1, 0.04, 0.19), wool(-0.24, -0.1, 0.04, 0.19), wool(0, -0.07, 0.2, 0.18),
    wool(0.17, -0.06, -0.18, 0.18), wool(-0.17, -0.06, -0.18, 0.18),
    wool(0.42, -0.3, 0.02, 0.17), wool(-0.42, -0.3, 0.02, 0.17), wool(0.53, -0.55, 0, 0.15), wool(-0.53, -0.55, 0, 0.15),
  ],
  // penguin / chick: no ears, a short beak on the muzzle
  beak: () => [
    { geo: () => new THREE.ConeGeometry(0.07, 0.14, 16).rotateX(Math.PI / 2).translate(0, 0, 0.05).scale(1.3, 0.75, 1), bone: 'face', y: -0.02, z: -0.03, color: '#f2a33a' },
  ],
  // owl: feather tufts where the ears would be and a small hooked beak
  owl: () => [
    { geo: () => new THREE.ConeGeometry(0.12, 0.36, 12).translate(0, 0.15, 0).scale(1, 1, 0.5), tilt: 0.38, y: -0.04, shade: 0.85 },
    { geo: () => new THREE.ConeGeometry(0.05, 0.12, 12).rotateX(Math.PI / 2 + 0.5).translate(0, -0.01, 0.04), bone: 'face', y: 0.02, z: -0.04, color: '#f4c430' },
  ],
  none: () => [],
};

/**
 * Hang a pair of `style` ears in `fur` colour on a character instance's ear bones (and the style's other
 * head parts on its face/crown bones). `size` scales every part (the shapes are made for the guest head);
 * `light` is the colour of the cheeks and wool.
 */
export function addEars(root, style, fur, { size = 1, light = LIGHT } = {}) {
  const make = SHAPES[style];
  if (!make || !fur) return;
  const bones = {};
  root.traverse((o) => { if (['ear_l', 'ear_r', 'face', 'crown'].includes(o.name)) bones[o.name] = o; });
  make().forEach((p, i) => {
    const where = p.bone && p.bone !== 'ear'
      ? (bones[p.bone] ? (p.pair ? [[bones[p.bone], 1], [bones[p.bone], -1]] : [[bones[p.bone], 1]]) : [])
      : [['ear_l', 1], ['ear_r', -1]].filter(([n]) => bones[n]).map(([n, side]) => [bones[n], side]);
    const key = style + i;
    if (!geoCache.has(key)) geoCache.set(key, p.geo());
    let color = { fur, inner: INNER, light }[p.color || 'fur'] || p.color;
    if (p.shade) color = '#' + new THREE.Color(fur).multiplyScalar(p.shade).getHexString();   // a touch darker than the head
    for (const [bone, side] of where) {
      const m = new THREE.Mesh(geoCache.get(key), material(color));
      m.position.set(side * (p.x || 0), p.y || 0, p.z || 0).multiplyScalar(size);
      m.rotation.set(p.rx || 0, side * (p.ry || 0), -side * (p.tilt || 0));   // tip outwards (+x is the character's left)
      m.scale.setScalar(size);
      m.castShadow = true;
      m.name = 'ear';
      bone.add(m);
    }
  });
}
