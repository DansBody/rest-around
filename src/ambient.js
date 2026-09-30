// Passers-by on the street outside (pure decoration, never enter). Guests who finish their visit
// also become passers-by once they're back on the sidewalk.
import { randomLook } from './looks.js';
import { rand, choice } from './util.js';

export class Walker {
  constructor(look, x, y, toY, speed) {
    this.look = look; this.x = x; this.y = y; this.toY = toY;
    this.speed = speed; this.phase = Math.random() * 6; this.seed = Math.random() * 10;
    this.dir = toY > y ? 1 : 3;
    this.pose = { mode: 'idle', t: 0 };
    this.done = false;
  }
  update(dt) {
    const d = this.toY - this.y, step = Math.min(Math.abs(d), this.speed * dt);
    this.y += Math.sign(d) * step;
    this.phase += step * Math.PI * 1.6;
    if (Math.abs(this.toY - this.y) < 1e-3) this.done = true;
  }
  computePose(t) {
    Object.assign(this.pose, { t, phase: this.phase, moving: true, mode: this.carry ? 'carry' : 'idle', seed: this.seed, lift: 0, alpha: 1, hop: 0, shake: false, held: this.carry || null, expr: null });
    return this.pose;
  }
}

export class Street {
  constructor(game) { this.game = game; this.next = 2; }
  update(dt) {
    const g = this.game;
    for (const w of g.ambient) w.update(dt);
    g.ambient = g.ambient.filter((w) => !w.done);
    this.next -= dt;
    if (this.next <= 0 && g.ambient.length < 4) {
      this.next = rand(4, 11);
      const n = g.world.size;
      const down = Math.random() < 0.5;
      const lane = choice([-2.15, -2.9, -6.5, -6.5]);
      const w = new Walker(randomLook(), lane, down ? -9 : n + 9, down ? n + 9 : -9, rand(1.3, 2));
      if (Math.random() < 0.15) w.carry = { id: 'held_tray', dish: choice(['drink_lemonade', 'dish_cake', 'drink_milktea']) };
      g.ambient.push(w);
    }
  }
  /** A guest reached the sidewalk on the way home: hand them over as a passer-by. */
  adopt(agent, toY) {
    const w = new Walker(agent.look, agent.x, agent.y, toY, agent.speed);
    w.phase = agent.phase;
    this.game.ambient.push(w);
  }
}
