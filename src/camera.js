// Camera: world space = isometric screen pixels at zoom 1. Drag to pan, wheel to zoom, clamped to room bounds.
import { clamp } from './util.js';
import { ISO } from './iso.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 0.9;
    this.minZoom = 0.4; this.maxZoom = 2;
    this.vw = 800; this.vh = 600;
    this.bounds = { x0: -500, y0: -300, x1: 500, y1: 600 };
  }
  setViewport(w, h) { this.vw = w; this.vh = h; this.clamp(); }
  setRoom(size) {
    this.bounds = { x0: -size * ISO.hw, x1: size * ISO.hw, y0: -ISO.wallH * 0.6, y1: size * ISO.th };
    this.clamp();
  }
  /** Fit the room to the viewport (leaving room for HUD bars). */
  fit(size) {
    const w = size * ISO.tw + 120, h = size * ISO.th + ISO.wallH + 140;
    this.zoom = clamp(Math.min(this.vw / w, (this.vh - 150) / h), this.minZoom, 1.25);
    this.x = 0;
    this.y = (size * ISO.th - ISO.wallH) / 2 + 20;
    this.clamp();
  }
  toWorld(sx, sy) { return { x: (sx - this.vw / 2) / this.zoom + this.x, y: (sy - this.vh / 2) / this.zoom + this.y }; }
  toView(wx, wy) { return { x: (wx - this.x) * this.zoom + this.vw / 2, y: (wy - this.y) * this.zoom + this.vh / 2 }; }
  pan(dx, dy) { this.x -= dx / this.zoom; this.y -= dy / this.zoom; this.clamp(); }
  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x; this.y += before.y - after.y;
    this.clamp();
  }
  clamp() {
    const b = this.bounds;
    this.x = clamp(this.x, b.x0, b.x1);
    this.y = clamp(this.y, b.y0, b.y1);
  }
}
