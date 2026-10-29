// Battle prototype screen (design/combat/DESIGN.md §9, B layout; mock design/battle-mock/side.html): the team on a
// wooden board on the left facing right, the grey things along a grey road on the right, three cards in the thumb
// zone. One fixed commission (battle/data.js COMMISSION), not tied to the café's economy yet: nothing is paid in.
// The rules live in battle/engine.js; this file only draws them and plays their events back as animation.
// Opened from the debug panel or with ?battle in the URL. The café waits (game.hold) while it is on screen.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { NIGHT_FROM } from '../data.js';
import { defaultName } from '../staff.js';
import { models } from '../models.js';
import { keyColors } from '../spriteview.js';
import { CARDS, FOES, PASSIVES, DRINKS, COMMISSION, TEAM } from '../battle/data.js';
import { Run, autoMove } from '../battle/engine.js';
import { ULTS, playUlt, preloadUlts } from './ultimate.js';

const W = 390, H = 844;
/** The staff member wearing `id`, if the café has one: their name and colours go into the battle. */
const staffOf = (game, id) => (game && game.staff.find((s) => s.look.model === id)) || null;
/** What the team member wearing `id` is called: the name the player gave the staff member, else what they are. */
export const mateName = (game, id) => (staffOf(game, id) || {}).name || defaultName(id);
// where each team member stands on the board (left, top of a 1.4× sprite)
export const MATES = { bbaekko: [2, 236], cheetie: [90, 266], mochalatte: [-2, 326], heehee: [92, 372] };
// foe spots along the road: the first comes centre stage, then near right, far right, and low centre
const SLOTS = [{ left: 172, top: 146 }, { left: 266, top: 304, right: true }, { left: 266, top: 100, right: true }, { left: 186, top: 378 }];
// the cut-outs: height per width, and where the × eyes sit (fractions of width / height)
const ART = { clock: { ar: 1.29, eyes: [[0.28, 0.46], [0.55, 0.44]] }, phone: { ar: 1.94, eyes: [[0.2, 0.36], [0.5, 0.34]] }, bill: { ar: 1.705, eyes: [[0.37, 0.24]] } };
const ROUTE_ICON = { fight: '⚔', rest: '☕', boss: '✦' };

// ------------------------------------------------------------------ pixel sprites from the game's own sheets
const sheets = {}, painted = {};
/** A team member's sheet; a cast sheet's key slots (spriteview.js keyColors) painted in `look`'s colours. */
function sheet(id, look) {
  sheets[id] ||= fetch(`assets/sprites/${id}/${id}.json`).then((r) => r.json()).then(async (meta) => {
    const img = new Image();
    img.src = `assets/sprites/${id}/${meta.image}`;
    await img.decode();
    return { meta, img };
  });
  return sheets[id].then((s) => {
    if (!s.meta.keys) return s;
    const cols = keyColors(s.meta, models.def(id), look), k = id + [...cols.values()].join();
    if (!painted[k]) {
      const c = h('canvas', { width: s.img.width, height: s.img.height }), g = c.getContext('2d');
      g.drawImage(s.img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let o = 0; o < px.length; o += 4) {
        const rgb = px[o + 3] && cols.get('#' + ((1 << 24) | (px[o] << 16) | (px[o + 1] << 8) | px[o + 2]).toString(16).slice(1));
        if (rgb) [px[o], px[o + 1], px[o + 2]] = rgb;
      }
      g.putImageData(d, 0, 0);
      painted[k] = { meta: s.meta, img: c };
    }
    return painted[k];
  });
}
/** A team member on screen: a resting loop (Idle, or Nap once they sit out), or a clip for a moment. */
export class Mate {
  constructor(id, scale = 1.4, look) {
    this.id = id; this.clip = 'Idle'; this.rest = 'Idle'; this.until = 0; this.t0 = Math.random() * 2;
    this.canvas = h('canvas', { width: 64, height: 80, style: { width: 64 * scale + 'px', height: 80 * scale + 'px' } });
    sheet(id, look).then((s) => {
      // a taller cell (the 64×96 paper-doll grid) grows upward: same feet row from the bottom, so the box stays 80 tall
      const H = s.meta.grid.height || 80;
      if (H !== 80) Object.assign(this.canvas, { height: H }).style.cssText += `height:${H * scale}px;margin-top:${(80 - H) * scale}px`;
      this.s = s;
    }).catch(() => {});
  }
  /** A clip for sec seconds (its own length when not given), from its first frame. */
  play(clip, sec) {
    const c = this.s && this.s.meta.clips[clip];
    this.clip = clip; this.from = performance.now(); this.until = this.from + (sec ?? (c ? c.duration : 0.6)) * 1000;
  }
  draw(now) {
    if (!this.s) return;
    if (this.until && now > this.until) { this.clip = this.rest; this.until = 0; }
    const clip = this.s.meta.clips[this.clip] || this.s.meta.clips.Idle, f = clip.frames.f;
    const sec = this.until ? Math.max(0, now - this.from) / 1000 : now / 1000 + this.t0;   // a frame's time can be a hair before from
    const [x, y, w, hh] = f[Math.floor(sec * clip.fps) % f.length];
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.s.img, x, y, w, hh, 0, 0, w, hh);
  }
}
/** The face of a team member for a card's corner. */
function face(id, look) {
  const c = h('canvas', { width: 40, height: 34 });
  sheet(id, look).then(({ meta, img }) => {
    const [x, y] = meta.clips.Idle.frames.f[0], top = meta.clips.Idle.anchors.f[0].top;
    c.getContext('2d').drawImage(img, x + 12, y + top - 2, 40, 34, 0, 0, 40, 34);
  }).catch(() => {});
  return c;
}

// ------------------------------------------------------------------ words
export function cardLines(id) {
  const d = CARDS[id], fx = d.fx, out = [];
  if (d.type === 'junk') return [t('Cannot be played. Gone at the end of the turn.')];
  if (fx.cancel) out.push(t('A foe skips its move this turn.'));
  if (fx.dmg) {
    const v = { n: fx.dmg, h: fx.hits };
    out.push(fx.all ? (fx.hits > 1 ? t('{n} damage ×{h} to every foe', v) : t('{n} damage to every foe', v)) : (fx.hits > 1 ? t('{n} damage ×{h}', v) : t('{n} damage', v)));
  }
  if (fx.rnd) out.push(t(fx.all ? '{a}–{b} damage to every foe' : '{a}–{b} damage to a random foe', { a: fx.rnd[0], b: fx.rnd[1] }));
  if (fx.fade) out.push(t('Colour +{n}', { n: fx.fade }));
  if (fx.foam) out.push(t('Foam +{n}', { n: fx.foam }));
  if (fx.heal) out.push(t('Chill +{n}', { n: fx.heal }));
  if (fx.draw) out.push(t('Draw {n}', { n: fx.draw }));
  if (fx.boost) out.push(t('Next attack +{n}', { n: fx.boost }));
  if (fx.nextEnergy) out.push(t('Energy +{n} next turn', { n: fx.nextEnergy }));
  if (fx.conjure) out.push(t('A random card, free. It may come out knotted.'));
  if (fx.recall) out.push(t('The last card played comes back.'));
  return out;
}
const KIND = { attack: 'Attack', skill: 'Skill', junk: 'Knot' };
export function intentWords(it) {
  switch (it.k) {
    case 'hit': return [t('Attack {n}', { n: it.dmg }), ''];
    case 'ring': return [t('Ringing Blast {n}', { n: it.dmg }), 'alert'];
    case 'wind': return [t('Winding up'), 'alert'];
    case 'nap': return [t('Snoozing'), 'calm'];
    case 'jam': return [t('Jam: next card +{n}', { n: it.n }), ''];
    case 'call': return [t('Calls for help'), ''];
    case 'steal': return [t('Steal {n} coins', { n: it.n }), 'alert'];
    case 'flee': return [t('Runs off with the coins'), 'alert'];
  }
  return ['', ''];
}
const isNight = () => { const hr = new Date().getHours(); return hr >= NIGHT_FROM || hr < 6; };

// ------------------------------------------------------------------ the screen
export function openBattle(game) {
  if (document.getElementById('battle')) return;
  new BattleScreen(game).open();
}

export class BattleScreen {
  constructor(game) {
    this.game = game;
    this.night = isNight();
    this.run = new Run(COMMISSION, { night: this.night, team: TEAM });
    this.speed = 1; this.auto = false; this.busy = false;
    this.sel = null; this.selDrink = null;
    this.mates = new Map();   // id → Mate on the stage
    this.extra = [];          // Mates on sheets (the brief)
    this.fv = new Map();      // foe uid → its view
    this.seen = new Set();    // card uids already on screen (new ones are dealt in)
  }

  name(id) { return mateName(this.game, id); }
  look(id) { return (staffOf(this.game, id) || {}).look; }
  /** The night rule (battle/data.js RULES.nightMul), on whoever wears the bunny. */
  nightNote() { return t('Night: {who} −20%', { who: this.name('bbaekko') }); }
  /** Card `id`'s cut-in; the performer's sprite frame goes along for when there is no 3D stage. */
  ult(id, foe) {
    const m = ULTS[id] && this.mates.get(ULTS[id].who);
    return playUlt(this.frame, id, this.speed, { foe, sprite: m && m.canvas });
  }

  open() {
    audio.unlock();
    if (this.game) this.game.hold = true;
    this.frame = h('div.bt-frame', { onclick: (e) => { if (e.target === this.frame || e.target.closest('.bt-geo')) this.deselect(); } });
    this.root = h('div#battle', this.frame);
    document.body.appendChild(this.root);
    this.fit = () => { this.frame.style.transform = `scale(${Math.min(this.root.clientWidth / W, this.root.clientHeight / H)})`; };
    this.fit();
    addEventListener('resize', this.fit);
    const loop = (now) => {
      if (!this.root.isConnected) return;
      requestAnimationFrame(loop);
      for (const m of this.mates.values()) m.draw(now);
      for (const m of this.extra) if (m.canvas.isConnected) m.draw(now);
    };
    requestAnimationFrame(loop);
    preloadUlts();   // the cut-ins' 3D stage and foe models, ready before the first one is needed
    this.brief();
  }
  close() {
    removeEventListener('resize', this.fit);
    this.auto = false;
    audio.setScene(null);
    this.root.remove();
    if (this.game) this.game.hold = false;
  }
  wait(ms) { return new Promise((r) => setTimeout(r, ms / this.speed)); }

  // ---------------- the backdrop: the grey world, the top bar, the board
  backdrop() {
    const geo = h('div.bt-layer.bt-geo', { html: `<svg viewBox="0 0 390 844" preserveAspectRatio="none" aria-hidden="true">
      <defs><pattern id="bt-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#9A9590"/></pattern></defs>
      <ellipse cx="250" cy="300" rx="230" ry="70" fill="none" stroke="#1F2A4A" stroke-width="1.5" transform="rotate(-16 250 300)"/>
      <ellipse cx="260" cy="290" rx="150" ry="110" fill="none" stroke="#1F2A4A" stroke-width="1" stroke-dasharray="3 5" transform="rotate(20 260 290)"/>
      <path d="M-10 560 L-10 470 L400 236 L400 330 Z" fill="#CBC6BF"/>
      <path d="M-10 560 L-10 470 L400 236 L400 330 Z" fill="url(#bt-dots)" opacity=".8"/>
      <path d="M-10 470 L400 236 M-10 560 L400 330" stroke="#1F2A4A" stroke-width="2"/>
      <path d="M40 520 L110 480 M170 446 L240 406 M300 372 L370 332" stroke="#fff" stroke-width="4"/>
      <circle cx="262" cy="262" r="86" fill="#BDB8B2"/>
      <path d="M262 200 l9 38 38 9 -38 9 -9 38 -9 -38 -38 -9 38 -9z" fill="#fff"/>
      <circle cx="356" cy="112" r="9" fill="#1F2A4A"/>
      <circle cx="150" cy="128" r="14" fill="#1F2A4A"/><path d="M144 122 l12 12 M156 122 l-12 12" stroke="#fff" stroke-width="3"/>
      <rect x="0" y="590" width="390" height="254" fill="#E6ECF5"/>
      <path d="M0 590 L390 572 L390 600 L0 604z" fill="#1F2A4A"/></svg>` },
    h('i.bt-slice', { style: { left: '-10px', top: '236px', width: '96px', transform: 'rotate(-12deg)' } }),
    h('i.bt-slice', { style: { right: '-6px', top: '548px', width: '60px', height: '5px', background: 'var(--os-ink)' } }));
    return geo;
  }
  topBar() {
    const c = this.run.c;
    this.turnEl = h('b', '01');
    this.routeEl = h('div.bt-route');
    this.renderRoute();
    return h('div.bt-top',
      h('button.bt-back', { title: t('Give up'), onclick: () => this.giveUp() }, '‹'),
      h('div.bt-title', h('span.k', t(c.kind === 'Hunt' ? 'Hunt' : 'Explore') + ' · ' + t(c.client)), h('h1', t(c.title))),
      h('div.bt-turn', h('small', t('Turn')), ' ', this.turnEl),
      this.routeEl);
  }
  renderRoute() {
    const r = this.run, nodes = r.c.nodes;
    const kids = [];
    nodes.forEach((n, i) => {
      if (i) kids.push(h('b'));
      kids.push(h('i' + (n.type === 'boss' ? '.boss' : '') + (i < r.node ? '.done' : i === r.node ? '.now' : ''), ROUTE_ICON[n.type]));
    });
    kids.push(h('span', `${r.node + 1} / ${nodes.length}` + (this.night ? ' · ' + this.nightNote() : '')));
    this.routeEl.replaceChildren(...kids);
  }

  // ---------------- the brief: who asked, the route, the team and their passives
  brief() {
    const c = this.run.c;
    this.extra = TEAM.map((id) => new Mate(id, 1, this.look(id)));
    const sheetEl = h('div.bt-sheet', { style: { top: '120px' } },
      h('div.bt-head', t(c.title)),
      h('span.bt-k', t(c.kind === 'Hunt' ? 'Hunt' : 'Explore') + ' · ' + t('from {who}', { who: t(c.client) })),
      h('div.bt-plea', '“' + t(c.plea) + '”'),
      h('div.bt-row', h('span.bt-lab', t('Route')), ...c.nodes.map((n) => h('span.bt-pill', ROUTE_ICON[n.type] + ' ' + t(n.type === 'fight' ? 'Fight' : n.type === 'rest' ? 'Coffee stop' : 'Boss')))),
      h('div.bt-row', h('span.bt-lab', t('Team · on the board, these work by themselves'))),
      h('div.bt-mates', TEAM.map((id, i) => {
        const p = PASSIVES[id];
        return h('div', this.extra[i].canvas, h('b', this.name(id)), h('em' + (p.bad ? '.bad' : ''), t(p.name)), h('em', t(p.desc)));
      })),
      h('div.bt-row', h('span.bt-lab', t('Drinks brought from the café')), ...this.run.drinks.map((d) => h('span.bt-pill', t(DRINKS[d].name)))),
      this.night ? h('div.bt-row', h('span.bt-pill.coral', this.nightNote())) : null,
      h('div.bt-acts',
        h('button.bt-btn', { onclick: () => this.close() }, t('Back to the café')),
        h('button.bt-btn.go', { onclick: () => { audio.play('open'); this.startNode(); } }, t('Head out'))));
    this.frame.replaceChildren(this.backdrop(), sheetEl);
  }

  startNode() {
    audio.setScene('battle');   // the battle loop from the first fight until the result
    const node = this.run.here;
    if (node.type === 'rest') return this.restStop();
    this.fight();
  }

  // ---------------- a fight
  fight() {
    const b = this.b = this.run.fight();
    this.fv.clear(); this.mates.clear(); this.seen.clear();
    this.sel = null; this.selDrink = null;
    this.foeLayer = h('div.bt-layer', { style: { pointerEvents: 'none' } });
    const crew = h('div.bt-layer', { style: { pointerEvents: 'none' } }, TEAM.map((id) => {
      const m = new Mate(id, 1.4, this.look(id));
      this.mates.set(id, m);
      const [x, y] = MATES[id];
      return m.el = h('div.bt-mate', { style: { left: x + 'px', top: y + 'px' } }, h('i.shadow'), m.canvas, h('span.tag', this.name(id)),
        id === 'cheetie' ? h('span.buff', { style: { left: '-4px', top: '30px' } }, t('Mind Reading')) : null,
        id === 'heehee' ? h('span.buff', { style: { left: '76px', top: '40px' } }, t('Blooming Tips')) : null);
    }));
    // status, hand, bottom bar
    this.chillEl = h('div.bt-chill', h('div.lab', 'CHILL ', h('b', ''), ' / ' + b.chillMax), h('div.bar', h('i')));
    this.foamEl = h('div.bt-foam', h('span', '0'), h('small', t('Foam')));
    this.drinksEl = h('div.bt-drinks');
    this.energyEl = h('div.bt-energy', h('span.beans'), h('b', '3'), h('small', t('Energy')));
    this.pilesEl = h('div.bt-piles');
    this.handEl = h('div.bt-hand', this.energyEl, this.pilesEl);
    this.autoBtn = h('button', { onclick: () => this.toggleAuto() }, t('Auto'));
    this.speedBtn = h('button', { onclick: () => { this.speed = this.speed === 1 ? 2 : 1; this.speedBtn.classList.toggle('on', this.speed === 2); } }, '2×');
    this.endBtn = h('button.bt-end', { onclick: () => this.endTurn() }, t('End turn'));
    this.devBtn = h('button.bt-dev', { title: t('Plays the cut-in without changing the fight'), onclick: (e) => { e.stopPropagation(); this.devMenu(); } }, t('Test ultimate'));   // prototype only
    this.hintEl = h('span');
    this.fxEl = h('div.bt-layer.bt-fx');
    this.frame.replaceChildren(this.backdrop(), this.topBar(), h('div.bt-floor'), crew, this.foeLayer,
      h('div.bt-status', this.chillEl, this.foamEl, this.drinksEl), this.handEl,
      h('div.bt-hint', this.hintEl), h('div.bt-modes', this.autoBtn, this.speedBtn), this.devBtn, this.endBtn, this.fxEl);
    this.autoBtn.classList.toggle('on', this.auto);
    this.speedBtn.classList.toggle('on', this.speed === 2);
    b.foes.forEach((f, i) => { f.slot = i; this.addFoeView(f); });
    this.disp = { chill: b.chill, foam: 0 };
    this.sync();
    this.act(() => b.start(), true);
  }

  addFoeView(f, enter = false) {
    if (f.slot == null) { const used = new Set(this.b.foes.filter((x) => x.alive && x.slot != null).map((x) => x.slot)); f.slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 3; }
    const def = f.def, slot = SLOTS[f.slot], art = ART[def.img], hgt = Math.round(def.w * art.ar);
    const eye = Math.max(10, Math.min(20, Math.round(def.w * 0.16)));
    const v = { f, disp: { hp: f.hp, fade: f.fade, stolen: 0 } };
    v.tags = h('div.tags');
    v.loot = h('span.bt-loot', { style: { display: 'none' } });
    v.body = h('div.bt-body', { style: { width: def.w + 'px', height: hgt + 'px' } },
      h('img', { src: `assets/battle/${def.img}.webp`, alt: '' }),
      ...art.eyes.map(([x, y]) => h('i.bt-eye', { style: { left: Math.round(x * def.w) + 'px', top: Math.round(y * hgt) + 'px', width: eye + 'px', height: eye + 'px', fontSize: Math.round(eye * 0.7) + 'px' } }, '×')),
      def.badge ? h('span.bt-badge', def.badge) : null, v.loot);
    v.hpN = h('span.n'); v.fade = h('span.bt-fade');
    v.el = h('div.bt-foe' + (slot.right ? '.right' : '') + (enter ? '.enter' : ''), { style: { left: slot.left + 'px', top: slot.top + 'px', pointerEvents: 'auto' }, onclick: (e) => { e.stopPropagation(); this.tapFoe(f); } },
      v.tags, v.body, h('div.bt-hp', v.hpN, v.fade), h('div.bt-name', t(def.name)));
    this.foeLayer.appendChild(v.el);
    this.fv.set(f.uid, v);
    this.drawFoe(v);
    return v;
  }
  drawFoe(v) {
    const f = v.f, b = this.b;
    v.hpN.textContent = v.disp.hp;
    v.fade.replaceChildren(...Array.from({ length: f.fadeMax }, (_, i) => h('i' + (i < v.disp.fade ? '.c' : ''))));
    v.loot.style.display = v.disp.stolen ? '' : 'none';
    v.loot.textContent = '−' + v.disp.stolen;
    v.el.classList.toggle('colored', f.colored);
    v.el.classList.toggle('paused', f.cancelled);
    const tags = [];
    if (f.alive) {
      if (f.colored) tags.push(h('span.bt-intent.calm', t('Colour back: skips its move')));
      else if (f.cancelled) tags.push(h('span.bt-intent.calm', t('Paused: skips its move')));
      else { const [w, cls] = intentWords(f.intent); tags.push(h('span.bt-intent' + (cls ? '.' + cls : ''), w)); }
      if (b.has('cheetie')) tags.push(h('span.bt-intent.ghost', t('Next: {what}', { what: intentWords(b.nextIntent(f))[0] })));
    }
    v.tags.replaceChildren(...tags);
    const aim = this.sel && CARDS[this.sel.id].target === 'foe' && f.alive;
    v.el.classList.toggle('aim', !!aim);
  }

  /** Everything on screen from the engine's state (after events have played out). */
  sync() {
    const b = this.b;
    this.disp.chill = b.chill; this.disp.foam = b.foam;
    for (const v of this.fv.values()) { v.disp.hp = v.f.hp; v.disp.fade = v.f.fade; v.disp.stolen = v.f.alive ? v.f.stolen : 0; if (v.f.alive) this.drawFoe(v); }
    this.turnEl.textContent = String(b.turn).padStart(2, '0');
    this.drawStatus();
    this.drawHand();
    this.drawHint();
  }
  drawStatus() {
    const b = this.b, d = this.disp;
    this.chillEl.querySelector('b').textContent = Math.max(0, d.chill);
    this.chillEl.querySelector('.bar i').style.width = Math.max(0, d.chill) / b.chillMax * 100 + '%';
    this.chillEl.classList.toggle('low', d.chill <= b.chillMax * 0.3);
    this.foamEl.firstChild.textContent = Math.max(0, d.foam);
    this.foamEl.classList.toggle('zero', d.foam <= 0);
    this.energyEl.querySelector('b').textContent = b.energy;
    this.energyEl.querySelector('.beans').innerHTML = Array.from({ length: Math.max(3, b.energy) }, (_, i) =>
      `<svg class="${i < b.energy ? '' : 'off'}" width="14" height="16" viewBox="0 0 7 8" shape-rendering="crispEdges"><path d="M2 0h3v1h1v6H5v1H2V7H1V1h1z" fill="#C8894E"/><path d="M3 1h1v2H3zM4 3h1v2H4zM3 5h1v2H3z" fill="#1F2A4A"/></svg>`).join('');
    this.energyEl.classList.toggle('jam', b.jam > 0);
    this.energyEl.dataset.jam = t('Next card +{n}', { n: b.jam });
    this.pilesEl.replaceChildren(h('div', t('Draw pile {n}', { n: b.draw.length })), h('div', t('Discard {n}', { n: b.discard.length })));
    this.drinksEl.replaceChildren(...[0, 1].map((i) => {
      const id = b.drinks[i];
      if (!id) return h('button.bt-drink.empty', h('small', t('Empty')));
      return h('button.bt-drink' + (this.selDrink === i ? '.sel' : ''), { title: t(DRINKS[id].name), onclick: (e) => { e.stopPropagation(); this.tapDrink(i); } },
        drinkIcon(id), h('small', t(DRINKS[id].name)));
    }));
    if (this.endBtn) this.endBtn.disabled = this.busy || !!b.over || this.auto;
    if (this.devBtn) this.devBtn.disabled = this.busy || !!b.over || this.auto;
  }
  drawHand() {
    const b = this.b, n = b.hand.length, x0 = 80, span = 306, cw = 98;
    const step = n <= 3 ? 104 : (span - cw) / (n - 1);
    const start = n <= 3 ? x0 + (span - (cw + (n - 1) * step)) / 2 : x0;
    for (const el of this.handEl.querySelectorAll('.bt-card')) el.remove();
    let dealt = 0;
    b.hand.forEach((c, i) => {
      const el = this.cardEl(c, b);
      const mid = (n - 1) / 2, sel = this.sel === c;
      el.style.left = Math.round(start + i * step) + 'px';
      el.style.top = (sel ? 0 : 18 + Math.abs(i - mid) * 6) + 'px';
      el.style.transform = sel ? 'rotate(0deg) scale(1.04)' : `rotate(${(i - mid) * 4}deg)`;
      if (!this.seen.has(c.uid)) { this.seen.add(c.uid); el.classList.add('deal'); el.style.animationDelay = dealt++ * 70 + 'ms'; }
      el.onclick = (e) => { e.stopPropagation(); this.tapCard(c, el); };
      this.handEl.appendChild(el);
    });
  }
  /** A card as drawn in the hand or offered after a fight (b given: the live cost and whether it can be played). */
  cardEl(c, b) {
    const d = CARDS[c.id], cost = b ? b.cost(c) : this.cardCost(c.id);
    const off = b && !b.canPlay(c);
    return h('button.bt-card' + (c.temp ? '.temp' : '') + (d.type === 'junk' ? '.junk' : '') + (off ? '.off' : '') + (b && this.sel === c ? '.sel' : ''), { 'data-uid': c.uid },
      h('span.cost' + (b && b.jam && !c.free ? '.up' : ''), String(cost)),
      h('span.who', face(d.who, this.look(d.who))),
      h('h3', t(d.name)),
      h('p', this.lines(c.id).map((l, i) => [i ? h('br') : null, l])),
      h('span.kind', t(KIND[d.type])));
  }
  /** A card's rules text and cost outside a fight (the real-time screen has its own). */
  lines(id) { return cardLines(id); }
  cardCost(id) { return CARDS[id].cost; }
  drawHint() {
    const b = this.b;
    let s = '';
    if (this.auto) s = t('Auto is playing');
    else if (this.busy || b.over) s = '';
    else if (this.selDrink != null) s = t('Tap the drink again to drink it');
    else if (this.sel) s = CARDS[this.sel.id].target === 'foe' && b.needsTarget(this.sel) ? t('Tap a foe') : t('Tap the card again to play it');
    else if (!b.hand.some((c) => b.canPlay(c))) s = t('Out of moves: end the turn');
    this.hintEl.textContent = s;
  }

  // ---------------- input
  deselect() { if (this.sel || this.selDrink != null) { this.sel = null; this.selDrink = null; this.drawHand(); this.drawStatus(); this.refreshAim(); this.drawHint(); } }
  refreshAim() { for (const v of this.fv.values()) if (v.f.alive) this.drawFoe(v); }
  tapCard(c, el) {
    const b = this.b;
    if (this.busy || this.auto || b.over) return;
    if (!b.canPlay(c)) {
      el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
      audio.play('error');
      this.toastHint(CARDS[c.id].type === 'junk' ? t('A knotted spell cannot be played') : t('Not enough energy'));
      return;
    }
    if (this.sel === c) {
      if (CARDS[c.id].target === 'foe' && b.needsTarget(c)) return;
      return this.playCard(c.uid, null);
    }
    audio.play('click');
    this.sel = c; this.selDrink = null;
    this.drawHand(); this.drawStatus(); this.refreshAim(); this.drawHint();
  }
  tapFoe(f) {
    if (this.busy || this.auto || !this.sel || !f.alive) return;
    if (CARDS[this.sel.id].target !== 'foe') return;
    this.playCard(this.sel.uid, f.uid);
  }
  tapDrink(i) {
    if (this.busy || this.auto || this.b.over) return;
    if (this.selDrink === i) return this.drink(i);
    audio.play('click');
    this.selDrink = i; this.sel = null;
    this.drawHand(); this.drawStatus(); this.refreshAim(); this.drawHint();
  }
  toastHint(s) {
    this.hintEl.textContent = s;
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.drawHint(), 1200);
  }
  toggleAuto() {
    this.auto = !this.auto;
    this.autoBtn.classList.toggle('on', this.auto);
    this.sel = null; this.selDrink = null;
    this.sync();
    if (this.auto) this.autoStep();
  }

  /** Development: pick a cut-in and a 3D foe and play it on the spot (the fight itself is untouched). */
  devMenu() {
    if (this.busy || !this.b || this.b.over) return;
    const old = this.frame.querySelector('.bt-devmenu');
    if (old) return old.remove();
    const menu = h('div.bt-devmenu', Object.entries(ULTS).flatMap(([id, u]) => ['clock', 'phone'].map((foe) =>
      h('button', { onclick: (e) => { e.stopPropagation(); menu.remove(); this.devUlt(id, u.who, foe); } }, t(u.title) + ' → ' + t(FOES[foe].name)))));
    this.frame.appendChild(menu);
  }
  async devUlt(id, who, foe = 'clock') {
    if (this.busy || !this.b || this.b.over) return;
    this.busy = true;
    this.drawStatus(); this.drawHint();
    audio.unlock();
    this.mateAct(who, 'Work');
    await this.ult(id, foe);
    const v = [...this.fv.values()].find((x) => x.f.alive);
    if (v && id === 'timestop') { this.shatter(v); await this.wait(500); this.drawFoe(v); }
    this.busy = false;
    this.sync();
  }
  playCard(uid, foe) { this.sel = null; return this.act(() => this.b.play(uid, foe)); }
  drink(i) { this.selDrink = null; return this.act(() => this.b.useDrink(i)); }
  endTurn() { if (this.busy || this.auto || this.b.over) return; audio.play('click'); return this.act(() => this.b.endTurn()); }

  /** Run one engine action and play its events back; then the next auto move, or the end of the fight. */
  async act(fn, quiet = false) {
    if (this.busy) return;
    const ev = fn();
    if (!ev) return;
    this.busy = true;
    this.drawStatus(); this.drawHint();
    if (!quiet) this.drawHand();
    await this.playEvents(ev);
    this.busy = false;
    this.sync();
    if (this.b.over) return this.fightOver();
    if (this.auto) this.autoStep();
  }
  async autoStep() {
    await this.wait(380);
    if (!this.auto || this.busy || !this.b || this.b.over || !this.root.isConnected) return;
    const m = autoMove(this.b);
    if (!m) return this.act(() => this.b.endTurn());
    if (m.drink != null) return this.act(() => this.b.useDrink(m.drink));
    this.sel = this.b.hand.find((c) => c.uid === m.uid);
    this.drawHand();
    await this.wait(240);
    this.sel = null;
    return this.act(() => this.b.play(m.uid, m.foe));
  }

  // ---------------- playback
  where(uid) {
    const v = this.fv.get(uid);
    if (!v) return [280, 260];
    const r = v.body, el = v.el;
    return [el.offsetLeft + r.offsetLeft + r.offsetWidth / 2, el.offsetTop + r.offsetTop + r.offsetHeight * 0.35];
  }
  pop(x, y, text, cls = '') {
    const el = h('div.bt-pop' + (cls ? '.' + cls.split(' ').join('.') : ''), { style: { left: x + 'px', top: y + 'px' } }, text);
    this.fxEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  banner(text, cls = '') {
    const el = h('div.bt-banner' + (cls ? '.' + cls : ''), text);
    this.fxEl.appendChild(el);
    setTimeout(() => el.remove(), 950 / this.speed);
    el.style.animationDuration = 0.9 / this.speed + 's';
  }
  flash(el, cls, ms = 400) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
  /** The foe's intent tag breaks like glass and falls (Time Pause). */
  shatter(v) {
    const tag = v.tags.firstChild;
    if (!tag) return;
    const x = v.el.offsetLeft + v.tags.offsetLeft + tag.offsetLeft, y = v.el.offsetTop + v.tags.offsetTop + tag.offsetTop;
    const cuts = ['0 0, 40% 0, 28% 100%, 0 100%', '40% 0, 62% 0, 50% 60%, 28% 100%, 20% 60%', '62% 0, 100% 0, 100% 45%, 50% 60%',
      '50% 60%, 100% 45%, 100% 100%, 70% 100%', '28% 100%, 50% 60%, 70% 100%'];
    cuts.forEach((c, i) => {
      const shard = tag.cloneNode(true);
      const el = h('div.bt-shard', { style: { left: x + 'px', top: y + 'px', width: tag.offsetWidth + 'px', clipPath: `polygon(${c})` } }, shard);
      this.fxEl.appendChild(el);
      const dx = (i - 2) * 18 + (Math.random() * 10 - 5), rot = (i - 2) * 24 + Math.random() * 20;
      el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${70 + i * 10}px) rotate(${rot}deg)`, opacity: 0 }],
        { duration: 700 / this.speed, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove());
    });
    audio.play('break');
  }
  mateAct(id, clip) { const m = this.mates.get(id); if (!m) return; m.play(clip, 0.9); this.flash(m.el, 'act', 500); }

  async playEvents(ev) {
    const b = this.b, d = this.disp;
    for (const e of ev) {
      const v = e.foe != null ? this.fv.get(e.foe) : null;
      const [fx, fy] = e.foe != null ? this.where(e.foe) : [0, 0];
      switch (e.t) {
        case 'play': {
          const el = [...this.handEl.querySelectorAll('.bt-card')].find((x) => x.dataset.uid == e.card);
          if (el) el.remove();
          this.drawHand();
          if (ULTS[e.id]) { this.mateAct(e.who, 'Work'); await this.ult(e.id, e.foe != null && b.foe(e.foe) ? b.foe(e.foe).id : null); break; }   // the 大絕 cut-in
          this.mateAct(e.who, CARDS[e.id].type === 'attack' ? 'Cheer' : 'Work');
          this.pop(150, 470, t(CARDS[e.id].name), 'word denim');
          audio.play(CARDS[e.id].type === 'attack' ? 'tap' : 'ability');
          await this.wait(220);
          break;
        }
        case 'hit':
          v.disp.hp = Math.max(0, v.disp.hp - e.n);
          this.flash(v.el, 'hurt', 320);
          this.pop(fx + (Math.random() * 20 - 10), fy, e.n, e.x2 ? 'big' : '');
          audio.play('pop');
          this.drawFoe(v);
          await this.wait(e.x2 ? 280 : 180);
          break;
        case 'fade': v.disp.fade += e.n; this.drawFoe(v); break;
        case 'colour':
          v.disp.fade = 0;
          this.drawFoe(v);
          this.pop(fx, fy - 30, t('Colour back!'), 'word denim');
          audio.play('ding');
          await this.wait(420);
          break;
        case 'down':
          v.el.classList.add('down');
          this.pop(fx, fy - 20, t('Colour restored'), 'word denim');
          if (e.back) this.pop(fx, fy + 20, t('{n} coins back', { n: e.back }), 'word coral');
          audio.play('levelup');
          await this.wait(520);
          break;
        case 'cancel':
          this.shatter(v);
          this.drawFoe(v);
          this.pop(fx, fy - 30, t('Time Pause!'), 'word denim');
          await this.wait(520);
          break;
        case 'foam': d.foam += e.n; this.pop(214, 530, '+' + e.n, 'good'); this.drawStatus(); break;
        case 'heal': d.chill += e.n; this.pop(100, 530, '+' + e.n, 'good'); this.drawStatus(); break;
        case 'energy': this.pop(42, 640, '+' + e.n, 'good'); this.drawStatus(); break;
        case 'boost': this.pop(150, 440, t('Next attack +{n}', { n: e.n }), 'word denim'); break;
        case 'draw': case 'conjure': case 'recall': case 'untie':
          this.drawHand();
          if (e.t === 'conjure') this.pop(330, 590, CARDS[e.id].type === 'junk' ? t('Knotted!') : t('Conjured!'), CARDS[e.id].type === 'junk' ? 'word coral' : 'word denim');
          await this.wait(90);
          break;
        case 'shuffle': this.pop(60, 720, t('Reshuffled'), 'word'); break;
        case 'drink': this.pop(330, 520, t(DRINKS[e.id].name), 'word denim'); audio.play('water'); this.drawStatus(); await this.wait(260); break;
        case 'unjam': this.drawStatus(); break;
        case 'foes':
          this.drawHand();
          this.banner(t("The grey things' turn"));
          audio.play('open');
          await this.wait(700);
          break;
        case 'stunned':
          v.el.classList.remove('colored');
          this.pop(fx, fy - 20, t('Too colourful to move'), 'word denim');
          await this.wait(480);
          break;
        case 'paused':
          v.el.classList.remove('paused');
          this.pop(fx, fy - 20, t('Frozen in time'), 'word denim');
          await this.wait(480);
          break;
        case 'hurt': {
          this.flash(v.el, 'lunge', 360);
          await this.wait(140);
          d.foam -= e.blocked; d.chill -= e.n;
          if (e.blocked) this.pop(214, 520, t('{n} blocked', { n: e.blocked }), 'word');
          if (e.n) {
            this.pop(110, 520, '−' + e.n, e.big ? 'big' : '');
            this.flash(this.chillEl, 'flash', 820);
            for (const m of this.mates.values()) this.flash(m.el, 'ow', 320);
            if (e.big) this.flash(this.frame, 'shake', 320);
          }
          audio.play(e.big ? 'break' : e.n ? 'angry' : 'pop');
          this.drawStatus();
          await this.wait(e.big ? 620 : 440);
          break;
        }
        case 'wind': this.flash(v.el, 'hurt', 320); this.pop(fx, fy - 20, t('Winding up…'), 'word coral'); audio.play('charge'); await this.wait(480); break;
        case 'nap': this.pop(fx, fy - 20, 'Zzz…', 'word'); audio.play('yawn'); await this.wait(420); break;
        case 'jam': this.flash(v.el, 'lunge', 360); this.pop(fx, fy - 20, t('Next card +{n}', { n: e.n }), 'word coral'); audio.play('error'); this.drawStatus(); await this.wait(440); break;
        case 'call': {
          this.flash(v.el, 'lunge', 360);
          const nf = b.foe(e.add);
          this.addFoeView(nf, true);
          audio.play('pop');
          await this.wait(460);
          break;
        }
        case 'steal':
          v.disp.stolen += e.n;
          this.flash(v.el, 'lunge', 360);
          this.pop(fx, fy - 20, t('−{n} coins', { n: e.n }), 'word coral');
          audio.play('coin');
          this.drawFoe(v);
          await this.wait(460);
          break;
        case 'flee':
          v.el.classList.add('fled');
          this.pop(fx - 30, fy - 20, t('Ran off with {n} coins', { n: e.n }), 'word coral');
          await this.wait(700);
          break;
        case 'turn':
          this.disp.foam = b.foam; this.disp.chill = b.chill;
          this.refreshAim();
          for (const x of this.fv.values()) if (x.f.alive) this.drawFoe(x);
          this.turnEl.textContent = String(e.n).padStart(2, '0');
          this.drawStatus();
          if (e.n > 1) { this.banner(t('Your turn'), 'denim'); await this.wait(520); }
          break;
      }
    }
  }

  // ---------------- between fights
  async fightOver() {
    const b = this.b, run = this.run;
    run.settle();
    await this.wait(500);
    if (b.over === 'lost') return this.result(false);
    audio.play('fanfare');
    const coins = b.coins(), back = b.foes.filter((f) => !f.alive && !f.fled).map((f) => t(f.def.name));
    const last = run.node === run.c.nodes.length - 1;
    const offer = last ? [] : run.offer();   // no card to add when nothing is left to fight
    const picks = h('div.bt-picks');
    offer.forEach((id, i) => {
      const el = this.cardEl({ id }, null);
      el.style.left = 6 + i * 104 + 'px';
      el.style.transform = `rotate(${(i - 1) * 3}deg)`;
      el.onclick = () => { audio.play('click'); run.pick(id); this.nextNode(); };
      picks.appendChild(el);
    });
    this.frame.append(h('div.bt-scrim'), h('div.bt-sheet', { style: { top: '170px' } },
      h('div.bt-head', t('Colour restored!')),
      h('div.bt-row', h('span.bt-lab', t('Back to colour')), ...back.map((n) => h('span.bt-pill', n))),
      h('div.bt-row', h('span.bt-lab', t('Coins this fight')), h('span.bt-pill.coral', '+', h('b', String(coins))), b.lost ? h('span.bt-pill', t('{n} coins ran off', { n: b.lost })) : null),
      last ? null : h('div.bt-row', h('span.bt-lab', offer.length ? t('Add a card to the deck for this commission') : t('No more cards to add'))),
      offer.length ? picks : null,
      h('div.bt-acts', h('button.bt-btn' + (offer.length ? '' : '.go'), { onclick: () => this.nextNode() }, offer.length ? t('Skip') : t('Next')))));
  }
  nextNode() {
    if (this.run.next()) { this.mates.clear(); return this.startNode(); }
    this.result(true);
  }
  restStop() {
    const run = this.run, node = run.here, m = new Mate('mochalatte', 1.6, this.look('mochalatte'));
    this.extra = [m];
    this.mates.clear();
    const box = h('div', { style: { display: 'flex', justifyContent: 'center', margin: '4px 0' } }, m.canvas);
    this.frame.replaceChildren(this.backdrop(), this.topBar(), h('div.bt-sheet', { style: { top: '200px' } },
      h('div.bt-head', t('Coffee stop')),
      h('div.bt-plea', t('A warm corner in the grey street. The team shares a pot of coffee before the last stretch.')),
      box,
      h('div.bt-row', h('span.bt-lab', 'CHILL'), h('span.bt-pill', run.chill + ' / ' + run.chillMax), h('span.bt-pill', t('Chill +{n}', { n: node.heal }))),
      h('div.bt-acts', h('button.bt-btn.go', { onclick: () => { run.rest(); audio.play('water'); this.nextNode(); } }, t('Drink up and go on')))));
  }

  giveUp() {
    if (this.busy) return;
    const was = this.auto;
    this.auto = false;
    const scrim = h('div.bt-scrim'), card = h('div.bt-sheet', { style: { top: '260px' } },
      h('div.bt-head.coral', t('Give up?')),
      h('div.bt-plea', t('The team heads home. Whatever the commission has paid so far is kept.')),
      h('div.bt-acts',
        h('button.bt-btn', { onclick: () => { scrim.remove(); card.remove(); this.auto = was; if (was) this.autoStep(); } }, t('Keep going')),
        h('button.bt-btn.go', { onclick: () => { if (this.b && !this.b.over) this.run.settle(); this.result(false); } }, t('Head home'))));
    this.frame.append(scrim, card);
  }

  result(won) {
    const run = this.run;
    this.auto = false;
    this.mates.clear();
    audio.setScene(null);
    audio.play(won ? 'levelup' : 'close');
    const back = run.colored.map((id) => t(FOES[id].name));
    this.frame.replaceChildren(this.backdrop(), h('div.bt-sheet', { style: { top: '150px' } },
      h('div.bt-head' + (won ? '' : '.coral'), won ? t('Commission done') : t('The team came home')),
      h('div.bt-plea', won ? t('The alarm clock got its colour back. The owl finally slept in. It will drop by the café one of these days.') : t('The grey things were too much this time. Rest up and try again.')),
      h('div.bt-row', h('span.bt-lab', t('Coins')), h('span.bt-pill.coral', '+', h('b', String(run.payout()))), run.team.includes('heehee') && run.coins ? h('span.bt-pill', t('Hee Hee tips +15%')) : null, run.lost ? h('span.bt-pill', t('{n} coins ran off', { n: run.lost })) : null),
      back.length ? h('div.bt-row', h('span.bt-lab', t('Back to colour')), ...back.map((n) => h('span.bt-pill', n))) : null,
      run.picked.length ? h('div.bt-row', h('span.bt-lab', t('Cards picked up on the way')), ...run.picked.map((id) => h('span.bt-pill', t(CARDS[id].name)))) : null,
      h('div.bt-row', h('span.bt-lab', 'CHILL'), h('span.bt-pill', run.chill + ' / ' + run.chillMax)),
      h('div.bt-row', h('span.bt-lab', t('Prototype: nothing is paid into the café yet.'))),
      h('div.bt-acts',
        h('button.bt-btn', { onclick: () => { this.close(); new this.constructor(this.game).open(); } }, t('Play again')),
        h('button.bt-btn.go', { onclick: () => this.close() }, t('Back to the café')))));
  }
}

function drinkIcon(id) {
  const svg = id === 'espresso'
    ? '<path d="M2 4h6v4H2z" fill="#1F2A4A"/><path d="M3 5h4v2H3z" fill="#7a4a2a"/><path d="M8 5h2v2H8z" fill="#1F2A4A"/><path d="M1 9h8v1H1z" fill="#1F2A4A"/>'
    : '<path d="M2 3h6v6H2z" fill="#1F2A4A"/><path d="M3 4h4v1H3z" fill="#F6CDBF"/><path d="M3 5h4v3H3z" fill="#fff"/><path d="M8 4h2v3H8z" fill="#1F2A4A"/><path d="M4 1h1v1H4zM6 0h1v2H6z" fill="#9A9590"/>';
  return h('span', { html: `<svg width="22" height="22" viewBox="0 0 11 11" shape-rendering="crispEdges">${svg}</svg>` });
}
