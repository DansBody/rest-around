// Sanity checks for src/authority.js on the fixtures: honest-looking changes pass, edited saves are caught.
//   node tools/test/authority_test.js
import { capCheck, wealth } from '../../src/authority.js';
import { ROLES, LEVEL_POINTS, EXPANSIONS, staffSlots, seatCap } from '../../src/data.js';
import { levelFor } from '../../src/offline.js';
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
  // an accessory bought with coins is wealth-neutral; a dozen crowns from nowhere are not
  n = make(); n.state.wardrobe = { hat_beret: 1 }; n.state.coins -= 150;
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.length && Math.abs(wealth(n) - wealth(prev)) < 1e-9, `${name}: buying a beret is wealth-neutral`);
  n = make(); n.state.wardrobe = { crown_gold: 12 };
  r = capCheck(prev, n, 45);
  ok(r.reject || r.flags.includes('wealth'), `${name}: twelve free crowns are caught (${r.reject ? 'rejected' : 'coins taken back'})`);
  // buying furniture with coins is fine
  n = make(); n.world.furniture.push({ t: 'plant_fern', x: 1, y: 2, d: 1, u: 0, b: false, ba: 0 }); n.state.coins -= 30;
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.length && Math.abs(wealth(n) - wealth(prev)) < 1e-9, `${name}: buying a plant is wealth-neutral`);
  // skipping rounds
  n = make(); n.state.round += 5;
  ok(capCheck(prev, n, 45).reject, `${name}: jumping 5 rounds in 45 s is rejected`);
  n = make(); n.state.round += 1;
  ok(!capCheck(prev, n, 45).reject, `${name}: the next round opening within 45 s is fine`);
  n = make(); n.state.round += 4; n.state.tz = 0;
  ok(!capCheck(prev, n, 45).reject, `${name}: moving time zones shifts the round without a rejection`);
  // the daily gift, twice in a minute
  n = make(); n.state.giftDay = (prev.state.giftDay || 0) + 1; n.state.coins += 60;
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.includes('wealth'), `${name}: opening the daily gift is allowed`);
  // study vouchers: a goal claimed today is fine, a pile of them is taken back, a dish studied for free is rejected
  n = make(); n.state.daily = { day: 1, goals: [{ id: 'cups', target: 5, prog: 5, claimed: true }], chest: false }; n.state.vouchers = (prev.state.vouchers || 0) + 1; n.state.coins += 80;
  r = capCheck(prev, n, 45);
  ok(!r.reject && !r.flags.length, `${name}: claiming a daily goal (1 voucher) passes`);
  n = make(); n.state.vouchers = (prev.state.vouchers || 0) + 500;
  r = capCheck(prev, n, 45);
  ok(!r.reject && r.flags.includes('vouchers') && r.data.state.vouchers === (prev.state.vouchers || 0), `${name}: +500 vouchers are taken back`);
  n = make(); n.state.dishes.espresso.lv = 9;
  r = capCheck(prev, n, 45);
  ok(r.reject && r.flags.includes('vouchers'), `${name}: a dish studied to Lv9 without vouchers is rejected`);
  n = make(); n.state.vouchers = 3; const n0 = make(); n0.state.vouchers = 3; n.state.dishes.espresso.lv += 1; n.state.vouchers -= 1;
  r = capCheck(n0, n, 45);
  ok(!r.flags.includes('vouchers') && !r.reject, `${name}: studying a dish with held vouchers is voucher-neutral`);
  // rating edit
  n = make(); n.state.rating = 5;
  r = capCheck(prev, n, 10);
  ok(r.flags.includes('rating') || prev.state.rating > 4.7, `${name}: rating jump is eased (${r.data.state.rating.toFixed(2)})`);
  // XP edit
  n = make(); n.staff[0].skills = { waiter: 99999 };
  r = capCheck(prev, n, 45);
  ok(r.flags.includes('xp') && r.data.staff[0].skills.waiter === prev.staff[0].skills.waiter, `${name}: XP edit is reverted`);
}
// The cast can be hired up to the level's staff slots (paying the normal fee), not one more.
{
  const at = (lv) => { const d = fx.grown(); d.state.points = LEVEL_POINTS[lv]; return d; };
  const lv = 9, slots = staffSlots(lv), models = ['tata', 'rj', 'chimmy', 'bboogyuli', 'bamgeut'];
  let prev = at(lv);
  for (let i = 0; prev.staff.length < slots; i++) {
    const next = structuredClone(prev);
    next.staff.push({ ...next.staff[0], name: models[i], look: { ...next.staff[0].look, model: models[i] }, skills: {} });
    next.state.coins -= ROLES.waiter.hire;
    const r = capCheck(prev, next, 45);
    ok(!r.reject && !r.flags.length, `level ${lv}: paid hire #${next.staff.length} of ${slots} passes`);
    prev = next;
  }
  const extra = structuredClone(prev);
  extra.staff.push({ ...extra.staff[0], name: 'Extra', look: { ...extra.staff[0].look, model: 'bamgeut' } });
  ok(capCheck(prev, extra, 45).reject, `level ${lv}: hire #${slots + 1} is rejected`);
  const low = fx.starter();
  low.staff = prev.staff.slice(0, staffSlots(1) + 2);
  const tooEarly = capCheck(fx.starter(), low, 45);
  ok(tooEarly.reject && tooEarly.flags.includes('staff'), 'starter: more staff than the level allows are rejected');
}
// Seats and stations past the level's caps are rejected; a room already over them may keep what it has.
{
  const prev = fx.grown(), lv = levelFor(prev.state.points);
  const many = structuredClone(prev);
  for (let i = 0; i < 12; i++) many.world.furniture.push({ t: 'table_oak', x: 20 + i * 3, y: 30, d: 1 }, { t: 'chair_oak', x: 19 + i * 3, y: 30, d: 0 }, { t: 'chair_oak', x: 21 + i * 3, y: 30, d: 2 });
  many.state.coins -= 12 * 80;
  const r = capCheck(prev, many, 45);
  ok(r.reject && r.flags.includes('seats'), `level ${lv}: 24 more seats than the cap (${seatCap(lv)}) are rejected`);
  const kept = capCheck(many, structuredClone(many), 45);
  ok(!kept.flags.includes('seats') && !kept.reject, 'a room already over the seat cap keeps its seats');
  const stoves = structuredClone(prev);
  for (let i = 0; i < 4; i++) stoves.world.furniture.push({ t: 'stove_basic', x: 30 + i, y: 40, d: 1 });
  stoves.state.coins -= 4 * 120;
  ok(capCheck(prev, stoves, 45).flags.includes('stations'), `level ${lv}: espresso machines past the cap are rejected`);
}
// Expansions are built in real time: the room can't grow before the server's clock passes the finish time.
{
  const prev = fx.starter(); prev.savedAt = 1e12; prev.state.points = LEVEL_POINTS[3];
  const e = EXPANSIONS.find((x) => x.size === 10), ms = e.hours * 3600 * 1000;
  const start = structuredClone(prev); start.state.coins += 5000; prev.state.coins += 5000;
  start.state.coins -= e.price; start.state.expansion = { size: 10, start: prev.savedAt + 10000, end: prev.savedAt + 10000 + ms };
  ok(!capCheck(prev, start, 45).reject, 'starting a 10×10 expansion passes');
  const instant = structuredClone(start); instant.state.expansion.end = instant.state.expansion.start + 1000;
  ok(capCheck(prev, instant, 45).flags.includes('expansion'), 'an expansion that finishes at once is rejected');
  const grown = structuredClone(start); grown.state.expansion = null; grown.world.size = 10;
  const accepted = structuredClone(start); accepted.savedAt = prev.savedAt + 45000;
  ok(capCheck(accepted, grown, 60).flags.includes('expansion'), 'the room growing before the work is done is rejected');
  ok(!capCheck(accepted, grown, ms / 1000).reject, 'the room grows once the work is done');
}
process.exit(fail ? 1 : 0);
