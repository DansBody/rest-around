// Floating numbers and little particles (puffs, sparkles, steam, crumbs, hearts). Runs on real time.
import { assets } from './assets.js';
import { DISPLAY_FONT } from './placeholder.js';

export class FX {
  constructor() { this.items = []; }

  text(x, y, text, icon, color = '#fff') {
    // stack texts spawned at the same spot so they don't overlap
    const near = this.items.filter((i) => i.type === 'text' && Math.abs(i.x - x) < 30 && Math.abs(i.y0 - y) < 30 && i.age < 0.4).length;
    this.items.push({ type: 'text', x, y0: y - near * 26, y: y - near * 26, text, icon, color, age: 0, life: 1.6 });
  }
  puff(x, y, color = '#fff', n = 1) {
    for (let i = 0; i < n; i++) this.items.push({ type: 'puff', x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 14, r: 5 + Math.random() * 5, color, age: 0, life: 0.9 + Math.random() * 0.4 });
  }
  sparkle(x, y, n = 6, color = '#ffe27a') {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 50; this.items.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, color, age: 0, life: 0.7 + Math.random() * 0.3 }); }
  }
  hearts(x, y, n = 3) {
    for (let i = 0; i < n; i++) this.items.push({ type: 'heart', x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 20, age: -i * 0.12, life: 1.2 });
  }
  crumbs(x, y, color = '#d9a066') {
    for (let i = 0; i < 3; i++) this.items.push({ type: 'crumb', x, y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 20, color, age: 0, life: 0.5 });
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      if (p.age < 0) continue;
      if (p.type === 'text') p.y = p.y0 - 55 * easeOut(p.age / p.life);
      else if (p.type === 'crumb' || p.type === 'spark') { p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    this.items = this.items.filter((p) => p.age < p.life);
    if (this.items.length > 400) this.items.splice(0, this.items.length - 400);
  }

  draw(ctx) {
    for (const p of this.items) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      ctx.save();
      if (p.type === 'text') {
        const pop = p.age < 0.15 ? 0.6 + (p.age / 0.15) * 0.5 : p.age < 0.25 ? 1.1 - ((p.age - 0.15) / 0.1) * 0.1 : 1;
        ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.translate(p.x, p.y); ctx.scale(pop, pop);
        ctx.font = `600 24px ${DISPLAY_FONT}`; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(p.text).width;
        const iw = p.icon ? 24 : 0;
        const x0 = -(tw + iw) / 2;
        if (p.icon) assets.drawIcon(ctx, p.icon, x0 + 10, 0, 24);
        ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#5b3a28';
        ctx.strokeText(p.text, x0 + iw, 1); ctx.fillStyle = p.color; ctx.fillText(p.text, x0 + iw, 1);
      } else if (p.type === 'puff') {
        ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'spark') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.age * 6);
        ctx.fillRect(-3, -3, 6, 6);
      } else if (p.type === 'heart') {
        ctx.globalAlpha = 1 - k; assets.drawIcon(ctx, 'emote_heart', p.x, p.y, 18);
      } else if (p.type === 'crumb') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, t), 3);
