// The owner lends a hand: tap the café to do a job yourself, right away, instead of waiting for the team.
//   a guest waiting to order   → take their order on the spot (they are delighted: patience back to full)
//   a guest whose order is up  → carry what's ready on the counter or in the pastry case straight to them
//   a dirty table              → clear it
//   litter (or next to it)     → sweep it up
// No limit: the team still runs the place, but whenever the player wants to step in, they can. Only in your own
// café, only live.
import { slotOfTicket } from './pastry.js';
import { t } from './i18n.js';

/** What a tap on this guest / tile would do, if anything: { kind, run } (nothing is done yet). */
function helpFor(g, agent, tile) {
  if (agent && agent.kind === 'customer' && !agent.gone) {
    const c = agent;
    if (c.state === 'waitOrder') return { kind: 'order', at: c, run: () => takeOrder(g, c) };
    if (c.state === 'waitFood') {
      const ready = (c.tickets || []).filter((tk) => tk.state === 'ready' && tk.station);
      if (ready.length) return { kind: 'serve', at: c, run: () => serve(g, c, ready) };
      return { kind: 'wait', at: c };
    }
    return null;
  }
  if (!tile) return null;
  const w = g.world;
  const seat = w.seats.find((s) => s.dirty && !s.customer && ((s.table.x === tile.x && s.table.y === tile.y) || (s.chair.x === tile.x && s.chair.y === tile.y)));
  if (seat) return { kind: 'clear', at: seat.table, run: () => clearTable(g, seat) };
  const near = w.trash.filter((p) => Math.abs(p.x - tile.x) <= 1 && Math.abs(p.y - tile.y) <= 1)
    .sort((a, b) => Math.hypot(a.x - tile.x, a.y - tile.y) - Math.hypot(b.x - tile.x, b.y - tile.y))[0];
  if (near) return { kind: 'sweep', at: near, run: () => sweep(g, near) };
  return null;
}

/**
 * A tap in your own café: lend a hand if there is something to do there. True when the tap was used
 * (done, or answered with why not), so the caller doesn't open the info card as well.
 */
export function bossTap(g, agent, tile) {
  if (g.visit || g.build.active || g.paused || g.hold) return false;
  const help = helpFor(g, agent, tile);
  if (!help) return false;
  if (help.kind === 'wait') {   // nothing ready for them yet: say so, and still show their card
    g.floatText(help.at.x, help.at.y, t('Still being made…'), null, '#ffffff', 120);
    return false;
  }
  help.run();
  g.emit('bossHelped', help.kind);
  return true;
}

// ------------------------------------------------------------------ the jobs, done by the owner
function takeOrder(g, c) {
  if (c.orderJob) { g.jobs.cancel(c.orderJob); c.orderJob = null; }
  c.patience = 1;   // the owner coming over in person: they are happy to have waited
  c.takeOrder(null);
  c.emote('emote_heart', 1.6);
  g.fx.sparkle(g.at(c.x, c.y, 90), 8, '#ffe27a');
  g.floatText(c.x, c.y, t('Owner took the order!'), null, '#ffe27a', 130);
  g.sfx('order');
}

function serve(g, c, tickets) {
  for (const tk of tickets) {
    const st = tk.station;
    if (st.kind === 'bar') { const i = slotOfTicket(st, tk); if (i >= 0) st.slots[i] = null; }
    else if (st.ready === tk) st.ready = null;
    // the server who was on their way to fetch it finds nothing there and moves on
    if (tk.deliverJob) g.jobs.cancel(tk.deliverJob);
    tk.deliverJob = null;
    g.fx.puff(g.at(st.x + 0.5, st.y + 0.5, 60), '#ffffff', 4);
    c.receive(tk);
  }
  c.emote('emote_heart', 1.6);
  g.fx.sparkle(g.at(c.x, c.y, 90), 8, '#ffe27a');
  g.floatText(c.x, c.y, t('Served by the owner!'), null, '#ffe27a', 130);
}

function clearTable(g, seat) {
  seat.dirty = false;
  g.jobs.cancelWhere((j) => j.type === 'clear' && j.seat === seat && !j.assignee);
  g.fx.sparkle(g.at(seat.table.x + 0.5, seat.table.y + 0.5, 40), 8, '#ffffff');
  g.sfx('pop');
}

function sweep(g, p) {
  g.world.removeTrash(p);
  g.fx.puff(g.at(p.x + 0.5, p.y + 0.5, 20), '#ffffff', 4);
  g.fx.sparkle(g.at(p.x + 0.5, p.y + 0.5, 30), 6);
  g.sfx('sweep');
}
