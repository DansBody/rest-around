// Sanity checks for src/authority.js on the fixtures: honest-looking changes pass, edited saves are caught.
//   node tools/test/authority_test.js
import { capCheck, wealth } from '../../src/authority.js';
import * as fx from './fixtures.js';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };

for (const [name, make] of Object.entries(fx)) {
  const prev = make();
  // nothing happened
  let r = capCheck(prev, make(), 45);
  ok(!r.reject && !r.flags.length, `${name}: unchanged save passes (allowed ${JSON.stringify(r.allowed)})`);
  // a modest income in 45 s
  let n = make(); n.state.coins += Math.floor(r.allowed.wealth * 0.5); n.state.points += Math.floor(r.allowed.points * 0.5);
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.length, `${name}: half the ceiling passes`);
  // a coin edit
  n = make(); n.state.coins += 100000;
  r = capCheck(prev, n, 45);
  ok(!r.reject && r.flags.includes('wealth') && r.data.state.coins - prev.state.coins <= r.allowed.wealth + 1, `${name}: +100000 coins is cut back to ${r.data.state.coins - prev.state.coins}`);
  // free furniture
  n = make(); for (let i = 0; i < 6; i++) n.world.furniture.push({ t: 'stove_deluxe', x: 1, y: 1, d: 1, u: 0, b: false, ba: 0 });
  r = capCheck(prev, n, 45);
  ok(r.reject || r.flags.includes('wealth'), `${name}: six free Barista Bars are caught (${r.reject ? 'rejected' : 'coins taken back'})`);
  // buying furniture with coins is fine
  n = make(); n.world.furniture.push({ t: 'plant_fern', x: 1, y: 2, d: 1, u: 0, b: false, ba: 0 }); n.state.coins -= 30;
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.length && Math.abs(wealth(n) - wealth(prev)) < 1e-9, `${name}: buying a plant is wealth-neutral`);
  // skipping days
  n = make(); n.state.day += 5;
  ok(capCheck(prev, n, 45).reject, `${name}: jumping 5 days in 45 s is rejected`);
  // rating edit
  n = make(); n.state.rating = 5;
  r = capCheck(prev, n, 10);
  ok(r.flags.includes('rating') || prev.state.rating > 4.7, `${name}: rating jump is eased (${r.data.state.rating.toFixed(2)})`);
  // XP edit
  n = make(); n.staff[0].skills = { waiter: 99999 };
  r = capCheck(prev, n, 45);
  ok(r.flags.includes('xp') && r.data.staff[0].skills.waiter === prev.staff[0].skills.waiter, `${name}: XP edit is reverted`);
}
process.exit(fail ? 1 : 0);
