// Visuals for staff abilities: a glowing ring under staff whose ability is nearly charged (pulsing
// when full), a gathering build-up right before release, a light beam + shockwave on release, an
// aura while the effect lasts, and juggling balls for the bartender. All meshes are pooled and use
// additive blending, so no lights are added (adding lights would recompile every shader).
import { THREE } from './models.js';
import { bus } from './util.js';

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {
  ring: () => canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,1)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  disc: () => canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }),
  beam: () => canvasTex(8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
};

const WINDUP = 0.9;
const BURST_LIFE = 0.75;

export class AbilityFx {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tex = { ring: TEX.ring(), disc: TEX.disc(), beam: TEX.beam() };
    this.geo = {
      plane: new THREE.PlaneGeometry(1, 1),
      beam: new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true).translate(0, 0.5, 0),
      ball: new THREE.SphereGeometry(0.11, 12, 8),
    };
    this.auras = new Map(); // staff -> { ring, disc, balls }
    this.bursts = [];
    this.free = [];
    this.pending = [];
    this.v = new THREE.Vector3();
    bus.on('ability', (a) => { if (!a.game.fastForwarding && this.pending.length < 12) this.pending.push(a); });
  }

  mat(tex, color) {
    return new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  flat(tex, color) {
    const m = new THREE.Mesh(this.geo.plane, this.mat(tex, color));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  aura(a) {
    let o = this.auras.get(a);
    if (!o) {
      o = { ring: this.flat(this.tex.ring, '#ffffff'), disc: this.flat(this.tex.disc, '#ffffff'), balls: null, color: null, spin: 0 };
      this.auras.set(a, o);
    }
    const col = a.ability.color;
    if (o.color !== col) { o.color = col; o.ring.material.color.set(col); o.disc.material.color.set(col); }
    return o;
  }

  update(game, chars, time, dt) {
    // auras
    const live = new Set(game.staff);
    for (const [a, o] of this.auras) {
      if (live.has(a)) continue;
      for (const m of [o.ring, o.disc, ...(o.balls || [])]) { this.group.remove(m); m.material.dispose(); }
      this.auras.delete(a);
    }
    for (const a of game.staff) {
      const cv = chars.get(a);
      const o = this.aura(a);
      const show = cv && cv.root.visible && a.abilityUnlocked() && !a.napping;
      let ringOp = 0, ringS = 2.2, discOp = 0, discS = 2;
      if (show) {
        const p = cv.root.position;
        o.ring.position.set(p.x, p.y + 0.06, p.z);
        o.disc.position.set(p.x, p.y + 0.05, p.z);
        if (a.boosted()) {
          ringOp = 0.75; ringS = 2.5 + Math.sin(time * 10) * 0.12; discOp = 0.35; discS = 2.6;
        } else if (a.windup > 0) {
          const k = 1 - a.windup / WINDUP; // 0 -> 1 as it gathers
          ringOp = 0.55 + 0.45 * k; ringS = 3.6 - 1.9 * k; discOp = 0.25 + 0.6 * k; discS = 1.6 + 0.8 * k;
        } else if (a.charge >= 1) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 6);
          ringOp = 0.45 + 0.35 * pulse; ringS = 2.3 + 0.2 * pulse; discOp = 0.12 * pulse;
        } else if (a.charge >= 0.7) {
          ringOp = ((a.charge - 0.7) / 0.3) * 0.35; ringS = 2.2;
        }
      }
      o.spin += dt * (a.boosted() ? 4 : a.windup > 0 ? 7 : 1);
      o.ring.rotation.set(-Math.PI / 2, 0, o.spin);
      o.ring.visible = ringOp > 0.01; o.ring.material.opacity = ringOp; o.ring.scale.set(ringS, ringS, 1);
      o.disc.visible = discOp > 0.01; o.disc.material.opacity = discOp; o.disc.scale.set(discS, discS, 1);
      // bartender juggles three glowing balls over their head while Juggle lasts
      const juggling = show && a.boosted() && a.ability.id === 'juggle';
      if (juggling && !o.balls) {
        o.balls = ['#c9a4ff', '#ff9fb1', '#9fdcff'].map((c) => { const m = new THREE.Mesh(this.geo.ball, new THREE.MeshBasicMaterial({ color: c })); this.group.add(m); return m; });
      }
      if (o.balls) {
        for (let i = 0; i < 3; i++) {
          const b = o.balls[i];
          b.visible = juggling;
          if (!juggling) continue;
          cv.headTop(this.v);
          const t = time * 5 + (i * Math.PI * 2) / 3;
          b.position.set(this.v.x + Math.cos(t) * 0.5, this.v.y - 0.1 + Math.abs(Math.sin(t)) * 0.55, this.v.z + Math.sin(t) * 0.18);
        }
      }
    }
    // new bursts
    for (const a of this.pending) {
      const cv = chars.get(a);
      if (!cv) continue;
      const ab = a.ability;
      const b = this.free.pop() || { beam: this.addBeam(), wave: this.flat(this.tex.ring, '#ffffff'), flash: this.flat(this.tex.disc, '#ffffff') };
      for (const m of [b.beam, b.wave, b.flash]) { m.visible = true; m.material.color.set(ab.color); }
      const p = cv.root.position;
      b.beam.position.set(p.x, p.y, p.z);
      b.wave.position.set(p.x, p.y + 0.08, p.z);
      b.flash.position.set(p.x, p.y + 0.07, p.z);
      b.age = 0;
      b.radius = ab.radius ? (ab.radius + 0.5) * 2 * 2 : 5; // whirlwind: shows its sweep area (tiles -> world units, diameter)
      this.bursts.push(b);
    }
    this.pending.length = 0;
    for (const b of this.bursts) {
      b.age += dt;
      const k = Math.min(1, b.age / BURST_LIFE);
      const e = 1 - Math.pow(1 - k, 3);
      b.wave.scale.set(1 + e * b.radius, 1 + e * b.radius, 1);
      b.wave.material.opacity = 1 - k;
      b.flash.scale.set(3 + e * 2, 3 + e * 2, 1);
      b.flash.material.opacity = 0.9 * (1 - k) * (1 - k);
      const bw = 1.1 + e * 0.9;
      b.beam.scale.set(bw * (1 - k * 0.6), 6 * (0.6 + 0.4 * e), bw * (1 - k * 0.6));
      b.beam.material.opacity = 0.85 * (1 - k);
      if (k >= 1) { for (const m of [b.beam, b.wave, b.flash]) m.visible = false; this.free.push(b); }
    }
    this.bursts = this.bursts.filter((b) => b.age < BURST_LIFE);
  }

  addBeam() {
    const m = new THREE.Mesh(this.geo.beam, this.mat(this.tex.beam, '#ffffff'));
    m.renderOrder = 3;
    this.group.add(m);
    return m;
  }

  /** 2D layer: a filling charge ring with "!" above the head while gathering power. */
  drawOverlay(ctx, game, chars, projectV, z) {
    for (const a of game.staff) {
      if (!(a.windup > 0)) continue;
      const cv = chars.get(a);
      if (!cv || !cv.root.visible) continue;
      const q = projectV(cv.headTop(this.v));
      if (!q) continue;
      const k = 1 - a.windup / WINDUP;
      const r = 13 * z * (1 + 0.15 * Math.sin(k * Math.PI * 6));
      const y = q.y - 30 * z;
      ctx.save();
      ctx.shadowColor = a.ability.color; ctx.shadowBlur = 12 + 10 * k;
      ctx.beginPath(); ctx.arc(q.x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(q.x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.strokeStyle = a.ability.color; ctx.lineWidth = 3.5 * z; ctx.lineCap = 'round'; ctx.stroke();
      ctx.fillStyle = a.ability.color; ctx.font = `900 ${Math.round(17 * z)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', q.x, y + 1);
      ctx.restore();
    }
  }
}
