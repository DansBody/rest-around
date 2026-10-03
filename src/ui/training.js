// Training tab: staff learn to handle trouble at a club (see CLUBS / TROUBLE in data.js). Each staff member
// trains on their own by passing the club's mini-game; the fee is paid when they pass, so a retry is free.
//   Baseball Club → batting practice: swing as the pitch reaches the circle (Home Run).
//   Track Club    → a sprint: tap Left and Right in turn to reach the finish in time (Chase Down).
// Both are played in 3D with the staff member's own character (tryout3d.js); the score is drawn on top.
// The café waits (game.hold) while a mini-game is on screen.
import { h, fmt, shuffle } from '../util.js';
import { assets } from '../assets.js';
import { portrait } from '../portrait.js';
import { CLUBS, TROUBLE } from '../data.js';
import { DISPLAY_FONT } from '../placeholder.js';
import { audio } from '../audio.js';
import { BattingStage, SprintStage } from '../tryout3d.js';
import { glyph } from './icons.js';
import { t } from '../i18n.js';

const coinPill = (n) => h('span.pill', assets.iconEl('icon_coin', 18), fmt(n));
const TROUBLE_NAME = { rude: 'Rude guests', dash: 'Dine and dash' };

// ------------------------------------------------------------------ the panel
export function renderTraining(ui, body) {
  const g = ui.game, s = g.state;
  body.append(h('div.muted', t('Now and then a guest makes trouble. Send your staff to a club: each one trains on their own and keeps what they learn in every job.')));
  for (const club of Object.values(CLUBS)) {
    const T = TROUBLE[club.trouble];
    const trained = g.staff.filter((a) => a.clubLv(club.id) > 0).length;
    body.append(h('div.club', { style: { '--c': club.color } },
      h('div.club-head',
        h('span.club-ico', glyph(club.glyph, 26)),
        h('div.grow', h('h3', club.name), h('div.club-sub', h('b', club.skill), h('span', '·'), h('span', t(TROUBLE_NAME[club.trouble])))),
        h('span.pill' + (s.level >= T.level ? '.live' : ''), s.level >= T.level ? t('Happening now') : t('From café Lv{n}', { n: T.level }))),
      h('div.club-desc', club.desc),
      ...staffPicker(ui, club),
      !trained && s.level >= T.level ? h('div.bmsg.warn', t('Nobody on the team can handle this yet.')) : null));
  }
  body.append(h('div.muted', { style: { marginTop: '6px' } }, t('When trouble starts, the nearest trained staff member who is free goes by themselves. The club fee is paid only when they pass.')));
}

/** Who goes next, picked like a new hire: the team as tiles (anyone who already knows the skill is
 *  ticked and greyed out), one tile selected, one button to send them. */
function staffPicker(ui, club) {
  const g = ui.game;
  ui.trainPick ||= {};
  const open = g.staff.filter((a) => !a.clubLv(club.id));
  const pick = open.find((a) => a.id === ui.trainPick[club.id]) || open[0];
  const tiles = h('div.pick-staff.club-pick', g.staff.map((a) => {
    const lv = a.clubLv(club.id);
    return h('button.pick-tile' + (a === pick ? '.on' : '') + (lv ? '.done' : ''), { disabled: !!lv, title: a.name, onclick: () => { ui.trainPick[club.id] = a.id; ui.renderPanel(); } },
      portrait(a.look, 56, 56), h('b', a.name), lv ? h('span.pick-learned', glyph('check', 12), t('Lv{n}', { n: lv })) : null);
  }));
  const go = pick
    ? h('button.btn.primary.club-go' + (g.eco.canAfford(club.fee) ? '' : '.disabled'), { onclick: () => startTryout(ui, pick, club) }, t('Train {name}', { name: pick.name }), ' ', coinPill(club.fee))
    : h('div.muted.club-done', t('Everyone on the team has learned {skill}.', { skill: club.skill }));
  return [tiles, go];
}

function startTryout(ui, a, club) {
  const g = ui.game;
  audio.unlock();
  if (!g.eco.canAfford(club.fee)) { ui.toast(t('Not enough coins for {what} (need {n})', { what: club.name, n: club.fee }), 'bad'); g.sfx('error'); return; }
  g.sfx('click');
  ui.queueModal(() => tryoutCard(ui, a, club));
}

// ------------------------------------------------------------------ the tryout card: intro → mini-game → result
function tryoutCard(ui, a, club) {
  const g = ui.game;
  g.hold = true;
  let stop = null;
  const card = h('div.card.tryout', { style: { '--c': club.color } });
  const close = () => { if (stop) stop(); stop = null; g.hold = false; ui.closeModal(); ui.renderPanel(); };
  const how = club.id === 'baseball'
    ? t('Tap (or press Space) to swing just as the ball reaches the circle. Hit {need} of {n} pitches to pass.', { need: BAT.need, n: BAT.pitches })
    : t('Tap Left and Right in turn (or the arrow keys), as fast as you can. Reach the finish within {s} seconds to pass. Same foot twice and you stumble!', { s: RUN.time });
  const intro = () => card.replaceChildren(
    h('div.tryout-hero', portrait(a.look, 72, 72), h('span.club-ico.big', glyph(club.glyph, 30))),
    h('div.big-title', club.name),
    h('div.muted', t("{name}'s tryout for {skill}", { name: a.name, skill: club.skill })),
    h('div.how', how),
    h('div.feed-btns', h('button.btn', { onclick: close }, t('Later')), h('button.btn.primary', { onclick: play }, t('Start'))));
  const play = () => { audio.unlock(); stop = (club.id === 'baseball' ? batting : sprint)(ui, a, card, result, close); };
  const result = (ok, score) => {
    stop = null;
    if (ok && !g.eco.learnClub(a, club.id)) ok = null;   // passed, but the fee could not be paid
    card.replaceChildren(...[
      h('div.tryout-hero', portrait(a.look, 72, 72), h('span.club-ico.big' + (ok ? '' : '.off'), glyph(ok ? 'check' : club.glyph, 30))),
      h('div.big-title', ok ? t('{name} learned {skill}!', { name: a.name, skill: club.skill }) : ok === null ? t('Not enough coins') : t('Not this time')),
      h('div.muted', score),
      ok ? h('div.how', club.desc) : null,
      ok ? h('div.muted', t('Club fee paid: {n} coins', { n: club.fee })) : null,
      ok ? h('button.btn.primary', { onclick: close }, t('Great!'))
        : h('div.feed-btns', h('button.btn', { onclick: close }, t('Later')), ok === null ? null : h('button.btn.primary', { onclick: play }, t('Try again')))].filter(Boolean));
  };
  intro();
  return card;
}

/** The mini-game's picture: the 3D stage (WebGL) with a 2D canvas on top for the score, W×H logical pixels
 *  scaled to the card's width. */
function makeStage(W, H) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const view = h('canvas.tryout-3d');
  const canvas = h('canvas.tryout-hud', { width: Math.round(W * dpr), height: Math.round(H * dpr) });
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const box = h('div.tryout-stage', { style: { aspectRatio: `${W} / ${H}` } }, view, canvas);
  return { box, view, canvas, ctx };
}
/** requestAnimationFrame loop that ends by itself once the canvas leaves the page. Returns stop(). */
function loop(canvas, step) {
  let last = performance.now(), alive = true;
  const frame = (now) => {
    if (!alive || !canvas.isConnected) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // a frame stamped before the loop began counts as 0
    last = now;
    step(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { alive = false; };
}
/** Window key handler that removes itself with the canvas. */
function keys(canvas, fn) {
  const on = (e) => { if (!canvas.isConnected) return window.removeEventListener('keydown', on); fn(e); };
  window.addEventListener('keydown', on);
  return () => window.removeEventListener('keydown', on);
}
function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); }
/** A big word that pops in and fades (Hit!, Strike!, GO!). */
function popText(ctx, msg, x, y, size = 34) {
  if (!msg || msg.t > 1) return;
  const pop = msg.t < 0.12 ? 0.6 + msg.t / 0.12 * 0.5 : msg.t < 0.22 ? 1.1 - (msg.t - 0.12) : 1;
  ctx.save();
  ctx.globalAlpha = msg.t > 0.75 ? 1 - (msg.t - 0.75) / 0.25 : 1;
  ctx.translate(x, y); ctx.scale(pop, pop);
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(msg.text, 0, 0);
  ctx.fillStyle = msg.color; ctx.fillText(msg.text, 0, 0);
  ctx.restore();
}
/** A label on a soft white pill (the score, the time). */
function pillText(ctx, text, x, y, align) {
  ctx.font = `800 14px ${DISPLAY_FONT}`; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 18, x0 = align === 'right' ? x - w : x;
  rr(ctx, x0, y - 12, w, 24, 12); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  ctx.fillStyle = '#1d1d1f'; ctx.textAlign = 'left'; ctx.fillText(text, x0 + 9, y + 0.5);
}

/** The mini-game's header: what it is, and a way out (giving up costs nothing). */
const gameTitle = (gid, text, quit) => h('div.tryout-title', glyph(gid, 20), h('span', text),
  h('button.btn.small.xbtn.tryout-x', { onclick: quit, title: t('Give up'), 'aria-label': t('Give up') }, glyph('close', 14)));

// ------------------------------------------------------------------ Baseball Club: batting practice
// Timing is in pitch progress `u` (0 at release, 1 at the circle): a swing within `good` of 1 is a hit,
// within `perfect` a home run.
const BAT = { pitches: 5, need: 3, perfect: 0.06, good: 0.15, windup: 0.9, after: 1.3, past: 1.3 };

function batting(ui, a, card, done, quit) {
  const W = 300, H = 340;
  const { box, view, canvas, ctx } = makeStage(W, H);
  const stage = new BattingStage(view, a.look);
  const speeds = [0.95, ...shuffle([0.8, 0.68, 1.3, 0.74])];   // a gentle first pitch, then a mix with one change-up
  const st = { i: 0, phase: 'windup', t: 0, u: 0, hits: 0, results: [], swung: false, msg: null };
  const say = (text, color) => { st.msg = { text, color, t: 0 }; };
  stage.windup();

  function swing() {
    if (st.swung || st.phase === 'end') return;
    stage.swing();
    audio.play('sweep');
    if (st.phase !== 'pitch') return;   // a practice swing between pitches
    st.swung = true;
    const off = st.u - 1;
    if (Math.abs(off) <= BAT.good) {
      const perfect = Math.abs(off) <= BAT.perfect;
      st.hits++; st.results.push(true);
      stage.hit(perfect);
      say(perfect ? t('Home run!') : t('Hit!'), perfect ? '#ffd23f' : '#ffffff');
      audio.play('bat');
      if (perfect) audio.play('levelup');
    } else {
      st.results.push(false);
      stage.clearBall();
      say(off < 0 ? t('Too early!') : t('Too late!'), '#ffb3b8');
      audio.play('error');
    }
    st.phase = 'after'; st.t = 0;
  }

  const btn = h('button.btn.primary.tryout-act', { onpointerdown: (e) => { e.preventDefault(); swing(); } }, glyph('bat', 22), t('Swing!'));
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); swing(); });
  const unkey = keys(canvas, (e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) swing(); } });
  card.replaceChildren(gameTitle('bat', t('Batting practice'), quit), box, btn);

  const stop = loop(canvas, (dt) => {
    st.t += dt;
    if (st.msg) st.msg.t += dt;
    if (st.phase === 'windup' && st.t > BAT.windup) {
      st.phase = 'pitch'; st.t = 0; st.u = 0; st.swung = false;
      stage.pitch(0);
      audio.play('pop');
    } else if (st.phase === 'pitch') {
      st.u = st.t / speeds[st.i];
      stage.pitch(st.u);
      if (st.u > BAT.past) { st.results.push(false); say(t('Strike!'), '#ffb3b8'); audio.play('error'); stage.clearBall(); st.phase = 'after'; st.t = 0; }
    } else if (st.phase === 'after' && st.t > BAT.after) {
      st.i++;
      const decided = st.hits >= BAT.need || st.hits + (BAT.pitches - st.i) < BAT.need;
      stage.clearBall();
      st.phase = decided ? 'end' : 'windup'; st.t = 0;
      if (!decided) stage.windup(); else if (st.hits >= BAT.need) stage.cheer();
    } else if (st.phase === 'end' && st.t > 1.1) {
      cleanup();
      return done(st.hits >= BAT.need, t('{n} of {m} pitches hit', { n: st.hits, m: st.results.length }));
    }
    stage.update(dt, st.phase === 'pitch' && Math.abs(st.u - 1) <= BAT.good);
    draw();
  });
  function cleanup() { stop(); unkey(); stage.dispose(); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // one pip per pitch, and the hits so far
    for (let i = 0; i < BAT.pitches; i++) {
      const x = 20 + i * 21, y = 20, r = st.results[i];
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = r === true ? '#1f9d55' : r === false ? '#e5484d' : 'rgba(255,255,255,.9)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    }
    pillText(ctx, t('Hits {n}/{m}', { n: st.hits, m: BAT.need }), W - 10, 20, 'right');
    popText(ctx, st.msg, W / 2, 150);
  }
  return cleanup;
}

// ------------------------------------------------------------------ Track Club: the sprint
const RUN = { steps: 30, time: 6.5, count: 0.65, stumble: 0.3 };

function sprint(ui, a, card, done, quit) {
  const W = 300, H = 260;
  const { box, view, canvas, ctx } = makeStage(W, H);
  const stage = new SprintStage(view, a.look);
  const st = { phase: 'count', t: 0, n: 3, steps: 0, last: null, stumble: 0, left: RUN.time, taps: [], msg: null };
  const say = (text, color) => { st.msg = { text, color, t: 0 }; };
  say('3', '#ffffff'); audio.play('tap');

  function press(foot, el) {
    if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    if (st.phase !== 'run' || st.stumble > 0) return;
    if (foot === st.last) { st.stumble = RUN.stumble; audio.play('error'); say(t('Stumble!'), '#ffb3b8'); return; }
    st.last = foot; st.steps++; st.taps.push(st.t);
    audio.play('step');
    if (st.steps >= RUN.steps) { st.phase = 'won'; st.t = 0; say(t('Finish!'), '#ffd23f'); audio.play('levelup'); }
  }
  const bL = h('button.btn.tryout-foot', { onpointerdown: (e) => { e.preventDefault(); press('L', bL); } }, glyph('back', 18), t('Left'));
  const bR = h('button.btn.tryout-foot', { onpointerdown: (e) => { e.preventDefault(); press('R', bR); } }, t('Right'), glyph('forward', 18));
  const unkey = keys(canvas, (e) => {
    if (e.repeat) return;
    if (['ArrowLeft', 'KeyA', 'KeyF'].includes(e.code)) { e.preventDefault(); press('L', bL); }
    if (['ArrowRight', 'KeyD', 'KeyJ'].includes(e.code)) { e.preventDefault(); press('R', bR); }
  });
  card.replaceChildren(gameTitle('run', t('The sprint'), quit), box, h('div.tryout-feet', bL, bR));

  const stop = loop(canvas, (dt) => {
    st.t += dt;
    if (st.msg) st.msg.t += dt;
    st.stumble = Math.max(0, st.stumble - dt);
    if (st.phase === 'count' && st.t > RUN.count) {
      st.t = 0; st.n--;
      if (st.n > 0) { say(String(st.n), '#ffffff'); audio.play('tap'); } else { st.phase = 'run'; say(t('GO!'), '#ffd23f'); audio.play('ding'); }
    } else if (st.phase === 'run') {
      st.left -= dt;
      if (st.left <= 0) { st.left = 0; st.phase = 'lost'; st.t = 0; say(t("Time's up!"), '#ffb3b8'); audio.play('error'); }
    } else if ((st.phase === 'won' || st.phase === 'lost') && st.t > 1.3) {
      cleanup();
      return done(st.phase === 'won', st.phase === 'won'
        ? t('Crossed the line with {s} s to spare', { s: st.left.toFixed(1) })
        : t('{n} of {m} steps', { n: st.steps, m: RUN.steps }));
    }
    // taps in the last 0.6 s: how fast the legs go
    st.taps = st.taps.filter((x) => st.t - x < 0.6 && x <= st.t);
    const pace = st.phase === 'run' ? st.taps.length / 0.6 : 0;
    const mode = st.phase === 'won' ? 'won' : st.phase === 'lost' ? 'lost' : st.stumble > 0 ? 'stumble' : st.phase === 'run' ? 'run' : 'ready';
    stage.update(dt, st.steps / RUN.steps, pace, mode);
    draw();
  });
  function cleanup() { stop(); unkey(); stage.dispose(); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const frac = st.left / RUN.time;
    rr(ctx, 12, 12, W - 24, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    rr(ctx, 12, 12, Math.max(12, (W - 24) * frac), 12, 6); ctx.fillStyle = st.left < 2 ? '#e5484d' : '#1f9d55'; ctx.fill();
    pillText(ctx, t('{n} s', { n: st.left.toFixed(1) }), 12, 42, 'left');
    pillText(ctx, t('Steps {n}/{m}', { n: st.steps, m: RUN.steps }), W - 12, 42, 'right');
    popText(ctx, st.msg, W / 2, 110, st.phase === 'count' ? 46 : 32);
  }
  return cleanup;
}
