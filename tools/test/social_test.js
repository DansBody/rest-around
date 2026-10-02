// Rules for helping friends (src/social.js) on the fixtures.
//   node tools/test/social_test.js
import { planHelp, applyDeliveries, heartsFor, leftToday, trashIn, FRIENDS } from '../../src/social.js';
import * as fx from './fixtures.js';

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };

ok(heartsFor(0) === 1 && heartsFor(9) === 1 && heartsFor(10) === 2 && heartsFor(100) === 5 && heartsFor(999) === 5, 'hearts from friendship points');
ok(leftToday('gift', 1, 0) === 2 && leftToday('gift', 5, 4) === 6 && leftToday('clean', 1, 1) === 0, 'daily limits by hearts');

const helper = fx.grown(), friend = fx.starter();
let p = planHelp(helper, friend, { kind: 'snack', snack: 'cookie', staff: 'mochalatte' }, 1, 0);
ok(!p.error && p.data.state.snacks.cookie === helper.state.snacks.cookie - 1 && p.data.state.points === helper.state.points + FRIENDS.helperPoints, 'a snack is taken from the helper, who earns points');
ok(helper.state.snacks.cookie === 3, 'the helper save passed in is not modified');
ok(planHelp(helper, friend, { kind: 'snack', snack: 'cookie', staff: 'mochalatte' }, 1, 1).error === 'limit', 'second snack at 1 heart is over the limit');
ok(planHelp(helper, friend, { kind: 'snack', snack: 'sandwich', staff: 'mochalatte' }, 1, 0).error === 'have', 'cannot give a snack you do not have');
ok(planHelp(helper, friend, { kind: 'snack', snack: 'cookie', staff: 'oritokki' }, 1, 0).error === 'staff', 'cannot feed staff the friend does not have');
p = planHelp(helper, friend, { kind: 'gift', items: { beans: 2 } }, 1, 0);
ok(!p.error && p.amount === 2 && p.data.state.inv.beans === 28, 'gift two beans');
ok(planHelp(helper, friend, { kind: 'gift', items: { beans: 3 } }, 1, 0).error === 'limit', 'three items at 1 heart is over the limit');
ok(planHelp(helper, friend, { kind: 'gift', items: { matcha: 1 } }, 1, 0).error === 'have', 'cannot gift what you do not have');
ok(planHelp(helper, friend, { kind: 'gift', items: { beans: -5 } }, 1, 0).error === 'items', 'negative gifts are ignored');
p = planHelp(helper, friend, { kind: 'clean' }, 1, 0);
ok(!p.error && p.payload.n === Math.min(3, trashIn(friend)), `clean picks up ${p.payload && p.payload.n} pieces`);
const tidy = fx.starter(); tidy.world.trash = []; tidy.world.extraTrash = 0;
ok(planHelp(helper, tidy, { kind: 'clean' }, 1, 0).error === 'nothing', 'nothing to clean in a tidy café');

const before = fx.starter(); before.world.extraTrash = 1;
const r = applyDeliveries(before, [
  { id: 1, kind: 'clean', payload: { n: 3 }, from_name: 'A' },
  { id: 2, kind: 'snack', payload: { snack: 'cookie', staff: 'mochalatte', energy: 30 }, from_name: 'A' },
  { id: 3, kind: 'snack', payload: { snack: 'bento', staff: 'nobody', energy: 100 }, from_name: 'A' },
  { id: 4, kind: 'gift', payload: { items: { milk: 2, bogus: 9 } }, from_name: 'A' },
]);
ok(trashIn(r.data) === trashIn(before) - 3 && r.applied[0].n === 3, 'clean-up removes litter (unseen first)');
ok(r.data.staff[0].energy === Math.min(100, before.staff[0].energy + 30), 'a snack restores that staff member');
ok(r.data.state.snacks.bento === 1 && r.applied[2].staff === null, 'a snack for staff who left goes to the pantry');
ok(r.data.state.inv.milk === before.state.inv.milk + 2 && !r.data.state.inv.bogus, 'gifted ingredients arrive, unknown ones do not');
process.exit(fail ? 1 : 0);
