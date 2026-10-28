// Calibrates the away-from-keyboard model (src/offline.js MODEL) against the live simulation.
// Run in the browser console of a running game (python tools/devserver.py 8123, open the page with ?offline, paste
// this file), or call `await window.calibrate(['mid'])` after pasting it once to play only some cases.
// For each café layout it plays one round (08:00 to closing) with the real simulation (game.fastForward) and
// settles the same layout with the model at full efficiency for as many model days as a round's opening
// hours hold (ROUND_SCALE), then prints both side by side. A round is ~2 real hours of simulation, so this
// takes a while. Tune MODEL until they agree
// (served within ~10%, rating within ~0.3 stars), then leave OFFLINE.efficiency below 1 to taste.
// The live round has trouble on (the lessons are marked done, nobody trained), as a Lv6 café would.
window.calibrate = async (only) => {
  const g = window.game;
  const { serialize } = await import('/src/save.js');
  const { makeStaff } = await import('/src/staff.js');
  const { DAY, ROUND_SCALE, STARTER } = await import('/src/data.js');
  const { settleOffline } = await import('/src/offline.js?v=' + Date.now());

  function live(o) {
    g.newGame();
    const w = g.world;
    for (const f of [...w.furniture]) w.removeFurniture(f);
    for (const a of [...g.staff]) g.removeAgent(a);
    w.resize(14, 'fl_oak');
    const s = g.state;
    s.tutorialSeen = true; s.tutorial = ['L-dash', 'L-rude']; s.starter = { i: STARTER.length, prog: 0 };
    s.coins = 9999; s.level = 6; s.points = 1700;
    s.inv = { beans: 90, sugar: 90, milk: 90, flour: 90, butter: 90, chocolate: 90, egg: 90 };
    w.addFurniture('cashier', 5, 0, 1);
    (o.stoves || ['stove_basic']).forEach((t, i) => w.addFurniture(t, 7 + i * 2, 0, 1));
    (o.bars || []).forEach((t, i) => w.addFurniture(t, 1 + i * 2, 0, 1));
    let placed = 0;
    for (let row = 0; row < 5 && placed < o.tables; row++) for (let col = 0; col < 3 && placed < o.tables; col++) {
      const x = 3 + col * 4, y = 3 + row * 2;
      w.addFurniture('table_oak', x, y, 1); w.addFurniture('chair_oak', x - 1, y, 0); w.addFurniture('chair_oak', x + 1, y, 2); placed++;
    }
    let mi = 0;
    for (const [role, n] of Object.entries(o.staff)) for (let i = 0; i < n; i++) { g.addStaff(makeStaff(g, role, 'mochalatte'), 1 + mi, 1); mi++; }
    for (const a of g.staff) a.look.model = 'mochalatte';   // neutral kit: no perks
    s.rating = o.rating ?? 5; g.rating.recompute();
    s.round = 0; s.clock = 0; g.day.fresh(); g.day.nextSpawn = 2;   // from opening, whatever the wall clock says
    const snap = JSON.parse(JSON.stringify(serialize(g)));
    const t0 = performance.now();
    const rounds = g.fastForward(DAY.length + 130);
    const r = rounds[0] || { ...s.stats, ratingEnd: s.rating };
    return { snap, ms: performance.now() - t0, day: { ...r, rating: r.ratingEnd } };
  }

  const cases = {
    default: { tables: 2, stoves: ['stove_basic'], staff: { waiter: 1, chef: 1 }, rating: 2.6 },
    waiter1: { tables: 12, stoves: ['stove_deluxe', 'stove_deluxe', 'stove_deluxe'], staff: { waiter: 1, chef: 3 } },
    chef1: { tables: 12, stoves: ['stove_basic'], staff: { waiter: 4, chef: 1 } },
    seats4: { tables: 2, stoves: ['stove_deluxe', 'stove_deluxe'], staff: { waiter: 4, chef: 2 } },
    mid: { tables: 6, stoves: ['stove_steel', 'stove_basic'], staff: { waiter: 2, chef: 2 }, rating: 3.5 },
    big: { tables: 12, stoves: ['stove_deluxe', 'stove_deluxe'], staff: { waiter: 3, chef: 2 }, rating: 4.5 },
  };
  const rows = [], data = {};
  for (const [name, o] of Object.entries(cases)) {
    if (only && !only.includes(name)) continue;
    const r = live(o);
    // ROUND_SCALE model days at 3 h each, full efficiency, no cap
    const m = settleOffline(r.snap, ROUND_SCALE * 3 * 3600 + 1, 1, { efficiency: 1, hoursPerDay: 3, capHours: 99 }).report;
    const L = r.day, gross = m.sales + m.tips + m.fees;
    data[name] = { live: L, model: m };
    rows.push(`${name.padEnd(8)} live served ${String(L.served).padStart(4)} lost ${String(L.lost).padStart(4)} dashed ${String(L.dashed || 0).padStart(2)} coins ${String(L.coins).padStart(6)} ★${L.rating.toFixed(2)}`
      + ` | model served ${String(m.served).padStart(4)} lost ${String(m.lost).padStart(4)} coins ${String(gross).padStart(6)} ★${m.ratingTo.toFixed(2)}`
      + ` | served ${((m.served / Math.max(1, L.served) - 1) * 100).toFixed(0)}% coins ${((gross / Math.max(1, L.coins) - 1) * 100).toFixed(0)}% (${(r.ms / 1000).toFixed(0)} s)`);
    console.log(rows[rows.length - 1]);
  }
  console.log(rows.join('\n'));
  window.calibration = data;
  return rows;
};
window.calibrate();
