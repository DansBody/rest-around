// Visiting a friend's café (see ONLINE.md "拜訪"). The server hands over their last save, and a second Game
// runs it here only to be looked at: guests come and go and the staff get to work, but whatever it earns is
// thrown away and nothing is written back (`game.visit`: never saved, never talks to the HUD). Your own café
// keeps trading behind it: main.js keeps updating it and the heartbeat keeps uploading it; the renderer just
// draws the friend's café until you go home.
import { h } from '../util.js';
import { Game } from '../game.js';
import { apply } from '../save.js';
import { cloud } from '../cloud.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { avatarEl, heartsEl, leftText, errText } from './friends.js';
import { gl } from './icons.js';

export const visit = { game: null, friend: null, left: null, loading: false, bar: null };

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

function drawBar(ui) {
  const f = visit.friend, left = leftText(visit.left);
  const bar = h('div#visitbar.card',
    avatarEl(f.avatar, 44),
    h('div.grow',
      h('b', t("Visiting {name}'s café", { name: f.name || t('A friend') })),
      h('div.muted.small', `${f.cafe} · ${t('Lv {n}', { n: f.level })} `, heartsEl(f.hearts)),
      h('div.muted.small', left.length ? t('You can still help today: {what}', { what: left.join(' · ') }) : t('You helped as much as you can today 💗'))),
    h('button.btn.primary.small', { onclick: () => endVisit(ui) }, gl('back', t('Back to my café'), 15)));
  if (visit.bar) visit.bar.remove();
  visit.bar = bar;
  ui.root.appendChild(bar);
}
