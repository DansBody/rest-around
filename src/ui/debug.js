// Hidden debug panel (backtick key): time scale, cheats, spawns, breakage, overlays, stuck-agent report.
import { h } from '../util.js';
import { assets } from '../assets.js';
import { DAY } from '../data.js';

export class DebugPanel {
  constructor(game, ui, root) {
    this.game = game; this.ui = ui;
    this.el = h('div.card#debug');
    root.appendChild(this.el);
    this.render();
    this.stats = h('div.muted');
    this.el.appendChild(this.stats);
  }
  toggle() { this.el.classList.toggle('show'); }
  get open() { return this.el.classList.contains('show'); }

  render() {
    const g = this.game;
    const speedBtns = [1, 4, 16].map((s) => h('button.btn.small' + (g.timeScale === s ? '.primary' : ''), { onclick: () => { g.timeScale = s; this.rerender(); } }, s + '×'));
    const chk = (label, key) => {
      const c = h('input', { type: 'checkbox' });
      c.checked = g.debug[key];
      c.addEventListener('change', () => { g.debug[key] = c.checked; });
      return h('label', c, label);
    };
    const placeholders = assets.placeholderIds();
    this.el.replaceChildren(
      h('b', '🐞 Debug'),
      h('div.btnrow', h('span.muted', 'Speed'), ...speedBtns),
      h('div.btnrow',
        h('button.btn.small', { onclick: () => { g.state.coins += 1000; g.changed('coins'); } }, '+1000 coins'),
        h('button.btn.small', { onclick: () => g.eco.addPoints(100) }, '+100 pts')),
      h('div.btnrow',
        h('button.btn.small', { onclick: () => { if (!g.spawnCustomer(true)) g.toast('Doorway busy'); } }, 'Spawn guest'),
        h('button.btn.small', { onclick: () => this.breakOne() }, 'Break facility')),
      h('div.btnrow',
        h('button.btn.small', { onclick: () => { const c = g.spawnCustomer(true); if (c) c.makeRude(); else g.toast('Doorway busy'); } }, 'Rude guest'),
        h('button.btn.small', { onclick: () => this.dash() }, 'Dine & dash')),
      h('div.btnrow',
        h('button.btn.small', { onclick: () => { g.state.clock = DAY.length - 5; } }, 'Skip to closing'),
        h('button.btn.small', { onclick: () => { for (const a of g.staff) a.energy = 0; } }, 'Drain energy')),
      chk('Pathfinding grid', 'grid'),
      chk('Agent state labels', 'labels'),
      chk(`Asset overlay (${placeholders.length} placeholders)`, 'assets'),
      h('details', h('summary.muted', 'Placeholder asset ids'), h('div.muted', { style: { maxHeight: '120px', overflow: 'auto', fontSize: '11px' } }, placeholders.join(', '))),
      this.stats || h('div'));
  }
  rerender() { const s = this.stats; this.render(); if (s) this.el.appendChild(s); }

  /** The next guest to finish eating runs off without paying (or the one eating now). */
  dash() {
    const g = this.game, c = g.customers.find((x) => x.state === 'eating') || g.customers.find((x) => ['waitFood', 'waitOrder'].includes(x.state));
    if (!c) return g.toast('Nobody is seated yet', 'bad');
    c.forceDash = true;
    g.toast(`${c.name} will dine and dash`);
  }

  breakOne() {
    const g = this.game;
    const list = g.world.furniture.filter((f) => (f.kind === 'toilet' || f.kind === 'arcade') && !f.broken);
    if (!list.length) return g.toast('No working restroom or reading nook to break (buy one in Build → Nooks)', 'bad');
    g.eco.breakFacility(list[Math.floor(Math.random() * list.length)]);
  }

  update() {
    if (!this.open || !this.stats) return;
    const g = this.game;
    const stuck = g.agents.filter((a) => a.stuckT > 8);
    this.stats.textContent = `agents ${g.agents.length} · jobs ${g.jobs.list.length} · trash ${g.world.trash.length} · fps ${Math.round(g.fps || 0)} · stuck ${stuck.length} · sim ${g.simTime.toFixed(0)}s`;
  }
}
