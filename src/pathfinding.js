// A* on the 4-connected tile grid. Walls/furniture are impassable; other agents add soft cost
// (so paths route around them when possible) but never hard-block, which keeps the crowd deadlock-free.
import { DIRS } from './iso.js';
import { tileKey } from './util.js';

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * @param goals array of {x,y}; the path ends at whichever is cheapest.
 * @param opts.goalOk allow goal tiles that are not walkable (e.g. stepping into a chair)
 * @param opts.cost (x,y) => extra cost for entering a tile (agent avoidance)
 * @returns array of tiles (excluding start) or null when unreachable. [] when already at a goal.
 */
export function findPath(world, sx, sy, goals, opts = {}) {
  if (!Array.isArray(goals)) goals = [goals];
  goals = goals.filter((g) => world.inBounds(g.x, g.y) && (opts.goalOk || world.isWalkable(g.x, g.y) || (g.x === sx && g.y === sy)));
  if (!goals.length) return null;
  const goalSet = new Set(goals.map((g) => tileKey(g.x, g.y)));
  if (goalSet.has(tileKey(sx, sy))) return [];
  const h = (x, y) => { let m = 1e9; for (const g of goals) m = Math.min(m, Math.abs(g.x - x) + Math.abs(g.y - y)); return m; };
  const open = new Heap();
  const gScore = new Map();
  const came = new Map();
  const sk = tileKey(sx, sy);
  gScore.set(sk, 0);
  open.push({ x: sx, y: sy, g: 0, f: h(sx, sy), k: sk });
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.g > (gScore.get(cur.k) ?? Infinity)) continue;
    if (goalSet.has(cur.k)) {
      const path = [];
      let k = cur.k;
      while (k !== sk) { path.push({ x: Math.floor(k / 1000), y: k % 1000 }); k = came.get(k); }
      return path.reverse();
    }
    if (++expanded > 4000) break;
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if (!world.inBounds(nx, ny)) continue;
      const nk = tileKey(nx, ny);
      const walk = world.isWalkable(nx, ny);
      if (!walk && !(opts.goalOk && goalSet.has(nk))) continue;
      // don't path *through* the goal-only tiles, and never through the entry when not needed? (entry is walkable)
      const g = cur.g + 1 + (opts.cost ? opts.cost(nx, ny) : 0) + (i !== cur.d ? 0.01 : 0);
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        came.set(nk, cur.k);
        open.push({ x: nx, y: ny, g, f: g + h(nx, ny), k: nk, d: i });
      }
    }
  }
  return null;
}
