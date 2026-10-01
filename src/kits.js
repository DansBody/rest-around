// What the characters' active skills do when the player casts them (see KITS in data.js). Each cast
// gets the staff member and the game, and returns false when there is nothing to aim at, so the
// cooldown isn't spent.
import { t } from './i18n.js';
import { choice, randInt } from './util.js';

const refuse = (g, msg) => { g.toast(t(msg), 'bad'); g.sfx('error'); return false; };

// ---------------- Cheetie: Mind Reader ----------------
function mindread(a, g) {
  const waiting = g.customers.filter((c) => c.state === 'waitOrder' && c.orderJob);
  if (!waiting.length) return refuse(g, 'No guests waiting to order');
  for (const c of waiting) {
    g.jobs.cancel(c.orderJob);              // a server already on the way is released
    c.orderJob = null;
    c.patience = Math.max(c.patience, 0.95); // nobody had to wait, so they count as delighted
    c.takeOrder(a);
    g.fx.sparkle(g.at(c.x, c.y, 80), 6, '#ffd27a');
    g.fx.hearts(g.at(c.x, c.y, 100), 1);
  }
  g.sfx('order');
  return true;
}

// ---------------- Mocha Latte: Time Pause ----------------
function timestop(a, g) {
  if (!g.customers.some((c) => c.showPatience)) return refuse(g, 'Nobody is waiting yet');
  g.timeStopDur = g.timeStopT = a.kit.active.dur;
  return true;
}

// ---------------- Hee Hee: Spotlight ----------------
function spotlight(a, g) {
  // the table with the most guests who are ordering, waiting or eating
  const count = new Map();
  for (const s of g.world.seats) {
    const c = s.customer;
    if (c && (c.state === 'waitOrder' || c.state === 'waitFood' || c.state === 'eating')) count.set(s.table, (count.get(s.table) || 0) + 1);
  }
  let best = null;
  for (const [table, n] of count) if (!best || n > best.n) best = { table, n };
  if (!best) return refuse(g, 'No seated guests to put in the spotlight');
  const k = a.kit.active, tb = best.table;
  g.spotlight = { x: tb.x + tb.fp[0] / 2, y: tb.y + tb.fp[1] / 2, r: k.reach, t: k.dur, dur: k.dur };
  return true;
}

// ---------------- Bbaekko: Wild Magic ----------------
const BAD = '#ff7aa8';
const SPELLS = [
  { name: 'Flash Brew', w: 3,
    can: (g) => g.world.furniture.some((f) => f.cooking && f.cookTotal > 0),
    run(a, g) {
      for (const f of g.world.furniture) if (f.cooking && f.cookTotal > 0) { f.cookT = f.cookTotal; g.fx.puff(g.at(f.x + f.fp[0] / 2, f.y + f.fp[1] / 2, 60), '#e9c8ff', 6); }
    } },
  { name: 'Calming Spell', w: 3,
    can: (g) => g.customers.some((c) => c.showPatience && c.patience < 0.9),
    run(a, g) {
      for (const c of g.customers) if (c.showPatience) { c.patience = 1; g.fx.hearts(g.at(c.x, c.y, 100), 1); g.fx.sparkle(g.at(c.x, c.y, 70), 4, '#bfe3ff'); }
    } },
  { name: 'Gust of Haste', w: 3,
    can: () => true,
    run(a, g) {
      for (const s of g.staff) { s.buffT = 8; s.buffMul = 1.4; g.fx.sparkle(g.at(s.x, s.y, 50), 8, '#d9b8ff'); }
    } },
  { name: 'Coin Shower', w: 2,
    can: () => true,
    run(a, g) {
      g.eco.earn(12 + g.state.level * 5, 0, a.x, a.y, 120);
      g.fx.sparkle(g.at(a.x, a.y, 90), 18, '#ffd86b');
    } },
  { name: 'Oops, Balloons', w: 2, bad: true,
    can: (g) => g.world.furniture.some((f) => f.ready && f.ready.state === 'ready'),
    run(a, g) {
      // the chant goes wrong: up to two finished plates float away as balloons, and are made again
      const stations = g.world.furniture.filter((f) => f.ready && f.ready.state === 'ready').slice(0, 2);
      for (const st of stations) {
        const tk = st.ready;
        st.ready = null;
        g.jobs.cancel(tk.deliverJob); tk.deliverJob = null;
        tk.state = 'queued'; tk.station = null;
        tk.job = g.jobs.add(tk.kind === 'drink' ? 'drink' : 'cook', { ticket: tk, customer: tk.customer });
        const at = g.at(st.x + st.fp[0] / 2, st.y + st.fp[1] / 2, 70);
        g.fx.balloon(at, choice(['#ff8fb1', '#8fd0ff', '#ffe27a', '#b9a4ff']));
        g.fx.balloon(at, choice(['#9be3b5', '#ffb38a']));
      }
    } },
  { name: 'Confetti Mess', w: 2, bad: true,
    can: () => true,
    run(a, g) {
      const w = g.world;
      let n = 0;
      for (let i = 0; i < 30 && n < 4; i++) {
        const x = randInt(0, w.size - 1), y = randInt(0, w.size - 1);
        if (w.isEntry(x, y) || !w.addTrash(x, y)) continue;
        n++;
        for (const c of ['#ff8fb1', '#8fd0ff', '#ffe27a', '#9be3b5']) g.fx.sparkle(g.at(x + 0.5, y + 0.5, 30), 2, c);
      }
    } },
];
function magic(a, g) {
  const pool = SPELLS.filter((s) => s.can(g));
  let r = Math.random() * pool.reduce((n, s) => n + s.w, 0);
  const spell = pool.find((s) => (r -= s.w) < 0) || pool[0];
  spell.run(a, g);
  g.fx.title(g.at(a.x, a.y, 150), t('{ability}!', { ability: t(spell.name) }), spell.bad ? BAD : a.kit.active.color);
  return true;
}

export const CASTS = { mindread, timestop, spotlight, magic };
