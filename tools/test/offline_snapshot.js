// Prints settleOffline() results for the fixtures over several stretches of time away, as JSON.
// Run before and after touching offline.js / data.js and diff the output: an unintended balance change shows up here.
//   node tools/test/offline_snapshot.js > before.json
import { settleOffline } from '../../src/offline.js';
import * as fx from './fixtures.js';

const out = {};
for (const [name, make] of Object.entries(fx)) {
  for (const sec of [300, 600, 3600, 4 * 3600 + 17, 12 * 3600, 30 * 3600]) {
    const r = settleOffline(make(), sec, 1790920000000);
    out[`${name}@${sec}`] = r && { coins: r.data.state.coins, points: r.data.state.points, rating: +r.data.state.rating.toFixed(6), report: r.report, staff: r.data.staff, inv: r.data.state.inv };
  }
}
console.log(JSON.stringify(out, null, 1));
