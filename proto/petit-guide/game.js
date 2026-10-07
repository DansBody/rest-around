// Le Petit Guide — prototype of the "chef cooks it personally" mini-games. The start screen offers:
//   a single critic: walks in, orders a latte, the player makes it (萃取 → 打奶泡 → 拉花) and gets 0–3 beans;
//   評鑑之夜 (run.js): a roguelite night of five judges, three hearts and a card to pick after every drink.
// The steps, sound, particles and the drink-making card live in kit.js; the 3D bar in stage3d.js.
import {
  phone, h, wait, ART, vibrate, sfx, PREFS, shotStep, steamStep, artStep, setScreen, beanSvg, fx, use3d, cook,
} from './kit.js';
import { startRun, bestRun } from './run.js';

let pref = PREFS[0];
const fakeTop = () => h('div.topbar', h('span.pill', h('span.dot'), '1,280'), h('span.pill', '★ 4.2'), h('span.pill', 'Lv 7'));

/** The café, with the start card. */
async function intro() {
  const sw = h('button.switch' + (use3d.get() ? '.on' : ''), { 'aria-label': '3D 吧台' });
  sw.addEventListener('click', () => { const v = !use3d.get(); use3d.set(v); sw.classList.toggle('on', v); sfx.unlock(); sfx.tap(); });
  const best = bestRun();
  const start = h('div.intro-card.card',
    h('div.kicker', 'Refillit · 小遊戲原型'),
    h('h1', { style: 'margin:6px 0 8px' }, 'Le Petit Guide'),
    h('div.muted', '神秘評審偶爾會走進你的咖啡廳。親自下廚，用一杯咖啡征服他。'),
    h('div.row.setting', h('div.grow', h('b', '3D 吧台'), h('div.muted', '上方顯示 Mocha Latte 和評審的即時反應')), sw),
    h('div.row', { style: 'margin-top:12px' },
      h('button.btn', { onclick: () => { sfx.unlock(); sfx.tap(); arrive(); } }, '單次評審'),
      h('button.btn.primary', { onclick: () => { sfx.unlock(); sfx.tap(); startRun(intro); } }, '評鑑之夜')),
    best ? h('div.muted.best', `最佳紀錄：${best.win ? '通關' : `第 ${best.reached} 位`} · ${best.beans} 顆豆 · 累積靈感 ${best.inspiration}`) : null);
  setScreen(h('div.cafe'), fakeTop(), start);
}

/** The rumour, then the critic walks in and orders. */
async function arrive() {
  pref = PREFS[Math.floor(Math.random() * PREFS.length)];
  if (use3d.get()) import('./stage3d.js').then((m) => m.loadBar()).catch(() => {});   // warm up while the critic walks in
  const toast = h('div.toast', h('span.ico', '🧐'), h('div', '聽說 Le Petit Guide 的評審就在附近⋯'));
  const walker = h('img.critic-walk', { src: ART('critic_neutral'), alt: '' });
  setScreen(h('div.cafe'), fakeTop(), toast, walker);
  await wait(60); toast.classList.add('in'); sfx.tap();
  await wait(1300); walker.classList.add('in');
  await wait(2300); toast.classList.remove('in');
  const sheet = h('div.sheet',
    h('div.kicker', 'Le Petit Guide 評審來訪'),
    h('div.critic-hero',
      h('img', { src: ART('critic_neutral'), alt: '評審' }),
      h('div.bubble.grow', `Bonjour。${pref.line}`)),
    h('div.card',
      h('div.order', h('div.cup', '☕'), h('div.grow', h('h2', '拿鐵'), h('div.muted', '萃取 → 打奶泡 → 拉花'))),
      h('div.prefs', pref.tags.map((t) => h('span.tag', t)))),
    h('div.muted', { style: 'text-align:center' }, '親自下廚分數高、獎勵多；交給店員穩穩拿到 1 顆豆。'),
    h('div.row',
      h('button.btn', { onclick: () => { sfx.tap(); staffMakes(); } }, '交給店員'),
      h('button.btn.primary', { onclick: () => { sfx.tap(); cookLatte(); } }, '親自下廚')));
  phone.append(sheet);
  await wait(30); sheet.classList.add('in');
}

async function cookLatte() {
  const { results, triple } = await cook({ steps: [shotStep(pref), steamStep(pref), artStep(pref)] });
  tasting(results, { triple });
}

async function staffMakes() {
  const sheet = h('div.sheet.full.in', h('div.center', { style: 'margin:auto' },
    h('img', { src: ART('mocha'), style: 'width:120px;border-radius:28px;background:#efe6f8' }),
    h('h2', 'Mocha Latte 正在做拿鐵'), h('div.dots', h('span'), h('span'), h('span'))));
  setScreen(sheet);
  await wait(1800);
  tasting([{ name: '萃取', score: 0.55, note: '普通的萃取' }, { name: '奶泡', score: 0.5, note: '奶泡普通' }, { name: '拉花', score: 0.4, note: '拉花有點隨便' }]);
}

async function tasting(results, opts = {}) {
  const sheet = h('div.sheet.full.in', h('div.center', { style: 'margin:auto' },
    h('img.critic-big', { src: ART('critic_neutral'), alt: '' }),
    h('h2', '評審品嚐中⋯'), h('div.dots', h('span'), h('span'), h('span'))));
  setScreen(sheet);
  await wait(2000);
  result(results, opts);
}

function review(results, beans, triple) {
  const best = [...results].sort((a, b) => b.score - a.score)[0], worst = [...results].sort((a, b) => a.score - b.score)[0];
  if (triple) return 'Parfait！萃取、奶泡、拉花沒有一處可以挑剔。這一杯，我會記很久。';
  if (beans === 3) return `C'est magnifique！${best.note}，每一口都很有誠意。我會把這間店寫進今年的指南。`;
  if (beans === 2) return `很不錯的一杯。${best.note}；不過${worst.note}。下次我還會再來。`;
  if (beans === 1) return `嗯⋯${worst.note}。看得出用心，但還差一點火候。`;
  return `${worst.note}。我的筆記本今天沒有什麼好話可寫。`;
}

async function result(results, { triple = false } = {}) {
  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  const beans = triple ? 3 : avg >= 0.85 ? 3 : avg >= 0.6 ? 2 : avg >= 0.35 ? 1 : 0;
  const face = beans >= 2 ? 'critic_happy' : beans === 1 ? 'critic_neutral' : 'critic_grumpy';
  const coins = Math.round([20, 60, 140, 300][beans] * (triple ? 1.5 : 1)), stars = [0, 0.1, 0.2, 0.4][beans];
  const beanEls = [0, 1, 2].map((i) => { const s = h('span', { html: beanSvg(i < beans) }); return s.firstChild; });
  const bars = results.map((r) => {
    const fill = h('i');
    const row = h('div.bar', h('span', r.name), h('div.track', fill), h('b', `${Math.round(r.score * 100)}`), h('em', r.note));
    setTimeout(() => (fill.style.width = `${Math.round(r.score * 100)}%`), 700);
    return row;
  });
  const sheet = h('div.sheet.full.in',
    h('div.scroll',
      h('div.center',
        h('div.kicker', 'Le Petit Guide 評鑑'),
        h('img.critic-big', { src: ART(face), alt: '', style: 'width:180px' }),
        h('div.beans', beanEls),
        h('h2', ['今天沒有拿到豆子', '一豆：還不錯', '二豆：值得特地前往', '三豆：此生必訪'][beans]),
        h('div.quote', review(results, beans, triple))),
      h('div.card', h('div.bars', bars)),
      h('div.reward', h('span.pill', h('span.dot'), `+${coins}`), stars ? h('span.pill', `評價 +${stars} ★`) : null, triple ? h('span.pill.gold', '連續完美 +50%') : null),
      beans === 3 ? h('div.plaque', h('img', { src: ART('plaque_cut'), alt: '' }), h('div', h('b', '獲得 Le Petit Guide 推薦證書'), h('div.muted', '會掛在店裡的牆上，提升咖啡廳魅力。'))) : null),
    h('div.row',
      h('button.btn', { onclick: () => { sfx.tap(); intro(); } }, '回到咖啡廳'),
      h('button.btn.primary', { onclick: () => { sfx.tap(); arrive(); } }, '再來一位評審')));
  setScreen(sheet);
  for (let i = 0; i < 3; i++) {
    await wait(350);
    beanEls[i].classList.add('pop');
    if (i < beans) {
      sfx.bean(i); vibrate(12);
      const r = beanEls[i].getBoundingClientRect(), pr = phone.getBoundingClientRect();
      fx.burst(r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2, 'good');
    }
  }
}

window.__pg = { intro, arrive, cookLatte, result, startRun: () => startRun(intro), setPref: (i) => (pref = PREFS[i]) };   // for testing from the console
intro();
