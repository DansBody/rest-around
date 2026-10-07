// Today panel: the daily gift and its 7-day streak, the three daily goals and the chest for finishing all
// three. Nothing is paid on its own: every reward waits here behind a Claim button, so the player sees what
// they got (the Today button top-left counts what is waiting). Rewards are study vouchers (研習券, spent in the
// Menu to level a dish) plus coins and points; see DAILY and QUESTS in data.js.
import { h, fmt } from '../util.js';
import { assets } from '../assets.js';
import { DAILY, SNACKS, STARTER, questById } from '../data.js';
import { wallSec } from '../clock.js';
import { glyph } from './icons.js';
import { t } from '../i18n.js';

const I = (id, s = 22) => assets.iconEl(id, s);
const GOAL_ICON = { cups: 'tool_menu', guests: 'tool_staff', bakes: 'dish_croissant', coins: 'icon_coin', snack: SNACKS[0].asset, market: 'tool_market', cast: 'emote_sparkle', seats: 'tool_build', study: 'icon_voucher' };

/** Reward chips: vouchers first (what the day is really about), then coins and points. */
function rewardChips(r) {
  return h('div.chips.reward',
    r.vouchers ? h('span.pill.voucher', I('icon_voucher', 18), '×' + r.vouchers) : null,
    r.coins ? h('span.pill', I('icon_coin', 18), fmt(r.coins)) : null,
    r.points ? h('span.pill', I('icon_points', 18), fmt(r.points)) : null);
}

/** "5:12:33" until the player's local midnight, when the goals and the gift come round again. */
function untilReset(g) {
  const s = g.state, now = Date.now() + (g.clockSkew || 0) * 1000;
  const left = Math.max(0, Math.ceil(86400 - (wallSec(now, s.tz) % 86400)));
  const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function renderToday(ui, body) {
  const g = ui.game, s = g.state, eco = g.eco;
  eco.checkDate();
  const d = s.daily;

  body.append(h('div.today-head',
    h('div.vbal', I('icon_voucher', 30), h('div', h('b', fmt(s.vouchers || 0)), h('small', t('Study vouchers')))),
    h('div.reset', h('small', t('New goals in')), h('b.today-reset', untilReset(g)))));

  // getting started: the step under way, until all are claimed
  const sx = eco.starterStep();
  if (sx) {
    body.append(h('div.section-title', t('Getting started · {n}/{m}', { n: sx.i + 1, m: STARTER.length })));
    body.append(h('div.row.split.goal' + (sx.done ? '.ready' : ''),
      h('div.g-ico', I(GOAL_ICON[sx.def.kind] || 'icon_points', 30)),
      h('div.grow',
        h('h3', t(sx.def.text, { n: fmt(sx.def.n) })),
        h('div.g-prog', h('div.pbar' + (sx.done ? '.green' : ''), h('i', { style: { width: Math.min(100, sx.prog / sx.def.n * 100) + '%' } })), h('span.g-n', `${fmt(sx.prog)}/${fmt(sx.def.n)}`))),
      h('button.btn.small' + (sx.done ? '.primary' : '.disabled'), { disabled: !sx.done, onclick: () => claim(ui, eco.claimStarter()) }, t('Claim')),
      h('div.row-full', rewardChips({ coins: sx.def.coins, points: sx.def.points }))));
  }

  // the gift, with the streak of days it was opened in a row
  const k = eco.streak(), open = eco.giftAvailable();
  const dots = [];
  for (let i = 1; i <= DAILY.streakDays; i++) {
    const got = i <= (open ? k.n % DAILY.streakDays : k.n);   // after the 7th, a new week starts on the next gift
    const next = open && i === k.next;
    dots.push(h('span.sdot' + (got ? '.on' : '') + (next ? '.next' : '') + (i === DAILY.streakDays ? '.big' : ''), i === DAILY.streakDays ? I('icon_voucher', 14) : null));
  }
  body.append(h('div.row.split.today-gift' + (open ? '.ready' : ''),
    I('icon_gift', 40),
    h('div.grow',
      h('h3', t('Daily gift')),
      h('div.muted', open ? t('Day {n} of {m} in a row. The 7th gift brings {v} study vouchers.', { n: k.next, m: DAILY.streakDays, v: DAILY.streakVouchers })
        : t('Opened today (day {n} in a row). Come back tomorrow!', { n: k.n }))),
    open ? h('button.btn.primary.small', { onclick: () => ui.claimGift() }, t('Open!')) : h('span.pill.claimed', glyph('check', 14), t('Opened')),
    h('div.row-full.flat.streak', dots)));

  // the three goals
  body.append(h('div.section-title', t("Today's goals")));
  if (!d || !d.goals.length) body.append(h('div.muted', t('New goals arrive at midnight.')));
  for (const [i, q] of (d ? d.goals : []).entries()) {
    const def = questById[q.id], done = q.prog >= q.target;
    const r = eco.goalReward();
    body.append(h('div.row.split.goal' + (q.claimed ? '.claimed' : done ? '.ready' : ''),
      h('div.g-ico', I(GOAL_ICON[q.id] || 'icon_coin', 30)),
      h('div.grow',
        h('h3', t(def.text, { n: fmt(q.target) })),
        h('div.g-prog', h('div.pbar' + (done ? '.green' : ''), h('i', { style: { width: Math.min(100, q.prog / q.target * 100) + '%' } })), h('span.g-n', `${fmt(q.prog)}/${fmt(q.target)}`)),
        def.kind === 'serve' ? h('small.g-note', t('The café works on this while you are away')) : null),
      q.claimed ? h('span.pill.claimed', glyph('check', 14), t('Claimed'))
        : h('button.btn.small' + (done ? '.primary' : '.disabled'), { disabled: !done, onclick: () => claim(ui, eco.claimGoal(i)) }, t('Claim')),
      h('div.row-full', rewardChips(r))));
  }

  // all three claimed: the chest
  if (d && d.goals.length) {
    const ready = eco.chestReady(), left = d.goals.filter((q) => !q.claimed).length;
    body.append(h('div.row.split.today-chest' + (d.chest ? '.claimed' : ready ? '.ready' : ''),
      h('div.g-ico', glyph('sparkles', 28)),
      h('div.grow',
        h('h3', t('Bonus for all three')),
        h('div.muted', d.chest ? t('Claimed. See you tomorrow!') : ready ? t('Every goal claimed. Open your bonus!') : t('{n} more to claim', { n: left }))),
      d.chest ? h('span.pill.claimed', glyph('check', 14), t('Claimed'))
        : h('button.btn.small' + (ready ? '.primary' : '.disabled'), { disabled: !ready, onclick: () => claim(ui, eco.claimChest()) }, t('Open!')),
      h('div.row-full', rewardChips(eco.chestReward()))));
  }

  body.append(h('div.muted', { style: { marginTop: '8px' } }, t('Study vouchers level up your drinks and bakes (Menu → Study). They only come from Today and from café level-ups.')));
}

function claim(ui, r) {
  if (!r) return;
  const bits = [r.vouchers && t('+{n} study vouchers', { n: r.vouchers }), r.coins && t('+{n} coins', { n: fmt(r.coins) }), r.points && t('+{n} points', { n: r.points })].filter(Boolean);
  ui.toast(bits.join(' · '), 'good');
  ui.renderPanel();
}

/** Once a second: just the countdown (a new day re-renders the whole panel through checkDate). */
export function tickToday(ui, body) {
  const el = body.querySelector('.today-reset');
  if (el) el.textContent = untilReset(ui.game);
  const s = ui.game.state;
  if (s.daily && s.daily.day !== ui.game.day.today()) ui.renderPanel();
}
