// Rating (0–5 stars) from service speed, cleanliness, dish levels, decor and broken facilities.
// The displayed rating drifts toward the target so it reacts over the course of a day.
import { dishById, wallDecorById } from './data.js';
import { clamp } from './util.js';

export const RATING_WEIGHTS = { service: 0.38, clean: 0.2, dishes: 0.12, decor: 0.2, repair: 0.1 };

export class Rating {
  constructor(game) { this.game = game; this.parts = { service: 0.6, clean: 1, dishes: 0.1, decor: 0.2, repair: 1 }; this.target = 2.6; this.t = 0; }

  addService(v) {
    const s = this.game.state.service;
    s.push(clamp(v, 0, 1));
    if (s.length > 24) s.shift();
  }

  recompute() {
    const g = this.game, w = g.world, st = g.state;
    const sv = st.service;
    const service = sv.length ? sv.reduce((a, b) => a + b, 0) / sv.length : 0.6;
    const area = w.size * w.size;
    const clean = clamp(1 - w.trash.length / (1.5 + area / 22), 0, 1);
    const menu = Object.keys(st.dishes).filter((id) => st.dishes[id].on && dishById[id].level <= st.level);
    const dishes = menu.length ? clamp(menu.reduce((a, id) => a + st.dishes[id].lv, 0) / menu.length / 10, 0, 1) : 0;
    const walls = (st.wallDeco || []).reduce((a, id) => a + ((wallDecorById[id] || {}).decor || 0), 0);
    const decor = clamp((w.decorScore() + walls) / (area * 0.55), 0, 1);
    const broken = w.furniture.filter((f) => f.broken).length;
    const repair = clamp(1 - broken * 0.35, 0, 1);
    this.parts = { service, clean, dishes, decor, repair };
    let t = 0;
    for (const k in RATING_WEIGHTS) t += RATING_WEIGHTS[k] * this.parts[k];
    this.target = clamp(t * 5 + 0.35, 0, 5);
  }

  update(dt) {
    this.t += dt;
    if (this.t >= 1) { this.t = 0; this.recompute(); }
    const st = this.game.state;
    st.rating += (this.target - st.rating) * Math.min(1, dt * 0.007);
    st.rating = clamp(st.rating, 0, 5);
  }
}
