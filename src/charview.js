// A 3D character on screen for one simulation agent (or passer-by). Chooses the skeletal animation
// from the agent's procedural pose (walk, sit, eat, cook, sweep, nap...), attaches held props
// (tray + dish, broom, wrench, mug) and role hats, and smooths facing.
import { THREE, models, TILE } from './models.js';

const DIR_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // +x, +y(+z), -x, -y
const SIT_FORWARD = 0.68;

export class CharacterView {
  constructor(scene, agent, manifest) {
    this.agent = agent;
    this.anims = manifest.characterAnimations || {};
    const look = agent.look || {};
    this.modelId = look.model || 'knight';
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
    this.hat = null;
    this.setHat(look.roleHat);
    this.play('idle', 0);
  }

  applyLook(look) {
    const d = models.def(this.modelId) || {};
    // weapons were stripped from the model files; optional accessories (helmet, hat, cape) can be hidden
    const hide = new Set((look.hide || []).filter((n) => (d.accessories || []).includes(n)));
    this.inst.root.traverse((o) => {
      if (!o.isMesh) return;
      if (hide.has(o.name) || (o.parent && hide.has(o.parent.name))) o.visible = false;
    });
    // tint the whole outfit lightly for variety (skin included, kept subtle)
    if (look.tint) {
      const col = new THREE.Color('#ffffff').lerp(new THREE.Color(look.tint), 0.35);
      this.inst.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(col); } });
    }
    if (look.scale) this.inst.root.scale.setScalar(look.scale);
  }

  setHat(kind) {
    if (this.hat) { this.hat.parent && this.hat.parent.remove(this.hat); this.hat = null; }
    if (!kind || !this.inst.bones.head) return;
    const hat = models.instance(kind === 'chef' ? 'm_chefhat' : kind);
    hat.scale.setScalar(1.05);
    hat.position.set(0, 1.12, 0);
    this.inst.bones.head.add(hat);
    this.hat = hat;
    // hide model hats/helmets under the chef hat
    this.inst.root.traverse((o) => { if (o.isMesh && /Helmet|_Hat|Hooded/.test(o.name + (o.parent ? o.parent.name : ''))) o.visible = false; });
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

  /** Pick a held prop, cached per kind. */
  setHeld(held) {
    const key = held ? held.id + '|' + (held.dish || '') : null;
    if (key === this.heldKey) return;
    this.heldKey = key;
    for (const o of Object.values(this.held)) o.visible = false;
    if (!held) return;
    let o = this.held[key];
    if (!o) {
      if (held.id === 'held_tray') {
        o = new THREE.Group();
        const tray = models.instance('m_tray'); o.add(tray);
        if (held.dish) {
          const dishModel = held.dish === 'dirty_plate' ? 'm_plate_dirty' : held.dish;
          const dish = models.instance(dishModel); dish.scale.setScalar(0.55); dish.position.y = 0.04; o.add(dish);
        }
        o.position.set(0, 1.05, 0.55);
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
      // the sit clip shifts the hips back by ~0.7 units; step forward so they land on the seat
      x += Math.sin(target) * SIT_FORWARD; z += Math.cos(target) * SIT_FORWARD;
      anim = 'sit';
    } else if (p.moving) anim = p.held && p.held.id === 'held_tray' ? 'carry' : 'walk';
    else if (p.mode && p.mode !== 'idle' && p.mode !== 'carry') anim = p.mode;
    if (p.hop > 0 && p.hop < 1) y += Math.sin(p.hop * Math.PI) * 0.35;
    if (p.shake) x += Math.sin((p.t || 0) * 45) * 0.05;
    // smooth facing (shortest way round)
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.root.position.set(x, y, z);
    this.root.rotation.y = this.yaw;
    this.play(anim);
    this.setHeld(p.held);
    if (this.inst.mixer) this.inst.mixer.update(dt);
  }

  /** World position of the top of the head (for bubbles and name tags). */
  headTop(out) {
    const h = this.inst.bones.head;
    if (h) { h.getWorldPosition(out); out.y += this.hat ? 1.95 : 1.25; }
    else { out.copy(this.root.position); out.y += 2.6; }
    return out;
  }

  dispose(scene) {
    scene.remove(this.root);
    if (this.inst.mixer) this.inst.mixer.stopAllAction();
  }
}
