// Today's specials (今日特色), on screen: a round button under Friends (the day's theme icon, a red dot while a
// card waits to be picked) and the card that opens from it, or by itself when a round opens: the day's theme, the
// cards picked so far, and this round's three to pick from. Behind the debug switch while it is tried out.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { roundOfDay } from '../clock.js';
import { DAY } from '../data.js';
import {
  specialsEnabled, syncDay, pickPending, offerFor, choose, themeById, specialById, dishName,
} from '../specials.js';

/** The round button; ui.update() keeps it current (updateSpecials). */
export function specialsButton(ui) {
  const btn = h('button.chip#specialbtn', { title: t('Today\'s specials'), 'aria-label': t('Today\'s specials'), onclick: () => openSpecials(ui) },
    h('span.sp-ico', '🃏'), h('span.sp-dot'));
  return btn;
}

/** Shows / hides the button, puts the theme on it, and opens the pick once per round when nothing else is up. */
export function updateSpecials(ui) {
  const g = ui.game, btn = ui.el.specialBtn;
  const on = specialsEnabled() && !g.visit;
  btn.style.display = on ? '' : 'none';
  if (!on) return;
  syncDay(g);
  const sp = g.state.specials, theme = themeById[sp.theme];
  const pending = pickPending(g);
  btn.classList.toggle('pending', pending);
  btn.firstChild.textContent = theme ? theme.icon : '🃏';
  const busy = ui.tutorial || ui.modalOpen || ui.panel || g.build.active || ui.el.receipt.classList.contains('show') || ui.el.celebrate.classList.contains('show');
  // a new round opens: offer the pick by itself, once (a few seconds in, so the doors-open toast reads first)
  if (pending && !busy && ui.spOffered !== g.state.round && g.state.clock > 3) {
    ui.spOffered = g.state.round;
    openSpecials(ui);
  }
}

const cardText = (c, pick) => t(c.desc, { dish: pick && pick.dish ? dishName(pick.dish) : '' });

function pickCard(ui, card) {
  const c = specialById[card.id];
  return h('button.sp-card', {
    onclick: () => {
      choose(ui.game, card);
      ui.game.sfx('ding');
      ui.closeModal();
      ui.toast(t('{icon} {name} — on until midnight', { icon: c.icon, name: card.dish ? `${t(c.name)}：${dishName(card.dish)}` : t(c.name) }), 'good');
    },
  },
  h('span.sp-cicon', c.icon),
  h('span.sp-cbody', h('b', card.dish ? `${t(c.name)}：${dishName(card.dish)}` : t(c.name)), h('span', cardText(c, card))));
}

/** The specials card: the theme, today's cards, and (if one is waiting) this round's pick of three. */
export function openSpecials(ui) {
  const g = ui.game;
  if (!specialsEnabled()) return;
  syncDay(g);
  ui.queueModal(() => {
    const s = g.state, sp = s.specials, theme = themeById[sp.theme];
    const pending = pickPending(g);
    const slot = roundOfDay(s.round), hour = String(slot * (DAY.round / 3600)).padStart(2, '0');
    const picks = sp.picks.map((p) => {
      const c = specialById[p.id];
      return h('div.sp-have', h('span.sp-cicon.small', c.icon), h('span.sp-cbody', h('b', p.dish ? `${t(c.name)}：${dishName(p.dish)}` : t(c.name)), h('span', cardText(c, p))));
    });
    return h('div.card.specials',
      h('div.sp-kicker', t('Today\'s specials')),
      h('div.sp-theme', h('span.sp-ticon', theme.icon), h('div', h('b', t(theme.name)), h('span', t(theme.desc)))),
      pending ? h('div.sp-round', t('Round at {h}:00 — pick one card. Cards stack until midnight.', { h: hour })) : null,
      pending ? h('div.sp-picks', offerFor(g).map((c) => pickCard(ui, c))) : null,
      h('div.sp-sub', picks.length ? t('On today ({n})', { n: picks.length }) : t('No cards yet today')),
      picks.length ? h('div.sp-list', picks) : null,
      !pending ? h('div.muted.sp-note', g.day.isNight ? t('The café is closed for the night. The next round brings a new card.') : t('This round\'s card is picked. The next round brings another.')) : null,
      h('button.btn' + (pending ? '' : '.primary'), { onclick: () => ui.closeModal() }, pending ? t('Later') : t('Close')));
  });
}
