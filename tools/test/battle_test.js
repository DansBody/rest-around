// Battle prototype checks (src/battle): the same seed plays the same fight, nothing loops forever, and the auto
// button can clear the test commission most of the time (it is a plain heuristic: a player should do better).
//   node tools/test/battle_test.js
import assert from 'node:assert/strict';
import { Battle, Run, autoMove } from '../../src/battle/engine.js';
import { COMMISSION } from '../../src/battle/data.js';

/** Play a whole commission on auto; returns what happened. */
function playRun(seed, night = false) {
  const run = new Run(COMMISSION, { seed, night });
  let turns = 0;
  for (;;) {
    const node = run.here;
    if (node.type === 'rest') run.rest();
    else {
      const b = run.fight();
      b.start();
      for (let guard = 0; !b.over; guard++) {
        assert.ok(guard < 400, `seed ${seed}: the fight never ends`);
        const m = autoMove(b);
        if (!m) { b.endTurn(); turns++; continue; }
        const ev = m.drink != null ? b.useDrink(m.drink) : b.play(m.uid, m.foe);
        assert.ok(ev, `seed ${seed}: auto picked a move it cannot make`);
      }
      run.settle();
      if (b.over === 'lost') return { won: false, turns, chill: 0, node: run.node };
      const offer = run.offer();
      run.pick(offer[0]);
    }
    if (!run.next()) return { won: true, turns, chill: run.chill, coins: run.payout(), lost: run.lost };
  }
}

// the same seed, the same story
assert.deepEqual(playRun(42), playRun(42));

// a fight's events: playing a card spends energy and the card goes to the discard pile
{
  const b = new Battle({ deck: [{ uid: 1, id: 'lattehit' }, { uid: 2, id: 'lattehit' }, { uid: 3, id: 'sidestep' }], foes: ['phone'], seed: 7, team: ['cheetie'] });
  b.start();
  assert.equal(b.hand.length, 3);
  const e0 = b.energy, ev = b.play(1, b.foes[0].uid);
  assert.ok(ev.some((e) => e.t === 'hit' && e.n === 6));
  assert.equal(b.energy, e0 - 1);
  assert.equal(b.foes[0].hp, b.foes[0].max - 6);
}

// colour back: a full fade gauge makes the foe skip its move and take double
{
  const b = new Battle({ deck: [{ uid: 1, id: 'whisper' }, { uid: 2, id: 'whisper' }, { uid: 3, id: 'lattehit' }], foes: ['phone'], seed: 3, team: ['bbaekko'] });
  b.start();
  const f = b.foes[0];
  b.play(1, f.uid); b.play(2, f.uid);
  assert.equal(f.fade, 4);
  b.foes[0].fade = 4; b.fadeFoe(f, 1, []);
  assert.ok(f.colored);
  const ev = b.play(3, f.uid);
  assert.ok(ev.some((e) => e.t === 'hit' && e.n === 12 && e.x2));
  const end = b.endTurn();
  assert.ok(end.some((e) => e.t === 'stunned'));
}

// Time Pause cancels the move
{
  const b = new Battle({ deck: [{ uid: 1, id: 'timestop' }], foes: ['clock'], seed: 1, team: ['mochalatte'] });
  b.start();
  const chill = b.chill;
  b.play(1, b.foes[0].uid);
  b.endTurn();
  assert.equal(b.chill, chill, 'the paused clock did not hit');
}

// balance on auto
const N = 300;
let wins = 0, turns = 0, chill = 0;
for (let s = 1; s <= N; s++) { const r = playRun(s * 7919); if (r.won) { wins++; chill += r.chill; } turns += r.turns; }
const night = Array.from({ length: N }, (_, i) => playRun(i * 104729 + 1, true)).filter((r) => r.won).length;
console.log(`auto: ${wins}/${N} won (${Math.round(wins / N * 100)}%), avg chill left ${(chill / Math.max(1, wins)).toFixed(1)}, avg turns ${(turns / N).toFixed(1)}; at night ${night}/${N}`);
assert.ok(wins / N > 0.6, 'auto should clear the test commission more often than not');
assert.ok(wins / N < 0.92, 'the test commission should not be a sure thing on auto');
console.log('battle_test: ok');
