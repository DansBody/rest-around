// Battle moves posed in code (no baked glTF clip behind them): every character shares the rig (root, hips, leg_l/r,
// chest, arm_l/r, head, ear_l/r, tail), so one move fits the whole team; Attack has a style per character.
// bake.html plays the base clip, resets nothing it keys, then calls act(t, bones, root, H) for each frame, t in 0..1.
// Axes as in src/ui/ultimate.js: chest +x leans forward, arm_l −y / arm_r +y reach forward, arm_l −z / arm_r +z
// raise the arm out and up, legs +x kick back, tail +x lifts, head −x looks up.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const bend = (b, x = 0, y = 0, z = 0) => { if (b) b.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 over [a, b], back to 0 over [b, c]. */
const bump = (t, a, b, c) => (t < b ? smooth(span(t, a, b)) : 1 - smooth(span(t, b, c)));

/** Squash/stretch and a step forward on the root (y up, +z forward in the model's own space). */
function body(root, H, { fwd = 0, lift = 0, squash = 0 } = {}) {
  root.position.set(0, lift * H, fwd * H);
  root.scale.set(1 + 0.1 * squash, 1 - 0.14 * squash, 1 + 0.1 * squash);
}

const ATTACK = {
  // Cheetie: a lunge and two quick claw swipes, right then left
  cheetie(t, b, root, H) {
    const coil = bump(t, 0, 0.12, 0.25), go = bump(t, 0.12, 0.3, 0.95);
    const s1 = bump(t, 0.2, 0.32, 0.5), s2 = bump(t, 0.45, 0.58, 0.78);
    body(root, H, { fwd: 0.22 * go, squash: 0.6 * coil - 0.3 * s1 });
    bend(b.chest, 0.45 * go + 0.2 * coil, 0, 0.15 * (s1 - s2));
    bend(b.head, -0.25 * go);
    // each paw goes up, then rakes forward and down
    bend(b.arm_r, 0, 1.5 * s1 - 0.3 * coil, 1.8 * coil + 0.9 * s1 - 0.6 * s2);
    bend(b.arm_l, 0, -1.5 * s2 + 0.3 * coil, -1.8 * coil - 0.4 * s1 - 0.9 * s2);
    bend(b.leg_l, 0.5 * go); bend(b.leg_r, -0.3 * go);
    bend(b.tail, 0.8 * go);
  },
  // Hee Hee: a shoulder bash, the whole body thrown forward with the arms tucked
  heehee(t, b, root, H) {
    const coil = bump(t, 0, 0.2, 0.35), hit = bump(t, 0.25, 0.42, 0.9);
    body(root, H, { fwd: 0.3 * hit - 0.06 * coil, squash: 0.7 * coil - 0.25 * hit });
    bend(b.chest, 0.55 * hit - 0.2 * coil, 0, -0.35 * hit);
    bend(b.head, -0.2 * hit + 0.15 * coil);
    bend(b.arm_l, 0, 0.4 * hit, 0.35 * hit);   // tucked in against the body
    bend(b.arm_r, 0, -0.3 * hit, -0.35 * hit);
    bend(b.leg_l, 0.6 * hit); bend(b.leg_r, -0.35 * hit);
    bend(b.tail, 0.5 * hit);
  },
  // Mocha Latte: an overhand throw (a coffee bean on its way)
  mochalatte(t, b, root, H) {
    const back = bump(t, 0, 0.3, 0.45), thr = bump(t, 0.32, 0.48, 0.95);
    body(root, H, { fwd: 0.12 * thr - 0.04 * back, squash: 0.35 * back - 0.15 * thr });
    bend(b.chest, 0.4 * thr - 0.3 * back, 0.3 * back - 0.25 * thr);
    bend(b.head, -0.2 * back);
    bend(b.arm_r, 0, -0.7 * back + 1.6 * thr, 2.5 * back + 0.6 * thr);   // up and back over the head, then out front
    bend(b.arm_l, 0, -0.5 * back, -0.9 * back);
    bend(b.leg_l, -0.3 * thr); bend(b.leg_r, 0.4 * thr);
  },
  // Bbaekko: both paws out, a little hop, a spell let go
  bbaekko(t, b, root, H) {
    const gather = bump(t, 0, 0.3, 0.45), cast = bump(t, 0.35, 0.5, 0.95);
    body(root, H, { lift: 0.08 * Math.sin(Math.PI * span(t, 0.3, 0.75)), squash: 0.3 * gather - 0.2 * cast });
    bend(b.chest, 0.25 * cast - 0.15 * gather);
    bend(b.head, -0.25 * gather + 0.1 * cast);
    bend(b.arm_l, 0, -1.5 * cast, -1.4 * gather - 0.8 * cast);   // paws drawn up, then pushed out at the foe
    bend(b.arm_r, 0, 1.5 * cast, 1.4 * gather + 0.8 * cast);
    bend(b.ear_l, -0.3 * cast); bend(b.ear_r, -0.3 * cast);
    bend(b.tail, 0.6 * cast);
  },
};

export const MOVES = {
  Attack: { base: 'Idle', dur: 0.5, act: (t, b, root, H, who) => (ATTACK[who] || ATTACK.cheetie)(t, b, root, H) },
  // a skill card: paws up, a hop, a cheer at the top
  Cast: {
    base: 'Idle', dur: 0.6,
    act(t, b, root, H) {
      const up = bump(t, 0.05, 0.4, 0.95), hop = Math.sin(Math.PI * span(t, 0.2, 0.7));
      body(root, H, { lift: 0.12 * hop, squash: 0.4 * bump(t, 0, 0.15, 0.25) - 0.15 * hop });
      bend(b.chest, -0.2 * up);
      bend(b.head, -0.35 * up);
      bend(b.arm_l, 0, -0.3 * up, -2.6 * up);
      bend(b.arm_r, 0, 0.3 * up, 2.6 * up);
      bend(b.ear_l, 0.3 * hop); bend(b.ear_r, 0.3 * hop);
      bend(b.tail, 0.7 * up);
    },
  },
  // knocked back by a hit: thrown back, arms out, then settling
  Hurt: {
    base: 'Idle', dur: 0.32,
    act(t, b, root, H) {
      const k = bump(t, 0, 0.15, 1);
      body(root, H, { fwd: -0.14 * k, squash: -0.15 * k });
      bend(b.chest, -0.5 * k, 0, 0.15 * k);
      bend(b.head, 0.35 * k);
      bend(b.arm_l, 0, 0.5 * k, -1.4 * k);   // flung out and back
      bend(b.arm_r, 0, -0.5 * k, 1.4 * k);
      bend(b.leg_l, -0.3 * k); bend(b.leg_r, 0.2 * k);
      bend(b.ear_l, 0.5 * k); bend(b.ear_r, 0.5 * k);
    },
  },
};
