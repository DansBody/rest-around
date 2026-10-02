// Ears for the guest bodies, made in code: the guest models have smooth earless heads with an ear_l /
// ear_r bone at each upper corner, and each guest gets a pair in its own fur colour (pink inside).
// The ears hang on those bones, so they follow the head and wiggle with the clips.
import * as THREE from 'three';

const GLOW = 0.18;          // the same self-glow as the characters (tools/build_character.py)
const INNER = '#f7c1c9';
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

/** Shapes per style, in the ear bone's space (up = +y, front = +z), base at the origin. */
const SHAPES = {
  // pointed, a little flattened front to back
  cat: () => [
    { geo: () => new THREE.ConeGeometry(0.23, 0.4, 24).translate(0, 0.16, 0).scale(1, 1, 0.5), tilt: 0.32 },
    { geo: () => new THREE.ConeGeometry(0.14, 0.27, 24).translate(0, 0.14, 0).scale(1, 1, 0.3), tilt: 0.32, z: 0.05, inner: true },
  ],
  // small half-buried round
  bear: () => [
    { geo: () => new THREE.SphereGeometry(0.17, 24, 16).scale(1, 0.95, 0.55).translate(0, 0.07, 0), tilt: 0.45 },
    { geo: () => new THREE.SphereGeometry(0.1, 20, 12).scale(1, 0.95, 0.3).translate(0, 0.08, 0), tilt: 0.45, z: 0.06, inner: true },
  ],
  // big round (mouse / hamster)
  round: () => [
    { geo: () => new THREE.SphereGeometry(0.23, 24, 16).scale(1, 1, 0.4).translate(0, 0.14, 0), tilt: 0.6 },
    { geo: () => new THREE.SphereGeometry(0.15, 20, 12).scale(1, 1, 0.25).translate(0, 0.15, 0), tilt: 0.6, z: 0.06, inner: true },
  ],
  // long, upright with a slight lean out
  bunny: () => [
    { geo: () => new THREE.CapsuleGeometry(0.13, 0.46, 8, 20).translate(0, 0.3, 0).scale(1, 1, 0.55), tilt: 0.12, x: -0.17 },
    { geo: () => new THREE.CapsuleGeometry(0.075, 0.36, 8, 16).translate(0, 0.32, 0).scale(1, 1, 0.3), tilt: 0.12, x: -0.17, z: 0.05, inner: true },
  ],
  // floppy: from the upper side of the head, hanging down the cheek
  dog: () => [
    { geo: () => new THREE.CapsuleGeometry(0.16, 0.34, 8, 20).translate(0, -0.24, 0).scale(1, 1, 0.45), tilt: -0.45, x: 0.1, y: -0.08, z: 0.02, shade: 0.8 },
  ],
  none: () => [],
};

/** Hang a pair of `style` ears in `fur` colour on a character instance's ear bones. */
export function addEars(root, style, fur) {
  const make = SHAPES[style];
  if (!make || !fur) return;
  const bones = {};
  root.traverse((o) => { if (o.name === 'ear_l' || o.name === 'ear_r') bones[o.name] = o; });
  for (const [name, side] of [['ear_l', 1], ['ear_r', -1]]) {
    const bone = bones[name];
    if (!bone) continue;
    make().forEach((p, i) => {
      const key = style + i;
      if (!geoCache.has(key)) geoCache.set(key, p.geo());
      let color = p.inner ? INNER : fur;
      if (p.shade) color = '#' + new THREE.Color(fur).multiplyScalar(p.shade).getHexString();   // a touch darker than the head
      const m = new THREE.Mesh(geoCache.get(key), material(color));
      m.position.set(side * (p.x || 0), p.y || 0, p.z || 0);
      m.rotation.z = -side * p.tilt;   // tip outwards (+x is the character's left)
      m.castShadow = true;
      m.name = 'ear';
      bone.add(m);
    });
  }
}
