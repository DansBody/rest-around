// Layout check for phones: finds text that breaks onto a second line where it should not (buttons, pills,
// tags, headings, short labels), text cut off with "…", and anything poking out of the screen.
// Run it in the browser console of a running game (the dev server serves this folder):
//   const { runAll } = await import('/tools/wrapscan.js'); console.table((await runAll()).flatMap((r) => r.found.map((f) => ({ screen: r.label, ...f }))));
// It opens every panel, tab, the build tray and the end-of-day / welcome-back / level-up cards, and puts things back after.

/** One screen: everything currently visible in #ui. */
export function wrapScan(label) {
  const out = [], W = innerWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  const lines = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set(); for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 4) tops.add(Math.round(r.top / 4)); return tops.size; };
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const path = (el) => { const p = []; for (let e = el, i = 0; i < 3 && e; i++, e = e.parentElement) p.unshift(name(e)); return p.join(' > '); };
  for (const el of document.querySelectorAll('#ui *')) {
    if (!visible(el)) continue;
    const txt = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    const scroller = el.closest('.tabs, .bb-items');   // strips that scroll sideways on purpose
    const scrolls = scroller && /auto|scroll/.test(getComputedStyle(scroller).overflowX);
    if ((r.right > W + 1 || r.left < -1) && !el.closest('#panel:not(.open)') && !scrolls) out.push({ issue: 'off-screen', el: path(el), txt: txt.slice(0, 40), left: Math.round(r.left), right: Math.round(r.right) });
    // a row of pills / buttons that spilled onto a second line
    const cs0 = getComputedStyle(el);
    if (!el.matches('.row.split') && /flex/.test(cs0.display) && cs0.flexDirection.startsWith('row') && cs0.flexWrap === 'wrap') {
      const kids = [...el.children].filter(visible);
      const tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top / 6)));
      if (kids.length > 1 && tops.size > 1) out.push({ issue: 'row-wrap', lines: tops.size, el: path(el), txt: txt.slice(0, 50) });
    }
    if ([...el.children].some((c) => /block|flex|grid|list/.test(getComputedStyle(c).display))) continue;   // leaf text only
    const single = el.closest('button, .btn, .pill, .chip, .tab, .sk-tag, .bmsg, .toast, h1, h2, h3, .section-title, .big-title, label, .gc-label, .stat');
    const n = lines(el);
    if (n > 1 && (single || txt.length <= 14)) out.push({ issue: 'wraps', lines: n, el: path(el), txt: txt.slice(0, 50) });
    if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push({ issue: 'truncated', el: path(el), txt: txt.slice(0, 50) });
  }
  const seen = new Set();
  return { label, W, found: out.filter((o) => { const k = o.issue + o.el + o.txt; return !seen.has(k) && seen.add(k); }) };
}

/** Every screen in turn. Needs window.game and window.ui (set in main.js). */
export async function runAll() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = [];
  const scan = async (label) => { await wait(450); res.push(wrapScan(label)); };
  const ui = window.ui, g = window.game;
  ui.closePanel(); g.selected = null; ui.renderInfo(); await scan('hud');
  ui.toggleRatingTip(); await scan('rating tip'); ui.toggleRatingTip();
  ui.toggleQuest(true); await scan('quest'); ui.toggleQuest(false);
  ui.openPanel('staff'); ui.staffOpen = new Set(g.staff.map((a) => a.id)); ui.staffHelp = true; ui.renderPanel(); await scan('staff (all open)');
  ui.subview = { job: g.staff[0] }; ui.renderPanel(); await scan('staff: job');
  ui.subview = { outfit: g.staff[0] }; ui.renderPanel(); await scan('staff: outfit');
  ui.subview = null; ui.staffHelp = false; ui.staffOpen = new Set();
  ui.openPanel('menu');
  for (let i = 0, n = document.querySelectorAll('#panel .tab').length; i < n; i++) { document.querySelectorAll('#panel .tab')[i].click(); await scan('menu tab ' + i); }
  for (const p of ['garden', 'market', 'friends', 'settings']) { ui.openPanel(p); await scan(p); }
  ui.closePanel();
  if (g.staff[0]) { ui.select(g.staff[0]); await scan('info: staff'); }
  const guest = [...(g.agents || [])].find((a) => a.kind !== 'staff');
  if (guest) { ui.select(guest); await scan('info: guest'); }
  g.selected = null; ui.renderInfo();
  // build mode, every category (entering it pauses the café; leaving resumes it)
  document.querySelectorAll('.tool')[0].click(); await wait(300);
  for (let i = 0, n = document.querySelectorAll('#buildbar .tab').length; i < n; i++) { document.querySelectorAll('#buildbar .tab')[i].click(); await scan('build tab ' + i); }
  document.querySelectorAll('.tool')[0].click(); await wait(300);
  // cards, shown directly with sample numbers (no queue, no countdown)
  const modal = document.getElementById('modal');
  const showCard = async (card, label) => {
    const prev = [...modal.childNodes], wasShown = modal.classList.contains('show');
    modal.replaceChildren(card); modal.classList.add('show'); await scan(label);
    modal.replaceChildren(...prev); if (!wasShown) modal.classList.remove('show');
  };
  const auto = g.state.settings.autoNextDay; g.state.settings.autoNextDay = false;
  await showCard(ui.summaryCard({ day: 12, served: 148, lost: 7, noSeat: 3, coins: 12840, wages: 1260, rent: 320, restocked: 2210, points: 1530, ratingStart: 3.6, ratingEnd: 4.2, levelStart: 7, levelEnd: 8, soldOut: 4 }), 'day summary');
  g.state.settings.autoNextDay = auto;
  const dishes = Object.keys(g.state.dishes);
  await showCard(ui.awayCard({ elapsedSec: 12300, served: 212, net: 8450, points: 940, ratingFrom: 3.6, ratingTo: 4.1, levelFrom: 7, levelTo: 8, lost: 12, sales: 9300, tips: 1240, fees: 380, wages: 1900, rent: 320, restock: 250,
    dishes: { [dishes[0]]: 40, [dishes[1]]: 22 }, noStaff: false, rescued: true, ranOut: [], broke: [], unpaid: true, readyCrops: 3, snacksUsed: 2, capped: true, soldOut: 0 }), 'away card');
  ui.celebrate({ level: 8, unlocks: ['Staff slot', 'Menu slot', 'Garden plot'] }); await scan('level up');
  ui.el.celebrate.classList.remove('show'); ui.levelAcc = null;
  return res.filter((r) => r.found.length);
}
