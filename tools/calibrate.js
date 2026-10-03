// Calibrates the away-from-keyboard model (src/offline.js MODEL) against the live simulation.
// Run in the browser console of a running game (python tools/devserver.py 8123, open the page, paste this file).
// For each café layout it plays one round (08:00 to closing) with the real simulation (game.fastForward) and
// settles the same layout with the model at full efficiency for as many model days as a round's opening
// hours hold (ROUND_SCALE), then prints both side by side. A round is ~2 real hours of simulation, so this
// takes a while. Tune MODEL until they agree
// (served within ~10%, rating within ~0.3 stars), then leave OFFLINE.efficiency below 1 to taste.
(async () => {
  const g = window.game;
  const { serialize } = await import('/src/save.js');
  const { makeStaff } = await import('/src/staff.js');
  const { DAY, OFFLINE, ROUND_SCALE } = await import('/src/data.js');
  const { settleOffline } = await import('/src/offline.js?v=' + Date.now());

  async function live(o) {
    g.newGame();
    const w = g.world;
    for (const f of [...w.furniture]) w.removeFurniture(f);
    for (const a of [...g.staff]) g.removeAgent(a);
    w.resize(14, 'fl_oak');
    g.state.coins = 9999; g.state.level = 6; g.state.points = 1700;
    g.state.inv = { beans: 90, sugar: 90, milk: 90, flour: 90, butter: 90, chocolate: 90, egg: 90 };
    (o.stoves || ['stove_basic']).forEach((t, i) => w.addFurniture(t, 6 + i * 2, 0, 1));
    (o.bars || []).forEach((t, i) => w.addFurniture(t, 2 + i * 2, 0, 1));
    let placed = 0;
    for (let row = 0; row < 5 && placed < o.tables; row++) for (let col = 0; col < 3 && placed < o.tables; col++) {
      const x = 3 + col * 4, y = 3 + row * 2;
      w.addFurniture('table_oak', x, y, 1); w.addFurniture('chair_oak', x - 1, y, 0); w.addFurniture('chair_oak', x + 1, y, 2); placed++;
    }
    const models = ['mochalatte', 'bbaekko', 'heehee', 'cheetie', 'oritokki'];
    let mi = 0;
    for (const [role, n] of Object.entries(o.staff)) for (let i = 0; i < n; i++) g.addStaff(makeStaff(g, role, models[mi++ % 5]), 1 + mi, 1);
    for (const a of g.staff) a.look.model = 'mochalatte';   // neutral kit: no perks
    g.state.rating = o.rating ?? 5; g.rating.recompute();
    g.state.quest = null; g.eco.rollQuest(); g.day.nextSpawn = 2;
    g.state.clock = 0; g.state.stats = g.day.freshStats();   // from opening, whatever the wall clock says
    const snap = JSON.parse(JSON.stringify(serialize(g)));
    const rounds = g.fastForward(DAY.length + 130);
    g.day.snap();
    return { snap, day: { ...rounds[0], rating: rounds[0].ratingEnd } };
  }

  const cases = {
    default: { tables: 2, stoves: ['stove_basic'], staff: { waiter: 1, chef: 1 }, rating: 2.6 },
    waiter1: { tables: 12, stoves: ['stove_deluxe', 'stove_deluxe', 'stove_deluxe'], staff: { waiter: 1, chef: 3 } },
    chef1: { tables: 12, stoves: ['stove_basic'], staff: { waiter: 4, chef: 1 } },
    seats4: { tables: 2, stoves: ['stove_deluxe', 'stove_deluxe'], staff: { waiter: 4, chef: 2 } },
    mid: { tables: 6, stoves: ['stove_steel', 'stove_basic'], staff: { waiter: 2, chef: 2 }, rating: 3.5 },
    big: { tables: 12, stoves: ['stove_deluxe', 'stove_deluxe'], staff: { waiter: 3, chef: 2 }, rating: 4.5 },
  };
  const keep = { ...OFFLINE };
  OFFLINE.efficiency = 1; OFFLINE.hoursPerDay = 3; OFFLINE.capHours = 99;
  const rows = [];
  for (const [name, o] of Object.entries(cases)) {
    const r = await live(o);
    const m = settleOffline(r.snap, ROUND_SCALE * 3 * 3600 + 1, 1).report;
    rows.push(`${name.padEnd(8)} live served ${String(r.day.served).padStart(3)} ★${r.day.rating.toFixed(2)} | model served ${String(m.served).padStart(3)} ★${m.ratingTo.toFixed(2)}`);
  }
  Object.assign(OFFLINE, keep);
  console.log(rows.join('\n'));
  return rows;
})();
