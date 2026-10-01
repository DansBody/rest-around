// Balance sheet for the away-from-keyboard economy: builds saves for a few stages of the game and settles
// time away for each, printing what the café would have earned. Run: node tools/balance.mjs [hours]
import { settleOffline } from '../src/offline.js';
import { DISHES, LEVEL_POINTS, MAX_DISH_LEVEL, staffWage, rentFor, ROLES, OFFLINE, dishById, EXTRA_CAT } from '../src/data.js';

const hours = +(process.argv[2] || 8);
const fl = (n) => Array.from({ length: n }, () => Array(n).fill('fl_oak'));
const room = (size, tables, stoves, bars, extra = []) => {
  const f = [];
  stoves.forEach((t, i) => f.push({ t, x: 6 + i, y: 0, d: 1 }));
  bars.forEach((t, i) => f.push({ t, x: 2 + i, y: 0, d: 1 }));
  for (let i = 0; i < tables; i++) { f.push({ t: 'table_oak', x: 3 + (i % 3) * 3, y: 3 + Math.floor(i / 3) * 2, d: 1 }); f.push({ t: 'chair_oak', x: 2 + (i % 3) * 3, y: 3 + Math.floor(i / 3) * 2, d: 0 }); f.push({ t: 'chair_oak', x: 4 + (i % 3) * 3, y: 3 + Math.floor(i / 3) * 2, d: 2 }); }
  for (const t of extra) f.push({ t, x: 0, y: 0, d: 1, ba: 8 });
  return f;
};
const stage = (name, level, size, tables, staff, dishLv, stoves, bars, extra, ratingNow, menuOn) => {
  const dishes = {};
  for (const d of DISHES) dishes[d.id] = { lv: dishLv, prog: {}, on: menuOn.includes(d.id) };
  const pts = LEVEL_POINTS[level] + 1;
  return {
    name, save: {
      v: 1, savedAt: 0,
      state: { coins: 300, points: pts, rating: ratingNow, service: [], day: 5, clock: 0, dishes, inv: { beans: 4, sugar: 3, milk: 3 }, opened: {}, snacks: { cookie: 2 }, garden: [], totals: {}, settings: { autoRestock: true }, wallDeco: [] },
      world: { size, floors: fl(size), wallpaper: 'wp_cream', furniture: room(size, tables, stoves, bars, extra), trash: [] },
      meta: { seats: tables * 2 },
      staff: staff.map(([role, model, xp]) => ({ role, look: { model }, energy: 100, skills: { [role]: xp } })),
    },
  };
};
const stages = [
  stage('Lv2 start', 2, 8, 2, [['waiter', 'mochalatte', 0], ['chef', 'bbaekko', 0]], 1, ['stove_basic'], [], [], 2.6, ['espresso', 'americano', 'latte', 'hotchoc']),
  stage('Lv4 small', 4, 10, 3, [['waiter', 'mochalatte', 40], ['waiter', 'cheetie', 0], ['chef', 'bbaekko', 120], ['cleaner', 'heehee', 0]], 3, ['stove_steel'], [], ['toilet'], 3.2, ['espresso', 'americano', 'latte', 'cappuccino', 'hotchoc', 'matcha', 'mocha', 'icedamericano']),
  stage('Lv6 mid', 6, 12, 5, [['waiter', 'mochalatte', 260], ['waiter', 'cheetie', 120], ['chef', 'bbaekko', 260], ['bartender', 'heehee', 40], ['cleaner', 'oritokki', 40]], 5, ['stove_steel', 'stove_deluxe'], ['bar_counter'], ['toilet', 'arcade_pink'], 4.0, ['espresso', 'latte', 'cappuccino', 'mocha', 'matcha', 'icedlatte', 'berrylemonade', 'croissant', 'muffin', 'cheesecake']),
  stage('Lv9 big', 9, 14, 8, [['waiter', 'mochalatte', 480], ['waiter', 'cheetie', 260], ['chef', 'bbaekko', 480], ['bartender', 'heehee', 260], ['cleaner', 'oritokki', 120]], 8, ['stove_deluxe', 'stove_deluxe'], ['bar_counter'], ['toilet', 'arcade_sky'], 4.6, ['espresso', 'latte', 'cappuccino', 'mocha', 'matcha', 'icedlatte', 'berrylemonade', 'croissant', 'muffin', 'cheesecake']),
];
console.log(`away ${hours}h · cap ${OFFLINE.capHours}h · ${OFFLINE.hoursPerDay}h per game day · efficiency ${OFFLINE.efficiency}\n`);
for (const s of stages) {
  const wages = s.save.staff.reduce((a, x) => a + staffWage(x.role, 1), 0);
  const r = settleOffline(s.save, hours * 3600, 1);
  if (!r) { console.log(s.name, 'nothing'); continue; }
  const p = r.report;
  const top = Object.entries(p.dishes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${id}×${n}`).join(' ');
  console.log(`${s.name.padEnd(12)} served ${String(p.served).padStart(4)} lost ${String(p.lost).padStart(3)} soldout ${String(p.soldOut).padStart(3)} | sales ${String(p.sales).padStart(5)} tips ${String(p.tips).padStart(4)} fees ${String(p.fees).padStart(3)} | wages ${p.wages} rent ${p.rent} stock ${p.restock} | net ${p.net >= 0 ? '+' : ''}${p.net} (${Math.round(p.net / (p.usedSec / 3600))}/h) pts ${p.points} | ★ ${p.ratingFrom.toFixed(2)}→${p.ratingTo.toFixed(2)} | ${top}`);
}
