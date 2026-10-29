// Real-time battle screen (?battle&rt): the turn-based screen (ui/battle.js) with a clock running underneath, after
// Blue Archive. The team swings on its own, energy refills on a bar, three cards wait in the thumb zone and can be
// played whenever they are affordable. Each foe's move is a charge bar; coral ones are the big ones worth a Time
// Pause. Holding a card slows time down, a cut-in stops it. Rules in battle/realtime.js; the brief, the rest stop,
// the reward pick and the result screen are the turn-based screen's own.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { CARDS, RT, COMMISSION, TEAM, DRINKS } from '../battle/data.js';
import { OUTING } from '../data.js';
import { cloud } from '../cloud.js';
import { Run } from '../battle/engine.js';
import { RtBattle, autoMoveRt, rtCost } from '../battle/realtime.js';
import { ULTS } from './ultimate.js';
import { BattleScreen, Mate, MATES, cardLines, intentWords } from './battle.js';
import { styleOf, shoot, dash, spark, struck, staggered, rush, shockwave, impactSound } from './hitfx.js';

const ROLE = { Tank: 'Tank', Striker: 'Striker', Support: 'Support', Caster: 'Caster' };
const LOCAL = new URLSearchParams(location.search).has('offline');   // local testing without the server (main.js)
const SLOW = 0.3;   // time runs this fast while a card or a drink is picked up
const ASK = 3;      // auto picks a move every 3 ticks

export function openBattleRt(game) {
  if (document.getElementById('battle')) return;
  new RtScreen(game).open();
}

class RtScreen extends BattleScreen {
  constructor(game) {
    super(game);
    this.run = new Run(COMMISSION, { night: this.night, team: TEAM, Fight: RtBattle });
    this.stopUntil = 0;   // hit-stop: the clock holds still until then
  }
  open() { super.open(); this.root.classList.add('rt'); }

  /** The brief: each member's row and role under their passive, and the outing tickets (outing.js): heading out
   *  spends one and shuts the café for a round, unless the team is already out (then it carries on). */
  brief() {
    super.brief();
    this.frame.querySelectorAll('.bt-mates > div').forEach((el, i) => {
      const r = RT.members[TEAM[i]];
      if (r) el.appendChild(h('em.bt-role', t(r.row === 'front' ? 'Front row' : 'Back row') + ' · ' + t(ROLE[r.role])));
    });
    const g = this.game, day = g && g.day;
    if (!day || g.visit) return;
    const go = this.frame.querySelector('.bt-acts .bt-btn.go'), out = day.shutLeft, n = g.state.tickets.n;
    const row = h('div.bt-row', h('span.bt-lab', t('Outing tickets · one a day, up to {n}', { n: OUTING.max })),
      h('span.bt-pill' + (n ? '' : '.coral'), t('{n} / {m}', { n, m: OUTING.max })),
      out ? h('span.bt-pill', t('Out · back in {t}', { t: `${Math.floor(out / 3600)}:${String(Math.floor(out / 60) % 60).padStart(2, '0')}` })) : null);
    go.parentNode.before(row, h('div.bt-plea', out ? t('The café is shut while the team is out: carry on with the commission.')
      : t('Heading out shuts the café for two hours: no guests and no wages for that time, the rent is still due.')));
    if (out) { go.textContent = t('Carry on'); return; }
    if (!n) { go.disabled = true; go.textContent = t('No tickets left: one more tomorrow'); return; }
    go.textContent = t('Spend a ticket and head out');
    go.onclick = () => {
      if (!cloud.online && !LOCAL) { g.toast(t('Heading out needs a connection to the server.'), 'bad'); return; }
      if (!day.startOuting()) return;
      audio.play('open');
      this.startNode();
    };
  }
  topBar() {
    const el = super.topBar();
    el.querySelector('.bt-turn small').textContent = t('Time');
    return el;
  }
  cardCost(id) { return rtCost(id); }
  lines(id) {
    const fx = CARDS[id].fx;
    return cardLines(id).map((l) =>
      fx.cancel && l === t('A foe skips its move this turn.') ? t('A foe loses its charge and freezes {n} s.', { n: RT.freezeFor })
      : fx.nextEnergy && l === t('Energy +{n} next turn', { n: fx.nextEnergy }) ? t('Energy +{n} in {s} s', { n: fx.nextEnergy, s: RT.nextEnergyIn })
      : CARDS[id].type === 'junk' ? t('Cannot be played. Unties itself in {n} s.', { n: RT.knotFor }) : l);
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
      const mem = b.member(id);
      m.hpEl = h('i');
      // where they stand: home, plus an offset they walk to (they run in from off the left edge)
      m.home = [x, y]; m.at = { x: -200 - x, y: 24 }; m.to = { x: 0, y: 0 }; m.pace = 300; m.next = performance.now() + 3000 + Math.random() * 3000;
      return m.el = h('div.bt-mate' + (mem && mem.row === 'back' ? '.back' : ''), { style: { left: x + 'px', top: y + 'px' } }, h('i.shadow'), m.canvas, h('span.tag', this.name(id)),
        mem ? h('div.bt-mhp', h('b', m.hpEl)) : null,
        id === 'cheetie' ? h('span.buff', { style: { left: '-4px', top: '30px' } }, t('Mind Reading')) : null,
        id === 'heehee' ? h('span.buff', { style: { left: '76px', top: '40px' } }, t('Blooming Tips')) : null);
    }));
    this.chillEl = h('div.bt-chill', h('div.lab', 'CHILL ', h('b', ''), ' / ' + b.chillMax), h('div.bar', h('i')));
    this.foamEl = h('div.bt-foam', h('span', '0'), h('small', t('Foam')));
    this.drinksEl = h('div.bt-drinks');
    this.energyEl = h('div.bt-energy', h('span.beans'), h('b', ''), h('small', t('Energy')));
    this.pilesEl = h('div.bt-piles');
    this.handEl = h('div.bt-hand', this.energyEl, this.pilesEl);
    this.segs = Array.from({ length: RT.energyMax }, () => h('i'));
    this.costEl = h('div.bt-cost', this.segs, h('b', ''));
    this.autoBtn = h('button', { onclick: () => this.toggleAuto() }, t('Auto'));
    this.speedBtn = h('button', { onclick: () => { this.speed = this.speed === 1 ? 2 : 1; this.speedBtn.classList.toggle('on', this.speed === 2); } }, '2×');
    this.devBtn = h('button.bt-dev', { title: t('Plays the cut-in without changing the fight'), onclick: (e) => { e.stopPropagation(); this.devMenu(); } }, t('Test ultimate'));   // prototype only
    this.endBtn = null;
    this.hintEl = h('span');
    this.fxEl = h('div.bt-layer.bt-fx');
    this.frame.replaceChildren(this.backdrop(), this.topBar(), h('div.bt-floor'), crew, this.foeLayer,
      h('div.bt-status', this.chillEl, this.foamEl, this.drinksEl), this.handEl,
      h('div.bt-hint', this.hintEl), h('div.bt-modes', this.autoBtn, this.speedBtn), this.devBtn, this.costEl, this.fxEl);
    this.autoBtn.classList.toggle('on', this.auto);
    this.speedBtn.classList.toggle('on', this.speed === 2);
    b.foes.forEach((f, i) => { f.slot = i; this.addFoeView(f); });
    this.disp = { chill: b.chill, foam: b.foam };
    this.introUntil = performance.now() + 1300 / this.speed;   // the team runs in, the grey things slide in, then go
    setTimeout(() => { if (this.b === b) { this.banner(t('Engage!'), 'denim'); audio.play('open'); } }, 750 / this.speed);
    b.start();
    for (const mem of b.members) if (!mem.hp) this.sitOut(mem.id);
    this.sync();
    this.clock(b);
  }

  /** The clock: whole ticks of the engine out of real time (slowed while a card is held, stopped under a sheet or a
   *  cut-in); the screen follows the engine every frame. */
  clock(b) {
    const ms = 1000 / RT.tps;
    let last = performance.now(), acc = 0;
    const loop = (now) => {
      if (!this.root.isConnected || this.b !== b) return;
      requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      if (!this.busy && now >= this.stopUntil) this.moveMates(dt, now);
      if (b.over) return;
      const stopped = now < this.stopUntil;
      this.frame.classList.toggle('hitstop', stopped);
      if (!this.paused() && !stopped) acc += dt * this.speed * (this.held() ? SLOW : 1);
      while (acc >= ms && !b.over && !this.paused()) {
        acc -= ms;
        const ev = b.step();
        if (ev.length) this.show(ev);
        if (b.tick === RT.tps * 6) this.drawHint();
        if (this.auto && b.tick % ASK === 0) this.autoStep();
      }
      this.tickUI();
      if (b.over) { this.sel = null; this.selDrink = null; this.drawHand(); this.drawHint(); this.fightOver(); }
    };
    requestAnimationFrame(loop);
  }
  held() { return !!this.sel || this.selDrink != null; }
  /** Hold the fight still for a beat as a blow lands. */
  hitstop(ms) { this.stopUntil = Math.max(this.stopUntil, performance.now() + ms / this.speed); }
  /** A cut-in, a sheet (give up, rewards) or a hidden tab stops the clock. */
  paused() { return this.busy || document.hidden || performance.now() < this.introUntil || !!this.frame.querySelector('.bt-scrim'); }

  /** Moving about, after Blue Archive: each member heads for their spot (to, an offset from home) at their pace,
   *  facing the way they go with the Walk clip on; now and then one standing member shifts a step, as if changing
   *  cover. Hee Hee steps up while the spotlight is on her. The ones lower on the board are drawn in front. */
  moveMates(dt, now) {
    const b = this.b, k = dt / 1000 * this.speed;
    for (const [id, m] of this.mates) {
      if (!m.home) continue;
      const mem = b.member(id), down = mem && !mem.hp;
      if (!down && !b.over && now > m.next && now > this.introUntil) {
        m.next = now + 2500 + Math.random() * 3500;
        m.to = { x: (id === 'heehee' && b.taunt > b.tick ? 26 : 0) + (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 10 };
        m.pace = 70;
      }
      const dx = m.to.x - m.at.x, dy = m.to.y - m.at.y, d = Math.hypot(dx, dy), walking = d > 0.5 && !down;
      if (walking) {
        const s = Math.min(d, m.pace * k);
        m.at.x += dx / d * s; m.at.y += dy / d * s;
        if (Math.abs(dx) > 1) m.canvas.style.scale = dx < 0 ? '-1 1' : '';
      } else m.canvas.style.scale = '';
      const rest = down ? 'Nap' : walking ? 'Walk' : 'Idle';
      if (m.rest !== rest) { m.rest = rest; if (!m.until) m.clip = rest; }
      m.el.style.transform = `translate(${m.at.x}px, ${m.at.y}px)`;
      m.el.style.zIndex = 3 + Math.max(0, Math.min(4, Math.round((m.home[1] + m.at.y - 200) / 60)));   // 3..7: under the effects and sheets
    }
  }
  /** A member's middle on the stage, where they stand right now. */
  matePos(m, dy = 56) { return [m.el.offsetLeft + m.at.x + 64, m.el.offsetTop + m.at.y + dy]; }
  /** Knocked back by a blow; they walk back to their spot. */
  knock(m, px) {
    m.at.x -= px; m.at.y += px * 0.25;
    m.pace = 90;
  }

  /** A won fight: the team runs off to the right before the rewards. */
  async fightOver() {
    if (this.b.over === 'won') {
      for (const [id, m] of this.mates) if (m.home && this.b.up(id)) { m.to = { x: 460 - m.home[0], y: -50 }; m.pace = 340; m.next = Infinity; }
      this.banner(t('Cleared!'), 'denim');
      await this.wait(1100);
    }
    return super.fightOver();
  }

  /** A foe's view with an HP bar over its numbers (a light trail shows what the last blows took), sliding in from
   *  the right at the start of a fight. */
  addFoeView(f, enter = false) {
    const v = super.addFoeView(f, enter);
    v.hpFill = h('i.fill'); v.hpTrail = h('i.trail');
    v.el.insertBefore(h('b.bt-fhp' + (f.def.boss ? '.boss' : ''), { style: { width: Math.max(56, Math.min(110, f.def.w)) + 'px' } }, v.hpTrail, v.hpFill), v.el.querySelector('.bt-hp'));
    this.hpBar(v);
    if (!enter) v.el.animate([{ translate: '180px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }],
      { duration: 520 / this.speed, delay: (200 + (f.slot || 0) * 130) / this.speed, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    return v;
  }
  hpBar(v) {
    if (!v.hpFill) return;
    const w = `calc((100% - 4px) * ${Math.max(0, v.shown ?? v.f.hp) / v.f.max})`;
    v.hpFill.style.width = w; v.hpTrail.style.width = w;
  }

  /** Everything that moves every frame: bars, numbers, the charge of each foe, which cards are affordable. */
  tickUI() {
    const b = this.b;
    if (this.busy) return;   // the screen holds still under a cut-in
    this.chillEl.querySelector('b').textContent = Math.max(0, b.chill);
    this.chillEl.querySelector('.bar i').style.width = Math.max(0, b.chill) / b.chillMax * 100 + '%';
    this.chillEl.classList.toggle('low', b.chill <= b.chillMax * 0.3);
    this.foamEl.firstChild.textContent = b.foam;
    this.foamEl.classList.toggle('zero', !b.foam);
    const p = b.energy >= RT.energyMax ? 0 : b.regen / Math.round(RT.regen * RT.tps);
    this.energyEl.querySelector('b').textContent = b.energy;
    this.energyEl.style.setProperty('--p', b.energy >= RT.energyMax ? 1 : p);
    this.energyEl.classList.toggle('jam', b.jam > 0);
    this.segs.forEach((s, i) => { s.className = i < b.energy ? 'on' : ''; s.style.setProperty('--f', i === b.energy ? p : 0); });
    this.costEl.lastChild.textContent = b.energy;
    for (const el of this.handEl.querySelectorAll('.bt-card')) {
      const c = b.hand.find((x) => x.uid == el.dataset.uid);
      if (!c) continue;
      const off = !b.canPlay(c);
      if (el.classList.contains('off') && !off && CARDS[c.id].type !== 'junk') this.flash(el, 'ready', 360);
      el.classList.toggle('off', off);
    }
    for (const v of this.fv.values()) {
      if (!v.f.alive) continue;
      if (v.bar) {
        const pr = b.progress(v.f);
        v.bar.style.width = pr * 100 + '%';
        const near = pr > 0.75 && !v.f.frozen && !v.f.colored;
        v.bar.parentNode.classList.toggle('near', near);
        v.el.classList.toggle('near', near);
      }
    }
    for (const mem of b.members) {
      const m = this.mates.get(mem.id);
      if (!m || !m.hpEl) continue;
      m.hpEl.style.width = mem.hp / mem.max * 100 + '%';
      m.el.classList.toggle('low', mem.hp > 0 && mem.hp <= mem.max * 0.3);
      m.el.classList.toggle('taunt', mem.id === 'heehee' && b.taunt > b.tick && mem.hp > 0);
    }
    const sec = Math.floor(b.tick / RT.tps);
    this.turnEl.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    this.frame.classList.toggle('slow', this.held() && !this.paused());
  }

  drawFoe(v) {
    const f = v.f, b = this.b;
    if (v.shown == null) v.shown = f.hp;   // the hp on screen drops as each blow lands, not when the engine counts it
    v.hpN.textContent = v.shown;
    this.hpBar(v);
    v.fade.replaceChildren(...Array.from({ length: f.fadeMax }, (_, i) => h('i' + (i < f.fade ? '.c' : ''))));
    v.loot.style.display = f.alive && f.stolen ? '' : 'none';
    v.loot.textContent = '−' + f.stolen;
    v.el.classList.toggle('colored', f.colored);
    v.el.classList.toggle('paused', f.frozen > 0);
    v.el.classList.toggle('focus', f.alive && b.alive().length > 1 && b.front() === f);
    const tags = [];
    v.bar = null;
    if (f.alive) {
      const [w, cls] = intentWords(f.intent);
      if (f.colored) tags.push(h('span.bt-intent.calm', t('Colour back: double damage')));
      else if (f.frozen) tags.push(h('span.bt-intent.calm', t('Frozen in time')));
      else tags.push(h('span.bt-intent' + (cls ? '.' + cls : ''), w));
      v.bar = h('i');
      tags.push(h('div.bt-charge' + (f.frozen || f.colored ? '.held' : cls === 'alert' ? '.alert' : ''), v.bar));
      if (b.has('cheetie')) tags.push(h('span.bt-intent.ghost', t('Next: {what}', { what: intentWords(b.nextIntent(f))[0] })));
    }
    v.tags.replaceChildren(...tags);
    v.el.classList.toggle('aim', !!(this.sel && CARDS[this.sel.id].target === 'foe' && f.alive));
  }

  sync() {
    const b = this.b;
    this.disp.chill = b.chill; this.disp.foam = b.foam;
    if (this.sel && !b.hand.includes(this.sel)) this.sel = null;
    this.refreshAim();
    this.drawStatus();
    this.drawHand();
    this.drawHint();
    this.tickUI();
  }
  drawHint() {
    const b = this.b;
    let s = '';
    if (this.auto) s = t('Auto is playing');
    else if (b.over) s = '';
    else if (this.selDrink != null) s = t('Tap the drink again to drink it');
    else if (this.sel) s = CARDS[this.sel.id].target === 'foe' && b.needsTarget(this.sel) ? t('Slowed down · tap a foe or the card again') : t('Slowed down · tap the card again');
    else if (b.tick < RT.tps * 6) s = t('The team fights on its own. Play a card when you have the energy.');
    this.hintEl.textContent = s;
  }

  // ---------------- input: a second tap plays on the foe in front; a tap on a foe with no card picks the team's target
  tapCard(c, el) {
    if (this.sel === c && !this.busy && !this.auto && this.b.canPlay(c)) return this.playCard(c.uid, this.b.front() && this.b.front().uid);
    super.tapCard(c, el);
  }
  tapFoe(f) {
    if (this.busy || !f.alive || this.b.over) return;
    if (this.sel) { if (!this.auto && CARDS[this.sel.id].target === 'foe') this.playCard(this.sel.uid, f.uid); return; }
    if (this.b.alive().length < 2 || this.b.front() === f) return;
    this.b.setFocus(f.uid);
    audio.play('click');
    const [x, y] = this.where(f.uid);
    this.pop(x, y - 40, t('Focus here'), 'word denim');
    this.refreshAim();
  }
  autoStep() {
    if (!this.auto || this.busy || !this.b || this.b.over) return;
    const m = autoMoveRt(this.b);
    if (!m) return;
    if (m.drink != null) return this.act(() => this.b.useDrink(m.drink));
    this.act(() => this.b.play(m.uid, m.foe));
  }

  /** A player (or auto) move: a signature card stops the clock for its cut-in, then everything lands. */
  async act(fn) {
    if (this.busy || this.b.over) return;
    const ev = fn();
    if (!ev) return;
    const p = ev.find((e) => e.t === 'play');
    if (p) { const el = this.handEl.querySelector(`.bt-card[data-uid="${p.card}"]`); if (el) el.remove(); }
    if (p && ULTS[p.id]) {
      this.busy = true;
      this.drawStatus(); this.drawHint();
      this.mateAct(p.who, 'Work');
      const foe = p.foe != null && this.b.foe(p.foe);
      await this.ult(p.id, foe ? foe.id : null);
      this.busy = false;
    }
    this.show(ev);
    this.sync();
  }

  /** A card's move, played once at its own length (Attack / Cast, baked from tools/sprites/moves.js). */
  mateAct(id, clip) { const m = this.mates.get(id); if (!m) return; m.play(clip); this.flash(m.el, 'act', 500); }

  /** A member at 0 chill: sits down for a nap, greyed out, until the coffee stop. */
  sitOut(id) {
    const m = this.mates.get(id);
    if (!m) return;
    m.rest = 'Nap'; m.play('Nap', 0.1);
    m.el.classList.add('ko');
  }

  /** A team member's swing: a short denim dash from them to the foe. */
  streak(m, foe) {
    const [tx, ty] = this.where(foe), [x, y] = this.matePos(m);
    const s = h('i.bt-streak', { style: { left: x + 'px', top: y + 'px', width: Math.hypot(tx - x, ty - y) + 'px', transform: `rotate(${Math.atan2(ty - y, tx - x)}rad)` } });
    this.fxEl.appendChild(s);
    s.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 30%)', offset: 0.6 }, { clipPath: 'inset(0 0 0 100%)' }], { duration: 240 / this.speed, easing: 'ease-out' })
      .finished.then(() => s.remove(), () => s.remove());
  }

  /** One blow on its way: the member's shot leaves after their wind-up (or they dash in), and it lands travel ms
   *  later; a second hit of the same card lands a beat after the first. Returns when it lands (ms from now). */
  blow(e, src, sent, i) {
    const v = this.fv.get(e.foe);
    if (!v) return 0;
    if (!src || src.ult) { this.land(e, src, v); return 0; }   // after a cut-in it lands at once
    const st = styleOf(src.who), sp = this.speed, m = this.mates.get(src.who);
    const lead = st.lead[src.small ? 0 : 1] / sp, travel = st.travel / sp, to = this.where(e.foe);
    if (!sent.has(e.foe)) {
      sent.add(e.foe);
      const from = m ? this.matePos(m) : [120, 400];
      setTimeout(() => {
        if (!this.root.isConnected) return;
        if (st.dash && m) {   // runs in right up to the foe, strikes on arrival, bounces back
          const dx = to[0] - from[0], dy = to[1] - from[1], d = Math.hypot(dx, dy);
          m.play('Walk', travel / 1000);
          setTimeout(() => m.play('Attack'), travel * 0.7);
          dash(m.el, [dx, dy], Math.max(0, (d - 46) / d), travel);
        }
        if (st.shot) shoot(this.fxEl, st.shot, from, to, travel, !src.small);
        else if (m) this.streak(m, e.foe);
      }, lead);
    }
    const at = lead + travel + i * 90 / sp;
    setTimeout(() => this.land(e, src, v), at);
    return at;
  }
  /** A blow landing: spark, white flash, knock-back, the number (stacking while blows keep coming), the sound, and
   *  for a card a short hit-stop. */
  land(e, src, v) {
    if (!this.root.isConnected || !v.el.isConnected) return;
    const small = !!e.small, [fx, fy] = this.where(e.foe), now = performance.now();
    struck(v.body, e.n, { small, big: e.x2, speed: this.speed });
    spark(this.fxEl, styleOf(src && src.who).spark, fx, fy, !small, this.speed);
    v.combo = now - (v.comboAt || 0) < 600 ? (v.combo || 0) + 1 : 0; v.comboAt = now;
    v.shown = Math.max(v.f.hp, (v.shown ?? v.f.hp + e.n) - e.n);
    v.hpN.textContent = v.shown;
    this.hpBar(v);
    this.pop(fx + Math.random() * 12 - 6, fy - 4 - Math.min(5, v.combo) * 13 + (small ? 14 : 0), e.x2 ? e.n + '!' : e.n, small ? 'small' : e.x2 ? 'big' : '');
    if (src) impactSound(src.who, small); else audio.play('pop');
    if (!small) this.hitstop(src && src.ult ? 160 : e.x2 ? 110 : 70);
    if (!small && e.n >= 10) this.flash(this.frame, 'shake', 260);
  }

  /** The engine's events as quick effects; nothing waits, the clock keeps going. Blows land a moment later, when
   *  their shot arrives (blow()), and whatever follows from them (a colour coming back, a foe going down) with them. */
  show(ev) {
    const b = this.b;
    let foes = false, hand = false, status = false;
    let src = null, sent = new Set(), n = 0, wait = 0;
    const rushed = new Set();   // foes that already threw themselves at someone in this batch
    const after = (fn) => (wait ? setTimeout(() => { if (this.root.isConnected) fn(); }, wait) : fn());
    for (const e of ev) {
      const v = e.foe != null ? this.fv.get(e.foe) : null;
      const [fx, fy] = e.foe != null ? this.where(e.foe) : [0, 0];
      switch (e.t) {
        case 'play':
          hand = status = true;
          src = { who: e.who, ult: !!ULTS[e.id] }; sent = new Set(); n = 0;
          if (ULTS[e.id]) break;   // its cut-in already played
          if (CARDS[e.id].type !== 'attack') this.mateAct(e.who, 'Cast');
          else if (!styleOf(e.who).dash) this.mateAct(e.who, 'Attack');   // the dashers strike when they arrive (blow())
          this.pop(150, 470, t(CARDS[e.id].name), 'word denim');
          audio.play(CARDS[e.id].type === 'attack' ? 'tap' : 'ability');
          break;
        case 'swing': {
          const m = this.mates.get(e.who);
          if (m && !styleOf(e.who).dash) { m.play('Attack'); this.flash(m.el, 'swing', 300); }
          src = { who: e.who, small: true }; sent = new Set(); n = 0;
          break;
        }
        case 'hit': wait = Math.max(wait, this.blow(e, src, sent, n++)); break;
        case 'fade': case 'thaw': case 'fire': foes = true; break;
        case 'grey': foes = true; this.pop(fx, fy - 20, t('Grey again'), 'word'); break;
        case 'colour': foes = true; after(() => { this.pop(fx, fy - 30, t('Colour back!'), 'word denim'); audio.play('ding'); }); break;
        case 'down':
          after(() => {
            v.el.classList.add('down');
            this.pop(fx, fy - 20, t('Colour restored'), 'word denim');
            if (e.back) this.pop(fx, fy + 20, t('{n} coins back', { n: e.back }), 'word coral');
            audio.play('levelup');
            this.hitstop(140);
          });
          foes = true;
          break;
        case 'cancel': this.shatter(v); this.pop(fx, fy - 30, t('Time Pause!'), 'word denim'); foes = true; break;
        case 'foam': this.pop(214, 530, '+' + e.n, 'good'); break;
        case 'heal': { const m = this.mates.get(e.who), [x, y] = m ? this.matePos(m, 10) : [100, 530]; this.pop(x - 20, y, '+' + e.n, 'good'); break; }
        case 'energy': this.pop(42, 640, '+' + e.n, 'good'); status = true; break;
        case 'boost': this.pop(150, 440, t('Next attack +{n}', { n: e.n }), 'word denim'); break;
        case 'draw': case 'recall': case 'untie': hand = true; break;
        case 'conjure':
          hand = true;
          this.pop(330, 590, CARDS[e.id].type === 'junk' ? t('Knotted!') : t('Conjured!'), CARDS[e.id].type === 'junk' ? 'word coral' : 'word denim');
          break;
        case 'shuffle': this.pop(60, 720, t('Reshuffled'), 'word'); status = true; break;
        case 'drink': this.pop(330, 520, t(DRINKS[e.id].name), 'word denim'); audio.play('water'); status = true; break;
        case 'unjam': status = hand = true; break;
        case 'hurt': {
          // the foe throws itself at the one it hits (or rings out over everyone); on contact they flinch, are
          // knocked back and walk back to their spot
          const m = this.mates.get(e.who), [mx, my] = m ? this.matePos(m, 10) : [110, 520];
          let reach = 0;
          if (v && !rushed.has(e.foe)) {
            rushed.add(e.foe);
            const f = b.foe(e.foe), [fx0, fy0] = this.where(e.foe), aim = f && f.intent.aim;
            if (aim === 'all') reach = shockwave(this.fxEl, fx0, fy0, this.speed);
            else if (m) { const [tx, ty] = this.matePos(m); reach = rush(v.body, [tx - fx0, ty - fy0], { frac: aim === 'back' ? 0.82 : 0.6, hop: aim === 'back', speed: this.speed }); }
          }
          setTimeout(() => {
            if (!this.root.isConnected) return;
            if (e.blocked) this.pop(mx - 20, my - 18, t('{n} blocked', { n: e.blocked }), 'word');
            if (e.n) {
              this.pop(mx - 20 + (Math.random() * 16 - 8), my, '−' + e.n, e.big ? 'big' : '');
              this.flash(this.chillEl, 'flash', 820);
              if (m) { staggered(m.el, this.speed); this.knock(m, e.big ? 28 : 16); if (b.up(e.who)) m.play('Hurt'); }
              this.hitstop(e.big ? 120 : 50);
              if (e.big) this.flash(this.frame, 'shake', 320);
            }
            audio.play(e.big ? 'break' : e.n ? 'bash-s' : 'pop');
          }, reach);
          break;
        }
        case 'ko': {
          this.sitOut(e.who);
          const m = this.mates.get(e.who);
          if (m) { const [x, y] = this.matePos(m, -6); this.pop(x - 20, y, t('{who} is too blue to go on', { who: this.name(e.who) }), 'word coral'); }
          audio.play('close');
          hand = status = true;
          break;
        }
        case 'taunt': {
          const m = this.mates.get(e.who);
          if (m) { const [x, y] = this.matePos(m, -6); this.pop(x - 20, y, t('Look at me!'), 'word denim'); m.to = { x: 26, y: 0 }; m.pace = 120; }
          break;
        }
        case 'wind': this.pop(fx, fy - 20, t('Winding up…'), 'word coral'); audio.play('charge'); break;
        case 'nap': this.pop(fx, fy - 20, 'Zzz…', 'word'); break;
        case 'jam': this.flash(v.el, 'lunge', 360); this.pop(fx, fy - 20, t('Next card +{n}', { n: e.n }), 'word coral'); audio.play('error'); hand = status = true; break;
        case 'call': this.flash(v.el, 'lunge', 360); this.addFoeView(b.foe(e.add), true); audio.play('pop'); foes = true; break;
        case 'steal': this.flash(v.el, 'lunge', 360); this.pop(fx, fy - 20, t('−{n} coins', { n: e.n }), 'word coral'); audio.play('coin'); break;
        case 'flee': v.el.classList.add('fled'); this.pop(fx - 30, fy - 20, t('Ran off with {n} coins', { n: e.n }), 'word coral'); foes = true; break;
      }
    }
    if (foes) this.refreshAim();
    if (hand) { if (this.sel && !b.hand.includes(this.sel)) this.sel = null; this.drawHand(); this.drawHint(); }
    if (status) { this.disp.chill = b.chill; this.disp.foam = b.foam; this.drawStatus(); }
  }
}
