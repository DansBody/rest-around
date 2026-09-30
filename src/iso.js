// Isometric 2:1 dimetric projection. Tile size comes from the manifest (grid.tileW/tileH).
// Grid space: tile (i,j) covers [i,i+1] x [j,j+1]. +x runs down-right on screen, +y runs down-left.
export const ISO = { tw: 128, th: 64, hw: 64, hh: 32, wallH: 192 };

export function configureIso(grid) {
  ISO.tw = grid.tileW; ISO.th = grid.tileH; ISO.hw = grid.tileW / 2; ISO.hh = grid.tileH / 2; ISO.wallH = grid.wallHeight;
}

export function toScreen(x, y) {
  return { x: (x - y) * ISO.hw, y: (x + y) * ISO.hh };
}
export function toGrid(sx, sy) {
  const a = sx / ISO.hw, b = sy / ISO.hh;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// Facing directions. Art is drawn for fl and bl; fr and br are mirrors.
// index: 0 = +x (fr), 1 = +y (fl), 2 = -x (bl), 3 = -y (br)
export const DIRS = [
  { dx: 1, dy: 0, face: 'fr' },
  { dx: 0, dy: 1, face: 'fl' },
  { dx: -1, dy: 0, face: 'bl' },
  { dx: 0, dy: -1, face: 'br' },
];
export function dirFromDelta(dx, dy, fallback = 1) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy > 0 ? 1 : 3;
}
export const opposite = (d) => (d + 2) % 4;
