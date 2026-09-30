// Orbit camera for the 3D view: drag to pan, wheel/pinch to zoom, right-drag or Q/E to rotate.
// Rotation eases between steps; target is clamped to the room + its surroundings.
import { clamp } from './util.js';

const TILE = 2;

export class Camera {
  constructor() {
    this.tx = 8; this.tz = 8;             // look-at point on the ground (world units)
    this.yaw = Math.PI / 4;               // 45deg: classic isometric-ish corner view
    this.yawTarget = this.yaw;
    this.pitch = 0.66;                    // ~38deg above the horizon
    this.dist = 34; this.distTarget = 34;
    this.fov = 30;
    this.minDist = 12; this.maxDist = 80;
    this.vw = 800; this.vh = 600;
    this.bounds = { x0: -12, x1: 30, z0: -8, z1: 30 };
    this.room = 8;
  }
  setViewport(w, h) { this.vw = w; this.vh = h; }
  setRoom(size) {
    this.room = size;
    const n = size * TILE;
    this.bounds = { x0: -10, x1: n + 8, z0: -6, z1: n + 8 };
    this.clamp();
  }
  fit(size) {
    const n = size * TILE;
    this.tx = n / 2; this.tz = n / 2;
    const aspect = this.vw / Math.max(1, this.vh);
    // distance so the room's diagonal fits the view
    const need = n * 1.45 / Math.min(1, aspect * 0.9);
    this.dist = this.distTarget = clamp(need / (2 * Math.tan((this.fov * Math.PI) / 360)), this.minDist, this.maxDist);
    this.clamp();
  }
  /** world units per screen pixel at the target distance */
  unitsPerPx() { return (2 * this.dist * Math.tan((this.fov * Math.PI) / 360)) / Math.max(1, this.vh); }
  pan(dx, dy) {
    const u = this.unitsPerPx();
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // screen right = (cos, -sin); screen "up" on the ground = (-sin, -cos) (away from camera)
    this.tx -= (dx * cy + dy * sy / Math.sin(this.pitch)) * u;
    this.tz -= (-dx * sy + dy * cy / Math.sin(this.pitch)) * u;
    this.clamp();
  }
  zoomAt(factor) {
    this.distTarget = clamp(this.distTarget / factor, this.minDist, this.maxDist);
  }
  rotate(steps) { this.yawTarget += (steps * Math.PI) / 2; }
  rotateBy(rad) { this.yawTarget += rad; this.yaw += rad; }
  clamp() {
    const b = this.bounds;
    this.tx = clamp(this.tx, b.x0, b.x1);
    this.tz = clamp(this.tz, b.z0, b.z1);
  }
  update(dt) {
    const k = Math.min(1, dt * 8);
    this.yaw += (this.yawTarget - this.yaw) * k;
    this.dist += (this.distTarget - this.dist) * k;
  }
  /** Camera position in world space. */
  position() {
    const cp = Math.cos(this.pitch);
    return { x: this.tx + Math.sin(this.yaw) * cp * this.dist, y: Math.sin(this.pitch) * this.dist, z: this.tz + Math.cos(this.yaw) * cp * this.dist };
  }
  /** Horizontal direction from the room toward the camera (unit vector). */
  viewDir() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  // zoom-ish scalar for overlay sizes (1 at the default distance)
  get zoom() { return clamp(34 / this.dist, 0.55, 1.6); }
}
