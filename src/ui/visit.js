// Visiting a friend's café (see ONLINE.md "拜訪"). The server hands over their last save, and a second Game
// runs it here only to be looked at: guests come and go and the staff get to work, but whatever it earns is
// thrown away and nothing is written back (`game.visit`: never saved, never talks to the HUD). Your own café
// keeps trading behind it: main.js keeps updating it and the heartbeat keeps uploading it; the renderer just
// draws the friend's café until you go home.
//
// While visiting you can help (social.js): pick up their litter, feed one of their staff a snack from your
// pantry, or send them ingredients. The server checks and records it (cloud.help); the help reaches their
// real café at their next heartbeat, and the copy shown here plays it out straight away.
import { h } from '../util.js';
import { Game } from '../game.js';
import { apply } from '../save.js';
import { cloud } from '../cloud.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { assets } from '../assets.js';
import { portrait } from '../portrait.js';
import { SNACKS, snackById, INGREDIENTS } from '../data.js';
import { FRIENDS } from '../social.js';
import { avatarEl, heartsEl, errText } from './friends.js';
import { glyph } from './icons.js';

export const visit = { game: null, friend: null, left: null, loading: false, busy: false, bar: null };

const FADE = 320;          // ms for the cover to fade in or out (matches #visitcover in style.css)
const HOLD = { go: 1100, home: 700 };   // the cover stays at least this long, so its line can be read
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });

/** A full-screen cover while the café on screen changes: "On the way to Annie's café…". */
function cover(ui, avatar, title, sub) {
  const el = h('div#visitcover',
    h('div.vc-card', h('div.vc-face', avatarEl(avatar, 112)), h('div.vc-title', title), sub ? h('div.vc-sub', sub) : null,
      h('div.vc-dots', h('i'), h('i'), h('i'))));
  ui.root.appendChild(el);
  void el.offsetWidth;
  el.classList.add('show');
  return {
    shown: wait(FADE),
    /** Lift the cover once the new café has been drawn a couple of times (the first frames build the whole room). */
    async lift() { await Promise.race([frames(3), wait(600)]); el.classList.remove('show'); await wait(FADE); el.remove(); },
  };
}

/** Open a friend's café (`f` is a row of the friend list). */
export async function startVisit(ui, f) {
  if (visit.loading) return;
  visit.loading = true;
  audio.play('door');
  const c = cover(ui, f.avatar, t("On the way to {name}'s café…", { name: f.name || t('A friend') }), f.cafe);
  const [r] = await Promise.all([cloud.api('visit', { id: f.id }), c.shown, wait(HOLD.go)]);
  let g = null;
  if (r.status === 200) {
    g = new Game();
    g.visit = true;
    try { apply(g, r.body.save); } catch (e) { console.warn('Visit: bad save', e); g = null; r.body.error = 'save'; }
  }
  if (!g) { visit.loading = false; await c.lift(); ui.toast(errText(r.body.error || 'offline'), 'bad'); return; }
  if (visit.game) leave(ui, false);   // hopping straight from one friend to another

  const home = ui.game;
  if (home.build.active) home.build.exit();
  ui.closePanel(); ui.select(null); ui.toggleQuest(false);
  visit.game = g;
  visit.friend = { id: f.id, name: r.body.name || f.name, cafe: r.body.cafe || g.state.name, level: r.body.level || g.state.level, avatar: r.body.avatar || f.avatar, hearts: r.body.hearts || f.hearts };
  visit.left = r.body.left;
  home.renderer.show(g);
  g.camera.fit(g.world.size);
  ui.root.classList.add('visiting');
  drawBar(ui);
  await c.lift();
  visit.loading = false;
}

/** Back to your own café. */
export async function endVisit(ui) {
  if (!visit.game || visit.loading) return;
  visit.loading = true;
  audio.play('click');
  const me = ui.friends && ui.friends.data && ui.friends.data.me;
  const c = cover(ui, me && me.avatar, t('Heading back to {cafe}…', { cafe: ui.game.state.name }));
  await Promise.all([c.shown, wait(HOLD.home)]);
  leave(ui, true);
  await c.lift();
  visit.loading = false;
}

function leave(ui, home) {
  visit.game = null; visit.friend = null; visit.left = null;
  if (visit.bar) { visit.bar.remove(); visit.bar = null; }
  if (!home) return;
  ui.root.classList.remove('visiting');
  ui.game.renderer.show(ui.game);
  ui.dirty = true;
}

/** Run the friend's café (called every frame next to your own). */
export function updateVisit(dt) { if (visit.game) visit.game.update(dt); }

// ---------------- helping (see ONLINE.md "幫忙與送禮") ----------------
const KIND_ICON = { clean: 'sparkles', snack: 'bowl', gift: 'gift' };
const friendName = () => (visit.friend && visit.friend.name) || t('A friend');

function drawBar(ui) {
  const f = visit.friend, left = visit.left || {};
  const act = (kind, label, onclick) => h('button.btn.small.help-act' + (left[kind] > 0 ? '' : '.done'), { onclick, title: label },
    glyph(KIND_ICON[kind], 18), h('span', label), h('span.help-n', left[kind] > 0 ? '×' + left[kind] : glyph('check', 12)));
  const bar = h('div#visitbar.card',
    h('div.vb-top',
      avatarEl(f.avatar, 44),
      h('div.grow',
        h('b', t("Visiting {name}'s café", { name: friendName() })),
        h('div.muted.small', `${f.cafe} · ${t('Lv {n}', { n: f.level })} `, heartsEl(f.hearts))),
      h('button.btn.primary.small.vb-back', { onclick: () => endVisit(ui), title: t('Back to my café'), 'aria-label': t('Back to my café') }, glyph('back', 15), h('span', t('Back to my café')))),
    h('div.vb-help',
      act('clean', t('Pick up litter'), () => cleanUp(ui)),
      act('snack', t('Feed a snack'), () => openCard(ui, 'snack', () => snackCard(ui))),
      act('gift', t('Send ingredients'), () => openCard(ui, 'gift', () => giftCard(ui)))));
  if (visit.bar) visit.bar.remove();
  visit.bar = bar;
  ui.root.appendChild(bar);
}

/** A tap in the friend's café: one of their staff → feed them; litter (or right next to it) → pick it up. */
export function visitTap(ui, renderer, vx, vy) {
  const g = visit.game;
  if (!g || visit.loading) return;
  const a = renderer.pickAgent(vx, vy);
  if (a && a.kind === 'staff') { g.sfx('click'); openCard(ui, 'snack', () => snackCard(ui, a.look.model)); return; }
  const tile = renderer.pickTile(vx, vy);
  const near = g.world.trash.find((p) => Math.abs(p.x - tile.x) <= 1 && Math.abs(p.y - tile.y) <= 1);
  if (near) cleanUp(ui, near);
}

/** Open a help card, unless that kind of help is used up for today. */
function openCard(ui, kind, card) {
  if (!spent(ui, kind) && !ui.modalOpen) ui.queueModal(card);
}
function spent(ui, kind) {
  if (visit.left && visit.left[kind] > 0) return false;
  ui.toast(t("That's all of this kind of help for {name} today. Come back tomorrow 💗", { name: friendName() }));
  return true;
}

/** Send one help to the server; on success pay for it in your own café and play it out in theirs. */
async function send(ui, req, done) {
  if (visit.busy) return false;
  visit.busy = true;
  const home = ui.game, friend = visit.friend, before = friend.hearts;
  const r = await cloud.help(home, friend.id, req);
  visit.busy = false;
  if (r.status !== 200) { ui.toast(errText(r.body.error || 'offline'), 'bad'); return false; }
  // the server took the cost out of the save it holds: take the same out of the café that is running
  const s = home.state;
  if (req.kind === 'snack') { s.snacks[req.snack] = Math.max(0, (s.snacks[req.snack] || 0) - 1); if (!s.snacks[req.snack]) delete s.snacks[req.snack]; }
  if (req.kind === 'gift') for (const [id, n] of Object.entries(req.items)) { s.inv[id] = Math.max(0, (s.inv[id] || 0) - n); if (!s.inv[id]) delete s.inv[id]; }
  home.eco.addPoints(FRIENDS.helperPoints);
  home.changed('inv');
  if (ui.friends) ui.friends.at = 0;   // the friend list shows what is left today: fetch it again next time
  if (visit.friend !== friend) return true;   // went home while waiting
  visit.left = r.body.left;
  friend.hearts = r.body.hearts;
  if (done) done();
  drawBar(ui);
  ui.toast(t('+{p} café points · friendship +{f} 💗', { p: FRIENDS.helperPoints, f: FRIENDS.friendship[req.kind] }), 'good');
  if (friend.hearts > before) ui.toast(t('You and {name} are now {n} hearts close! 💗', { name: friendName(), n: friend.hearts }), 'good');
  return true;
}

async function cleanUp(ui, near) {
  const g = visit.game;
  if (!g || spent(ui, 'clean')) return;
  if (!g.world.trash.length) { ui.toast(errText('nothing')); return; }
  await send(ui, { kind: 'clean' }, () => {
    // up to FRIENDS.cleanPerVisit pieces, starting with the one tapped
    const by = near || g.world.trash[0], d = (p) => Math.hypot(p.x - by.x, p.y - by.y);
    const pile = [...g.world.trash].sort((a, b) => d(a) - d(b)).slice(0, FRIENDS.cleanPerVisit);
    for (const p of pile) { g.fx.puff(g.at(p.x + 0.5, p.y + 0.5, 20), '#ffffff', 4); g.fx.sparkle(g.at(p.x + 0.5, p.y + 0.5, 30), 6); g.world.removeTrash(p); }
    g.floatText(by.x + 0.5, by.y + 0.5, t('Sparkling!'), 'emote_sparkle', '#ffe27a', 70);
    g.sfx('sweep');
  });
}

/** The send button of a help card: busy while the server answers, closes the card when it went through. */
function sendBtn(ui, label, enabled, run) {
  return h('button.btn.primary', { disabled: !enabled, onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.classList.add('busy');
    if (await run()) ui.closeModal();
    else { b.disabled = false; b.classList.remove('busy'); }
  } }, label);
}

// ----- feed a snack: one of their staff, one of your snacks
function snackCard(ui, preset) {
  const g = visit.game;
  const mine = ui.game.state.snacks || {};
  const staff = g ? g.staff : [];
  const first = SNACKS.find((sn) => mine[sn.id] > 0);
  const pick = { staff: staff.some((a) => a.look.model === preset) ? preset : null, snack: first ? first.id : null };
  const card = h('div.card.help-card');
  const draw = () => {
    const who = staff.find((a) => a.look.model === pick.staff), sn = snackById[pick.snack];
    card.replaceChildren(
      h('div.big-title', t('Feed a snack')),
      h('div.muted', t("Pick someone on {name}'s team, then a snack from your pantry.", { name: friendName() })),
      h('div.section-title', t('Who')),
      h('div.pick-staff', staff.map((a) => h('button.pick-tile' + (pick.staff === a.look.model ? '.on' : ''), { onclick: () => { pick.staff = a.look.model; draw(); }, title: a.name },
        portrait(a.look, 44, 44, 'pick-face'),
        h('b', a.name),
        h('div.pbar.' + (a.energy < 30 ? 'red' : a.energy < 60 ? 'orange' : 'green'), h('i', { style: { width: Math.round(a.energy) + '%' } }))))),
      h('div.section-title', t('Snack')),
      h('div.pick-snacks', SNACKS.map((s) => h('button.pick-snack' + (pick.snack === s.id ? '.on' : ''), {
        disabled: !(mine[s.id] > 0), onclick: () => { pick.snack = s.id; draw(); }, title: s.name },
        assets.iconEl(s.asset, 30), h('span.ps-name', s.name), h('span.muted.small', t('+{n} energy', { n: s.energy })), h('b', '×' + (mine[s.id] || 0))))),
      first ? null : h('div.away-note.warn', t('Your pantry has no snacks. Buy some at the Market first.')),
      h('div.btnrow.help-btns',
        h('button.btn', { onclick: () => ui.closeModal() }, t('Cancel')),
        sendBtn(ui, who && sn ? t('Give {name} a {snack}', { name: who.name, snack: sn.name }) : t('Feed'), !!(who && sn), () =>
          send(ui, { kind: 'snack', snack: sn.id, staff: who.look.model }, () => {
            who.feed(sn);
            g.floatText(who.x, who.y, '+' + sn.energy, 'icon_energy', '#8fd18a', 110);
            g.sfx('eat');
          }))));
  };
  draw();
  return card;
}

// ----- send ingredients: a few from your pantry, up to what is left today
function giftCard(ui) {
  const g = visit.game;
  const inv = ui.game.state.inv || {};
  const have = INGREDIENTS.filter((i) => (inv[i.id] || 0) > 0);
  const cap = (visit.left && visit.left.gift) || 0;
  const items = {};
  const total = () => Object.values(items).reduce((a, b) => a + b, 0);
  const card = h('div.card.help-card');
  const draw = () => {
    const n = total();
    card.replaceChildren(
      h('div.big-title', t('Send ingredients')),
      h('div.muted', t("Up to {n} today. They go straight into {name}'s pantry.", { n: cap, name: friendName() })),
      have.length ? h('div.pick-list', have.map((i) => {
        const k = items[i.id] || 0;
        const step = (d) => { const v = Math.max(0, Math.min(inv[i.id], k + d)); if (v) items[i.id] = v; else delete items[i.id]; draw(); };
        return h('div.pick-row.gift-row' + (k ? '.on' : ''),
          assets.iconEl('ing_' + i.id, 32),
          h('div.grow', h('b', i.name), h('div.muted.small', t('You have {n}', { n: inv[i.id] }))),
          h('div.stepper',
            h('button.btn.small', { disabled: !k, onclick: () => step(-1), 'aria-label': t('Less') }, '−'),
            h('b', String(k)),
            h('button.btn.small', { disabled: n >= cap || k >= inv[i.id], onclick: () => step(1), 'aria-label': t('More') }, '+')));
      })) : h('div.away-note.warn', t('Your pantry is empty. Restock at the Market first.')),
      h('div.muted.small.gift-total', t('{n} / {m} today', { n, m: cap })),
      h('div.btnrow.help-btns',
        h('button.btn', { onclick: () => ui.closeModal() }, t('Cancel')),
        sendBtn(ui, n ? t('Send {n}', { n }) : t('Send'), n > 0, () => {
          const sent = { ...items };
          return send(ui, { kind: 'gift', items: sent }, () => {
            for (const [id, k] of Object.entries(sent)) g.state.inv[id] = (g.state.inv[id] || 0) + k;
            const e = g.world.entry;
            g.floatText(e.x + 0.5, e.y + 0.5, t('+{n} ingredients', { n: Object.values(sent).reduce((a, b) => a + b, 0) }), 'icon_gift', '#ffd86b', 90);
            g.fx.sparkle(g.at(e.x + 0.5, e.y + 0.5, 40), 14);
            g.sfx('pop');
          });
        })));
  };
  draw();
  return card;
}
