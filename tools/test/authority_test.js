// Sanity checks for src/authority.js on the fixtures: honest-looking changes pass, edited saves are caught.
//   node tools/test/authority_test.js
import { capCheck, wealth } from '../../src/authority.js';
import { ROLES } from '../../src/data.js';
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
// The expanded cast can be hired at a sufficient level, paying the normal hiring fee.
{
  const prev = fx.grown(), next = fx.grown();
  next.staff.push({ name: 'TATA', role: 'waiter', look: { model: 'tata', hide: [], tint: null, scale: 1, roleHat: null }, energy: 100, skills: {}, x: 1, y: 1 });
  next.state.coins -= ROLES.waiter.hire;
  const r = capCheck(prev, next, 45);
  ok(!r.reject && !r.flags.length, 'grown: paid sixth hire (TATA) passes');
  const six = structuredClone(next);
  next.staff.push({ ...next.staff[5], name: 'RJ', look: { ...next.staff[5].look, model: 'rj' } });
  next.state.coins -= ROLES.waiter.hire;
  const seventh = capCheck(six, next, 45);
  ok(!seventh.reject && !seventh.flags.length, 'grown: paid seventh hire (RJ) passes');
  next.staff.push({ ...next.staff[6], name: 'Extra' });
  const extra = capCheck(prev, next, 45);
  ok(extra.reject && extra.flags.includes('staff'), 'grown: eighth staff member is rejected');
  const low = fx.starter();
  low.staff = next.staff.slice(0, 6);
  const tooEarly = capCheck(fx.starter(), low, 45);
  ok(tooEarly.reject && tooEarly.flags.includes('staff'), 'starter: six staff without the required level are rejected');
  const levelFive = structuredClone(six);
  levelFive.state.points = 1200;
  const earlyRJ = structuredClone(levelFive);
  earlyRJ.staff = next.staff.slice(0, 7);
  earlyRJ.state.coins -= ROLES.waiter.hire;
  const tooEarlyRJ = capCheck(levelFive, earlyRJ, 45);
  ok(tooEarlyRJ.reject && tooEarlyRJ.flags.includes('staff'), 'level five: seventh hire before level six is rejected');
}
process.exit(fail ? 1 : 0);
