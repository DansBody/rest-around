// A 3D character on screen for one simulation agent (or passer-by). Chooses the skeletal animation
// from the agent's procedural pose (walk, sit, eat, cook, sweep, nap...), attaches held props
// (tray + dish, broom, wrench, mug) and wardrobe accessories, and smooths facing.
import { THREE, models, TILE } from './models.js';
import { addEars } from './ears.js';
import { shape, fitMatrix, wearBone } from './wear.js';
import { WEAR_SLOTS, wearById } from './data.js';

const DIR_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // +x, +y(+z), -x, -y
const SIT_FORWARD = 0.68;
const SWING = 0.55;   // seconds of a bat swing (staff.swingT counts down from this)

/** A wooden bat (Baseball Club), made in code: the handle sits at the origin. */
export function makeBat() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#d9a066' });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.03, 0.95, 10), wood);
  barrel.position.y = 0.5; barrel.castShadow = true; g.add(barrel);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 6), wood);
  cap.position.y = 0.975; g.add(cap);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.16, 8), new THREE.MeshLambertMaterial({ color: '#3a3a44' }));
  grip.position.y = 0.06; g.add(grip);
  return g;
}

export class CharacterView {
  constructor(scene, agent) {
    this.agent = agent;
    const look = agent.look || {};
    this.modelId = look.model || 'guest_b';
    this.def = models.def(this.modelId) || {};
    this.anims = this.def.animations || {};
    const inst = models.character(this.modelId);
    this.inst = inst;
    this.root = new THREE.Group();
    this.root.add(inst.root);
    scene.add(this.root);
    this.applyLook(look);
    this.current = null;
    this.yaw = DIR_YAW[agent.dir ?? 1];
    this.held = {};
    this.heldKey = null;
    this.worn = [];
    this.setWear(look.wear);
    this.play('idle', 0);
  }

  applyLook(look) {
    // tint the whole outfit lightly for variety (skin included, kept subtle)
    if (look.tint) {
      const col = new THREE.Color('#ffffff').lerp(new THREE.Color(look.tint), 0.35);
      this.inst.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(col); } });
    }
    // guest bodies: their own fur and shirt colours
    if (look.fur || look.shirt) models.recolorCharacter(this.inst.root, this.modelId, { fur: look.fur, shirt: look.shirt });
    if (look.ears) addEars(this.inst.root, look.ears, look.fur);
    if (look.scale) this.inst.root.scale.setScalar(look.scale);
  }

  /** Put on the wardrobe accessories (look.wear: slot -> { id, p, r, s }), fitted to this character. */
  setWear(wear) {
    for (const o of this.worn) o.parent && o.parent.remove(o);
    this.worn = [];
    if (!wear) return;
    const s = shape(this.modelId, this.inst);
    for (const slot of WEAR_SLOTS) {
      const item = wear[slot] && wearById(wear[slot].id);
      const bone = item && wearBone(item, this.inst.bones);
      if (!bone) continue;
      const o = models.instance(item.model);
      fitMatrix(item, s, wear[slot]).decompose(o.position, o.quaternion, o.scale);
      bone.add(o);
      o.userData.slot = slot;
      this.worn.push(o);
    }
  }

  play(key, fade = 0.22) {
    const name = this.anims[key] || this.anims.idle;
    if (this.current === name) return;
    const acts = this.inst.actions;
    const next = acts[name] || acts[this.anims.idle];
    if (!next) return;
    const prev = this.current && acts[this.current];
    next.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  /** Where a bat is gripped: the tray-carrying point in front of the chest (manifest `trayPos`), so it never sinks into the body. */
  batGrip() { return this.def.trayPos || [0, 1.05, 0.55]; }

  /** Pick a held prop, cached per kind. */
  setHeld(held) {
    const key = held ? held.id + '|' + (held.dish || '') : null;
    if (key === this.heldKey) return;
    this.heldKey = key;
    for (const o of Object.values(this.held)) o.visible = false;
    if (!held) return;
    let o = this.held[key];
    if (!o) {
      if (held.id === 'held_bat') {   // gripped where a tray is carried, out in front, held up ready to swing
        o = new THREE.Group();
        const bat = makeBat();
        bat.position.set(...this.batGrip());
        bat.rotation.set(-0.2, 0, 0.3);
        o.add(bat);
        this.root.add(o);
      } else if (held.id === 'held_tray') {
        o = new THREE.Group();
        const tray = models.instance('m_tray'); o.add(tray);
        if (held.dish) {
          const dishModel = held.dish === 'dirty_plate' ? 'm_plate_dirty' : held.dish;
          const dish = models.instance(dishModel); dish.scale.setScalar(0.55); dish.position.y = 0.04; o.add(dish);
        }
        o.position.set(...(this.def.trayPos || [0, 1.05, 0.55]));
        this.root.add(o);
      } else {
        const id = { held_broom: 'm_broom', held_wrench: 'm_wrench', held_shaker: 'm_mug' }[held.id] || 'm_mug';
        o = models.instance(id);
        if (id === 'm_mug') o.scale.setScalar(1.4);
        const hand = this.inst.bones.hand;
        if (hand) hand.add(o); else this.root.add(o);
      }
      this.held[key] = o;
    }
    o.visible = true;
  }

  update(dt, g) {
    const a = this.agent;
    const p = a.pose || {};
    let x = a.x * TILE, z = a.y * TILE, y = 0;
    let target = DIR_YAW[a.dir ?? 1];
    let anim = 'idle';
    const seated = a.onTile && (p.mode === 'sit' || p.mode === 'eat' || p.mode === 'wait');
    if (seated) {
      const ch = a.onTile;
      x = (ch.x + 0.5) * TILE; z = (ch.y + 0.5) * TILE;
      target = DIR_YAW[ch.dir];
      // the sit clip shifts the hips back; step forward so they land on the seat
      const fwd = this.def.sitForward ?? SIT_FORWARD;
      x += Math.sin(target) * fwd; z += Math.cos(target) * fwd;
      anim = 'sit';
    } else if (p.moving) anim = p.held && p.held.id === 'held_tray' ? 'carry' : 'walk';
    else if (p.mode && p.mode !== 'idle' && p.mode !== 'carry') anim = p.mode;
    if (p.hop > 0 && p.hop < 1) y += Math.sin(p.hop * Math.PI) * 0.35;
    if (a.fly) y += a.fly.h;   // knocked out of the café: up and away, head over heels
    if (p.shake) x += Math.sin((p.t || 0) * 45) * 0.05;
    // smooth facing (shortest way round)
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.root.position.set(x, y, z);
    // a bat swing: wind up (turn away), then whip round through the ball
    let swing = 0;
    if (a.swingT > 0) { const k = 1 - a.swingT / SWING; swing = k < 0.55 ? -0.9 * (k / 0.55) : -0.9 + 3.6 * Math.min(1, (k - 0.55) / 0.25); }
    this.root.rotation.y = this.yaw + (a.spinT > 0 ? (1 - a.spinT / 0.8) * Math.PI * 4 : 0) + swing;
    this.root.rotation.x = a.fly ? a.fly.spin : 0;
    this.play(anim);
    this.setHeld(p.held);
    // animations keep pace with sprinting / skilled staff
    if (this.inst.mixer) this.inst.mixer.update(dt * (a.speedMul || 1));
  }

  /** World position of the top of the head (for bubbles and name tags). */
  headTop(out) {
    const h = this.inst.bones.head;
    if (h) { h.getWorldPosition(out); out.y += this.worn.some((o) => o.userData.slot === 'head') ? 1.95 : 1.25; }
    else { out.copy(this.root.position); out.y += 2.6; }
    return out;
  }

  dispose(scene) {
    scene.remove(this.root);
    if (this.inst.mixer) this.inst.mixer.stopAllAction();
  }
}
