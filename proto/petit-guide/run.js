// 評鑑之夜 — the roguelite night: five judges of Le Petit Guide in a row, harder each time, the editor-in-chief last.
// Three hearts: every 可惜 costs one, and the night ends when they run out (rewards are kept either way).
// After every drink the player picks one of three cards: tools widen a step's perfect band, partners add Time
// Pauses or tip bonuses, techniques change a step (a tulip instead of a heart), and trade-offs make it harder for
// bigger tips. The cards stack into a build; the night pays out 靈感 (inspiration), kept between runs.
import {
  phone, h, wait, ART, vibrate, sfx, MODS, shotStep, steamStep, artStep, waterStep, setScreen, beanSvg, fx, cook,
} from './kit.js';

// ------------------------------------------------------------------ the night
const TIERS = [
  { kicker: '第 1 位', name: '見習評審', band: 1.1, speed: 0.95, tips: 1, node: '👤' },
  { kicker: '第 2 位', name: '見習評審', band: 1.0, speed: 1.0, tips: 1, node: '👤' },
  { kicker: '第 3 位 · 精英', name: '挑剔的資深評審', band: 0.8, speed: 1.1, tips: 1.5, node: '⭐', elite: true },
  { kicker: '第 4 位', name: '資深評審', band: 0.9, speed: 1.05, tips: 1.2, node: '👤' },
  { kicker: '最終 · 主編', name: 'Le Petit Guide 主編', band: 0.7, speed: 1.15, tips: 3, node: '👑', boss: true },
];
const DRINKS = {
  latte: { name: '拿鐵', icon: '☕', steps: [shotStep, steamStep, artStep], flow: '萃取 → 打奶泡 → 拉花' },
  americano: { name: '美式', icon: '🫖', steps: [shotStep, waterStep], flow: '萃取 → 加熱水' },
};
/** The order for each judge: an americano to warm up, the editor always wants a latte. */
const pickDrink = (i) => (i === 0 ? 'americano' : i === TIERS.length - 1 ? 'latte' : Math.random() < 0.55 ? 'latte' : 'americano');

const TASTES = {
  shot: [[0.62, null], [0.72, '濃縮飽滿'], [0.54, '濃縮清爽']],
  temp: [[62, null], [68, '奶泡熱一點'], [56, '奶泡溫一點']],
  size: [[0.56, null], [0.7, '拉花大一點'], [0.46, '拉花小巧']],
  water: [[0.82, null], [0.72, '濃一點'], [0.9, '淡一點']],
};
/** What this judge likes: each taste is the classic one or a twist (the editor always has two twists). */
function rollPref(drink, tier) {
  const keys = drink === 'latte' ? ['shot', 'temp', 'size'] : ['shot', 'water'];
  const twists = new Set();
  const want = tier.boss ? 2 : tier.elite ? 1 + (Math.random() < 0.5) : Math.random() < 0.5 ? 1 : 0;
  while (twists.size < want) twists.add(keys[Math.floor(Math.random() * keys.length)]);
  const pref = { shot: 0.62, temp: 62, size: 0.56, water: 0.82, tags: [] };
  for (const k of keys) {
    const opt = twists.has(k) ? TASTES[k][1 + Math.floor(Math.random() * 2)] : TASTES[k][0];
    pref[k] = opt[0];
    if (opt[1]) pref.tags.push(opt[1]);
  }
  const name = DRINKS[drink].name;
  pref.line = pref.tags.length ? `我要一杯${name}，${pref.tags.join('、')}。` : `一杯經典的${name}。讓我看看你的基本功。`;
  if (tier.boss) pref.line = `今晚的最後一杯。${pref.line}別讓我失望。`;
  return pref;
}

// ------------------------------------------------------------------ cards
const CARDS = [
  { id: 'portafilter', icon: '🔧', type: '器具', name: '雙孔把手', desc: '萃取的完美區間 +40%', apply: (R) => { R.M.shotBand *= 1.4; } },
  { id: 'thermo', icon: '🌡️', type: '器具', name: '專業溫度計', desc: '打奶泡的完美區間 +40%，綠區漂得比較慢', apply: (R) => { R.M.steamBand *= 1.4; R.M.steamDrift *= 0.7; } },
  { id: 'pitcher', icon: '🥛', type: '器具', name: '細嘴拉花杯', desc: '拉花大小的容許範圍 +50%', apply: (R) => { R.M.artBand *= 1.5; } },
  { id: 'kettle', icon: '🫖', type: '器具', name: '鵝頸手沖壺', desc: '加熱水的完美區間 +50%', apply: (R) => { R.M.waterBand *= 1.5; } },
  { id: 'mocha', icon: '🐹', type: '夥伴', name: 'Mocha Latte', desc: '每杯多一次「時間暫停」', stack: true, apply: (R) => { R.slow += 1; } },
  { id: 'cheetie', icon: '🐆', type: '夥伴', name: 'Cheetie 讀心術', desc: '顯示金色的甜蜜點；完美又打中甜蜜點時，小費 ×2', rare: true, apply: (R) => { R.M.sweet = true; R.flags.cheetie = true; } },
  { id: 'heehee', icon: '🌸', type: '夥伴', name: 'Hee Hee 的花瓣', desc: '每次完美，小費 +50%', apply: (R) => { R.flags.heehee = true; } },
  { id: 'flow', icon: '🌊', type: '連擊', name: '行雲流水', desc: '連續完美越多，小費越高（每層 +20%，失誤歸零）', rare: true, apply: (R) => { R.flags.flow = true; } },
  { id: 'perfect', icon: '✨', type: '連擊', name: '完美主義', desc: '整杯每一步都完美時，回復 1 顆愛心', rare: true, apply: (R) => { R.flags.perfect = true; } },
  { id: 'tulip', icon: '🌷', type: '技巧', name: '鬱金香', desc: '拉花改成鬱金香：容許範圍 −25%，但拉花的小費 ×2', rare: true, apply: (R) => { R.M.tulip = true; R.M.artBand *= 0.75; } },
  { id: 'breath', icon: '💗', type: '技巧', name: '深呼吸', desc: '愛心上限 +1，並回復 1 顆', stack: true, apply: (R) => { R.max += 1; R.hearts = Math.min(R.max, R.hearts + 1); } },
  { id: 'slowhand', icon: '🐢', type: '技巧', name: '慢工出細活', desc: '所有動作變慢 20%，比較好抓；小費 −15%', apply: (R) => { R.M.speed *= 0.8; R.tipMul *= 0.85; } },
  { id: 'lucky', icon: '🫘', type: '遺物', name: '幸運咖啡豆', desc: '每杯第一次「可惜」不扣愛心', rare: true, apply: (R) => { R.flags.lucky = true; } },
  { id: 'picky', icon: '👅', type: '詛咒交換', name: '挑剔的舌頭', desc: '所有完美區間 −25%，但所有小費 ×2', curse: true, apply: (R) => { R.M.band *= 0.75; R.tipMul *= 2; } },
];
const cardById = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** Three different cards the player doesn't have yet (stackable ones can come again); rare ones come up half as often. */
function draft(R) {
  const pool = CARDS.filter((c) => c.stack || !R.deck.includes(c.id));
  const picks = [];
  while (picks.length < 3 && picks.length < pool.length) {
    const left = pool.filter((c) => !picks.includes(c));
    const total = left.reduce((s, c) => s + (c.rare ? 1 : 2), 0);
    let r = Math.random() * total;
    for (const c of left) { r -= c.rare ? 1 : 2; if (r <= 0) { picks.push(c); break; } }
  }
  return picks;
}

// ------------------------------------------------------------------ records (this browser only)
const KEY = 'petitGuide.best';
export function bestRun() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function record(R, win) {
  const prev = bestRun() || { win: false, reached: 0, beans: 0, inspiration: 0 };
  const earned = R.beans + (win ? 5 : 0) + Math.floor(R.tips / 50);
  const better = (win && !prev.win) || (win === prev.win && (R.i + 1 > prev.reached || (R.i + 1 === prev.reached && R.beans > prev.beans)));
  const next = better ? { win, reached: R.i + 1, beans: R.beans, inspiration: prev.inspiration + earned } : { ...prev, inspiration: prev.inspiration + earned };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return { earned, total: next.inspiration, newBest: better };
}

// ------------------------------------------------------------------ pieces of UI
function heartsEl(R, lostAt = -1) {
  return h('span.hearts', Array.from({ length: R.max }, (_, i) => h('span.heart' + (i < R.hearts ? '' : '.empty') + (i === lostAt ? '.lost' : ''), '♥')));
}
function hudEl(R) {
  const el = h('div.runhud');
  el.update = (lostAt = -1) => {
    el.replaceChildren(...[heartsEl(R, lostAt), h('span.grow'),
      R.combo > 1 ? h('span.pill.combo', `連擊 ×${R.combo}`) : null,
      h('span.pill', h('span.dot'), `${R.tips}`)].filter(Boolean));
  };
  el.update();
  return el;
}
const deckEl = (R) => h('div.deck', R.deck.length ? R.deck.map((id) => h('span.chip', { title: cardById[id].desc }, `${cardById[id].icon} ${cardById[id].name}`)) : h('span.muted', '還沒有卡片'));
function routeEl(at) {
  return h('div.route', TIERS.map((t, i) => h('span.node' + (i < at ? '.past' : i === at ? '.here' : '') + (t.boss ? '.boss' : ''), t.node)));
}
function cardEl(c, onPick) {
  return h('button.cardpick' + (c.rare ? '.rare' : '') + (c.curse ? '.curse' : ''), { onclick: onPick },
    h('span.cicon', c.icon),
    h('div.grow', h('div.ctype', c.type + (c.rare ? ' · 稀有' : '')), h('b', c.name), h('div.cdesc', c.desc)));
}

// ------------------------------------------------------------------ screens
let home = () => {};

/** The night's opening card: the route, the hearts, the partner. */
export function startRun(goHome) {
  home = goHome;
  const R = { i: 0, hearts: 3, max: 3, tips: 0, beans: 0, combo: 0, bestCombo: 0, deck: [], M: MODS(), slow: 1, flags: {}, tipMul: 1 };
  const sheet = h('div.sheet.full.in',
    h('div.scroll',
      h('div.kicker', 'Le Petit Guide · 肉鴿模式'),
      h('h1', '評鑑之夜'),
      h('div.muted', '五位評審接連上門，一位比一位挑剔，最後是主編本人。每杯做完選一張卡，組出你的流派。'),
      h('div.card', routeEl(0),
        h('div.rules',
          h('div', h('b', '♥ 3 顆愛心'), h('span', '每次「可惜」扣一顆，扣完今晚就結束')),
          h('div', h('b', '🃏 三選一'), h('span', '每杯做完，從三張卡裡挑一張，效果會疊加')),
          h('div', h('b', '🐹 夥伴'), h('span', 'Mocha Latte 每杯可以時間暫停一次')),
          h('div', h('b', '💡 靈感'), h('span', '依豆子和小費結算，失敗也拿得到')))),
      h('div.muted', { style: 'text-align:center' }, '飲品：美式（萃取 → 加熱水）、拿鐵（萃取 → 打奶泡 → 拉花）')),
    h('div.row',
      h('button.btn', { onclick: () => { sfx.tap(); home(); } }, '返回'),
      h('button.btn.primary', { onclick: () => { sfx.unlock(); sfx.tap(); guest(R); } }, '開始今晚')));
  setScreen(sheet);
}

/** The next judge sits down and orders. */
function guest(R) {
  const tier = TIERS[R.i], drink = pickDrink(R.i), pref = rollPref(drink, tier);
  const sheet = h('div.sheet.full.in',
    h('div.scroll',
      routeEl(R.i),
      h('div.kicker', tier.kicker),
      h('h2', tier.name),
      h('div.critic-hero', h('img' + (tier.boss ? '.boss' : tier.elite ? '.elite' : ''), { src: ART('critic_neutral'), alt: '' }), h('div.bubble.grow', pref.line)),
      h('div.card',
        h('div.order', h('div.cup', DRINKS[drink].icon), h('div.grow', h('h2', DRINKS[drink].name), h('div.muted', DRINKS[drink].flow))),
        pref.tags.length ? h('div.prefs', pref.tags.map((t) => h('span.tag', t))) : null,
        h('div.muted', { style: 'margin-top:8px' }, `難度 ${Math.round(100 / tier.band)}% · 小費 ×${tier.tips}`)),
      h('div.kicker', '你的卡片'), deckEl(R)),
    hudEl(R),
    h('div.row', h('button.btn.primary', { onclick: () => { sfx.tap(); brew(R, tier, drink, pref); } }, '開始製作')));
  setScreen(sheet);
}

async function brew(R, tier, drink, pref) {
  const M = { ...R.M, band: R.M.band * tier.band, speed: R.M.speed * tier.speed };
  const steps = DRINKS[drink].steps.map((make) => make(pref, M));
  const hud = hudEl(R);
  let luckyUsed = false, cupTips = 0;
  const onStep = (S, kind) => {
    if (kind === 'perfect') { R.combo++; R.bestCombo = Math.max(R.bestCombo, R.combo); } else R.combo = 0;
    let mul = tier.tips * R.tipMul;
    if (kind === 'perfect' && R.flags.heehee) mul *= 1.5;
    if (kind === 'perfect' && R.flags.cheetie && S.sweet) mul *= 2;
    if (S.id === 'art' && R.M.tulip) mul *= 2;
    if (kind === 'perfect' && R.flags.flow) mul *= 1 + 0.2 * R.combo;
    const tip = Math.round({ perfect: 10, good: 5, miss: 0 }[kind] * mul);
    R.tips += tip; cupTips += tip;
    let text = tip ? `+${tip} 小費` : '', stop = false, lost = -1;
    if (kind === 'miss') {
      if (R.flags.lucky && !luckyUsed) { luckyUsed = true; text = '🫘 幸運咖啡豆擋下了！'; }
      else { R.hearts--; lost = R.hearts; text = '−1 ♥'; vibrate([30, 40, 30]); stop = R.hearts <= 0; }
    }
    hud.update(lost);
    return { stop, tip: text };
  };
  const { results, triple, aborted } = await cook({ steps, M, slowCharges: R.slow, hud, onStep });
  const avg = results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length);
  const beans = aborted ? 0 : triple ? 3 : avg >= 0.85 ? 3 : avg >= 0.6 ? 2 : avg >= 0.35 ? 1 : 0;
  R.beans += beans;
  let healed = false;
  if (triple && R.flags.perfect && R.hearts < R.max) { R.hearts++; healed = true; }
  if (R.hearts <= 0) return over(R, false, { beans, cupTips, results });
  if (R.i === TIERS.length - 1) return over(R, true, { beans, cupTips, results });
  afterCup(R, tier, { beans, cupTips, results, healed });
}

/** How the drink went, then three cards to pick from. */
async function afterCup(R, tier, { beans, cupTips, results, healed }) {
  const face = beans >= 2 ? 'critic_happy' : beans === 1 ? 'critic_neutral' : 'critic_grumpy';
  const beanEls = [0, 1, 2].map((i) => { const s = h('span', { html: beanSvg(i < beans) }); return s.firstChild; });
  const next = () => { R.i++; guest(R); };
  const pick = (c) => () => {
    sfx.good(); vibrate(15);
    R.deck.push(c.id); c.apply(R);
    next();
  };
  const skip = () => { sfx.tap(); R.tips += 15; next(); };
  const choices = draft(R);
  const sheet = h('div.sheet.full.in',
    h('div.scroll',
      h('div.cupsum',
        h('img', { src: ART(face), alt: '' }),
        h('div.grow',
          h('div.kicker', `${tier.name} 的評分`),
          h('div.beans.small', beanEls),
          h('div.muted', results.map((r) => `${r.name} ${Math.round(r.score * 100)}`).join(' · ')),
          h('div.row', { style: 'gap:6px;margin-top:6px;flex-wrap:wrap' },
            h('span.pill', h('span.dot'), `+${cupTips}`),
            healed ? h('span.pill.gold', '完美主義 +1 ♥') : null))),
      hudEl(R),
      h('h2', { style: 'margin-top:4px' }, '選一張卡'),
      h('div.cards', choices.map((c) => cardEl(c, pick(c)))),
      h('button.btn.small.skip', { onclick: skip }, '跳過，改拿 15 小費')));
  setScreen(sheet);
  for (let i = 0; i < 3; i++) {
    await wait(260);
    beanEls[i].classList.add('pop');
    if (i < beans) sfx.bean(i);
  }
}

/** The night is over: won (the editor served) or out of hearts. */
async function over(R, win, last) {
  const rec = record(R, win);
  const sheet = h('div.sheet.full.in',
    h('div.scroll',
      h('div.center',
        h('div.kicker', '評鑑之夜 · 結算'),
        h('img.critic-big', { src: ART(win ? 'critic_happy' : 'critic_grumpy'), alt: '', style: 'width:170px' }),
        h('h1', win ? '主編認可了你！' : '今晚到此為止'),
        h('div.quote', win ? '你的咖啡值得寫進今年的 Le Petit Guide。下一季，我還會再來。' : `撐到第 ${R.i + 1} 位評審。${last.results.length ? last.results[last.results.length - 1].note : ''}⋯下次再來挑戰吧。`)),
      h('div.card.stats',
        h('div', h('b', `${win ? TIERS.length : R.i}`), h('span', '位評審滿意')),
        h('div', h('b', `${R.beans}`), h('span', '顆豆')),
        h('div', h('b', `${R.tips}`), h('span', '小費')),
        h('div', h('b', `${R.bestCombo}`), h('span', '最高連擊'))),
      h('div.plaque', h('span.cicon', '💡'), h('div', h('b', `獲得 ${rec.earned} 靈感`), h('div.muted', `累積 ${rec.total} · 之後可以解鎖新卡片、新飲品和新夥伴`))),
      rec.newBest ? h('div.reward', h('span.pill.gold', '新紀錄！')) : null,
      h('div.kicker', '今晚的流派'), deckEl(R)),
    h('div.row',
      h('button.btn', { onclick: () => { sfx.tap(); home(); } }, '回到咖啡廳'),
      h('button.btn.primary', { onclick: () => { sfx.tap(); startRun(home); } }, '再挑戰一次')));
  setScreen(sheet);
  if (win) {
    sfx.fanfare();
    const pr = phone.getBoundingClientRect();
    fx.burst(pr.width / 2, pr.height * 0.3, 'confetti');
  } else sfx.miss();
}

// for testing from the console: jump into a night with some cards, at a given judge
window.__run = (deck = [], at = 0) => {
  const R = { i: at, hearts: 3, max: 3, tips: 0, beans: 0, combo: 0, bestCombo: 0, deck: [], M: MODS(), slow: 1, flags: {}, tipMul: 1 };
  for (const id of deck) { R.deck.push(id); cardById[id].apply(R); }
  guest(R);
  return R;
};
window.__runAfter = (deck = []) => {
  const R = window.__run(deck, 1);
  afterCup(R, TIERS[1], { beans: 2, cupTips: 18, results: [{ name: '萃取', score: 0.9 }, { name: '加水', score: 0.7 }], healed: false });
};
window.__runOver = (win) => { const R = window.__run(['mocha', 'flow'], 3); R.beans = 9; R.tips = 140; R.bestCombo = 4; over(R, win, { results: [{ note: '溫度不夠' }] }); };
