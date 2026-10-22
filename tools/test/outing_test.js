// Outing days (src/outing.js, design/combat/DESIGN.md §3): tickets come one a calendar day up to the cap, an outing
// shuts the café (the offline settlement earns nothing for those hours but still charges the rent), and the
// server's checks (authority.js) catch tickets from nowhere and outings dated outside the upload's window.
//   node tools/test/outing_test.js
import { cleanTickets, topUp, cleanOuting, outingAt, shutAt, shutWithin } from '../../src/outing.js';
import { settleOffline } from '../../src/offline.js';
import { capCheck } from '../../src/authority.js';
import { wallSec } from '../../src/clock.js';
import { OUTING } from '../../src/data.js';
import * as fx from './fixtures.js';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };

// ---------------- tickets
ok(JSON.stringify(cleanTickets(undefined)) === JSON.stringify({ n: OUTING.perDay, day: null }), 'a save from before outings starts with one ticket, not yet counted');
ok(cleanTickets({ n: 99, day: 5 }).n === OUTING.max && cleanTickets({ n: -2, day: 5 }).n === 0, 'a saved count is kept inside 0..max');
ok(topUp({ n: 1, day: null }, 100).n === 1 && topUp({ n: 1, day: null }, 100).day === 100, 'the first count only notes the day');
ok(topUp({ n: 0, day: 100 }, 101).n === 1, 'one ticket the next day');
ok(topUp({ n: 1, day: 100 }, 110).n === OUTING.max, 'ten days away bank up to the cap');
const same = { n: 2, day: 100 };
ok(topUp(same, 100) === same && topUp(same, 99) === same, 'the same day (or a clock going back) gives nothing');

// ---------------- the shut window
const o = outingAt(1000.7);
ok(o.from === 1000 && o.until === 1000 + OUTING.length, 'an outing shuts one round of wall clock');
ok(cleanOuting(o) && !cleanOuting({ from: 0, until: 5 }) && !cleanOuting({ from: 'x' }), 'a window of any other length is not an outing');
ok(shutAt(o, 1000) && shutAt(o, o.until - 1) && !shutAt(o, o.until) && !shutAt(null, 1000), 'shut from the start up to the end');
ok(shutWithin(o, 0, 1500) === 500 && shutWithin(o, 0, 99999) === OUTING.length && shutWithin(o, 0, 900) === 0, 'the overlap with a stretch away');

// ---------------- offline: hours shut earn nothing and still pay rent
for (const [name, make] of Object.entries(fx)) {
  const now = 1790920000000, away = 4 * 3600;
  const base = make(), end = wallSec(now, base.state.tz);
  const plain = settleOffline(make(), away, now);
  const out = make(); out.state.outing = { from: end - away, until: end - away + OUTING.length };   // the first two hours away were an outing
  const shut = settleOffline(out, away, now);
  ok(shut.report.shutSec === OUTING.length, `${name}: the settlement sees ${shut.report.shutSec / 3600} h shut`);
  ok(shut.report.served < plain.report.served && shut.report.sales < plain.report.sales, `${name}: fewer guests (${shut.report.served} vs ${plain.report.served})`);
  ok(shut.report.rent >= plain.report.rent - 1, `${name}: the rent is still paid (${shut.report.rent} vs ${plain.report.rent})`);
  const old = make(); old.state.outing = { from: end - 30 * 3600, until: end - 30 * 3600 + OUTING.length };
  ok(settleOffline(old, away, now).report.shutSec === 0, `${name}: an outing from before the time away changes nothing`);
}

// ---------------- the server's checks
for (const [name, make] of Object.entries(fx)) {
  const prev = make(), wall = 600, nowAt = prev.savedAt + wall * 1000, tz = prev.state.tz, today = Math.floor(wallSec(prev.savedAt, tz) / 86400);
  prev.state.tickets = { n: 1, day: today };
  const next = () => { const d = make(); d.state.tickets = { n: 1, day: today }; return d; };
  const at = wallSec(prev.savedAt, tz) + 300;   // headed out five minutes into the window

  let n = next(); n.state.tickets = { n: 0, day: today }; n.state.outing = outingAt(at);
  let r = capCheck(prev, n, wall);
  ok(!r.reject && !r.flags.includes('tickets'), `${name}: an outing that spends a ticket passes`);

  n = next(); n.state.outing = outingAt(at);
  r = capCheck(prev, n, wall);
  ok(!r.reject && r.flags.includes('tickets') && r.data.state.tickets.n === 0, `${name}: an outing that keeps its ticket loses it`);

  const broke = make(); broke.state.tickets = { n: 0, day: today };
  n = next(); n.state.tickets = { n: 0, day: today }; n.state.outing = outingAt(at);
  r = capCheck(broke, n, wall);
  ok(r.reject && r.flags[0] === 'outing', `${name}: an outing without a ticket is rejected`);

  n = next(); n.state.tickets = { n: 3, day: today };
  r = capCheck(prev, n, wall);
  ok(!r.reject && r.flags.includes('tickets') && r.data.state.tickets.n === 1, `${name}: tickets from nowhere are taken back`);

  n = next(); n.state.tickets = { n: 2, day: today + 1 };
  r = capCheck(prev, n, wall);
  ok(!r.reject && !r.flags.includes('tickets'), `${name}: a new calendar day brings one more`);

  n = next(); n.state.tickets = { n: 3, day: today + 40 };
  r = capCheck(prev, n, wall);
  ok(r.reject && r.flags[0] === 'tickets', `${name}: a calendar day far ahead of the server's clock is rejected`);

  n = next(); n.state.tickets = { n: 0, day: today }; n.state.outing = outingAt(at - 86400);
  r = capCheck(prev, n, wall);
  ok(r.reject && r.flags[0] === 'outing', `${name}: an outing dated before the last accepted save is rejected`);

  n = next(); n.state.outing = { from: at, until: at + 60 };
  r = capCheck(prev, n, wall);
  ok(r.reject && r.flags[0] === 'shape:outing', `${name}: a shut window of the wrong length is rejected`);

  const was = make(); was.state.tickets = { n: 0, day: today }; was.state.outing = outingAt(at - 400);
  n = next(); n.state.tickets = { n: 0, day: today }; n.state.outing = was.state.outing;
  r = capCheck(was, n, wall);
  ok(!r.reject && !r.flags.length, `${name}: the same outing in the next upload is not a new one`);
  void nowAt;
}

console.log(fail ? `outing_test: ${fail} failed` : 'outing_test: ok');
if (fail) process.exit(1);
