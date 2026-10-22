// Real-time battle checks (src/battle/realtime.js): a fight replays the same from its seed and inputs, nothing runs
// forever, fights last about a minute, and auto clears the test commission most of the time.
//   node tools/test/battle_rt_test.js
import assert from 'node:assert/strict';
import { Run } from '../../src/battle/engine.js';
import { RtBattle, autoMoveRt, replay } from '../../src/battle/realtime.js';
import { COMMISSION, RT } from '../../src/battle/data.js';

const ASK = 3;   // auto is asked every 3 ticks, as on screen

/** Play a whole commission on auto; returns what happened (and each fight's setup + inputs, for replays). */
function playRun(seed, night = false) {
  const run = new Run(COMMISSION, { seed, night, Fight: RtBattle });
  const secs = [], fights = [];
  for (;;) {
    const node = run.here;
    if (node.type === 'rest') run.rest();
    else {
      const b = run.fight(), setup = { deck: run.deck.map((c) => ({ ...c })), foes: node.foes, seed: b.rand && b.seed0, night };
      b.start();
      while (!b.over) {
        assert.ok(b.tick < RT.tps * 600, `seed ${seed}: the fight never ends`);
        if (b.tick % ASK === 0) {
          const m = autoMoveRt(b);
          if (m) assert.ok(m.drink != null ? b.useDrink(m.drink) : b.play(m.uid, m.foe), `seed ${seed}: auto picked a move it cannot make`);
        }
        b.step();
      }
      secs.push(b.tick / RT.tps);
      fights.push({ setup, b });
      run.settle();
      if (b.over === 'lost') return { won: false, secs, chill: 0, node: run.node, fights };
      run.pick(run.offer()[0]);
    }
    if (!run.next()) return { won: true, secs, chill: run.chill, coins: run.payout(), lost: run.lost, fights };
  }
}
const story = (r) => ({ won: r.won, secs: r.secs, chill: r.chill, coins: r.coins });

// the same seed, the same story
assert.deepEqual(story(playRun(42)), story(playRun(42)));

// a fight replays from its seed and the inputs log alone
{
  const b0 = new RtBattle({ deck: ['lattehit', 'dash', 'timestop', 'sidestep', 'chant', 'wild'].map((id, i) => ({ uid: 900 + i, id })), foes: ['clock', 'phone'], seed: 5 });
  b0.start();
  while (!b0.over && b0.tick < 3000) {
    if (b0.tick % ASK === 0) { const m = autoMoveRt(b0); if (m) m.drink != null ? b0.useDrink(m.drink) : b0.play(m.uid, m.foe); }
    b0.step();
  }
  const b1 = replay({ deck: ['lattehit', 'dash', 'timestop', 'sidestep', 'chant', 'wild'].map((id, i) => ({ uid: 900 + i, id })), foes: ['clock', 'phone'], seed: 5 }, b0.log, b0.tick);
  assert.equal(b1.tick, b0.tick);
  assert.equal(b1.chill, b0.chill);
  assert.deepEqual(b1.foes.map((f) => f.hp), b0.foes.map((f) => f.hp));
}

// cost refills on the clock, up to the cap
{
  const b = new RtBattle({ deck: [{ uid: 1, id: 'timestop' }], foes: ['clock'], seed: 1, team: ['heehee'] });
  b.start();
  const e0 = b.energy;
  for (let i = 0; i < RT.regen * RT.tps; i++) b.step();
  assert.equal(b.energy, e0 + 1);
  for (let i = 0; i < 400; i++) { b.chill = 60; b.step(); }
  assert.equal(b.energy, RT.energyMax);
}

// Time Pause throws the charge away and freezes the foe
{
  const b = new RtBattle({ deck: [{ uid: 1, id: 'timestop' }], foes: ['clock'], seed: 1, team: ['heehee'] });
  b.start();
  const f = b.foes[0];
  for (let i = 0; i < 20; i++) b.step();
  const was = f.step;
  b.energy = 10;
  b.play(1, f.uid);
  assert.equal(f.charge, 0);
  assert.ok(f.frozen > 0);
  assert.equal(f.step, was + 1, 'the move it was charging is skipped');
}

// rows: hits land on the front row, pings go for the back, Spotlight pulls everything to Hee Hee, the ring hits all
{
  const deck = [{ uid: 1, id: 'spotlight' }, { uid: 2, id: 'chant' }, { uid: 3, id: 'wild' }];
  const b = new RtBattle({ deck, foes: ['clock', 'ping'], seed: 2 });
  b.start();
  const [clock, ping] = b.foes, ev = [];
  b.hurtTeam(5, clock, 'hit', ev);
  assert.equal(b.member(ev[0].who).row, 'front');
  ev.length = 0; ping.intent = ping.def.pattern[0];
  b.hurtTeam(5, ping, 'hit', ev);
  assert.equal(b.member(ev[0].who).row, 'back');
  b.energy = 10; b.play(1);
  ev.length = 0; clock.intent = { k: 'hit', dmg: 3 };
  for (let i = 0; i < 4; i++) b.hurtTeam(3, clock, 'hit', ev);
  assert.ok(ev.filter((e) => e.t === 'hurt').every((e) => e.who === 'heehee'), 'Spotlight: Hee Hee takes them all');
  ev.length = 0; clock.intent = clock.def.pattern[3];
  b.hurtTeam(30, clock, 'ring', ev);
  assert.equal(ev.filter((e) => e.t === 'hurt').length, 4);
}

// a member who sits out: no more swings, their cards leave the fight
{
  const deck = ['chant', 'wild', 'whisper', 'lattehit', 'dash', 'sidestep'].map((id, i) => ({ uid: 700 + i, id }));
  const b = new RtBattle({ deck, foes: ['clock'], seed: 4 });
  b.start();
  const bb = b.member('bbaekko'), ev = [];
  bb.hp = 1;
  b.hurtTeam(5, { uid: 0, intent: { k: 'hit', dmg: 5, aim: 'back' } }, 'hit', ev);
  if (!bb.hp) {
    assert.ok(ev.some((e) => e.t === 'ko' && e.who === 'bbaekko'));
    assert.ok(![...b.hand, ...b.draw, ...b.discard].some((c) => c.id === 'chant' || c.id === 'wild' || c.id === 'whisper'));
    for (let i = 0; i < 60; i++) assert.ok(!b.step().some((e) => e.t === 'swing' && e.who === 'bbaekko'));
  }
}

// balance on auto
const N = 300;
let wins = 0, chill = 0, boss = 0, first = 0, bossN = 0;
for (let s = 1; s <= N; s++) {
  const r = playRun(s * 7919);
  if (r.won) { wins++; chill += r.chill; }
  first += r.secs[0];
  if (r.secs[1] != null) { boss += r.secs[1]; bossN++; }
}
const night = Array.from({ length: N }, (_, i) => playRun(i * 104729 + 1, true)).filter((r) => r.won).length;
console.log(`auto: ${wins}/${N} won (${Math.round(wins / N * 100)}%), avg chill left ${(chill / Math.max(1, wins)).toFixed(1)}, ` +
  `first fight ${(first / N).toFixed(0)} s, boss ${(boss / Math.max(1, bossN)).toFixed(0)} s; at night ${night}/${N}`);
assert.ok(wins / N > 0.6, 'auto should clear the test commission more often than not');
assert.ok(wins / N < 0.92, 'the test commission should not be a sure thing on auto');
console.log('battle_rt_test: ok');
