// Pointer, wheel and keyboard input for the world canvas.
import { toGrid } from './iso.js';
import { audio } from './audio.js';

export function setupInput(game, canvas, ui, debug) {
  const cam = game.camera;
  let down = null; // {x, y, moved, button}
  const pointers = new Map();
  let pinch = null;

  const tileAt = (vx, vy) => { const w = cam.toWorld(vx, vy); const g = toGrid(w.x, w.y); return { x: Math.floor(g.x), y: Math.floor(g.y) }; };
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.zoom };
      down = null;
      return;
    }
    down = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, button: e.button };
    if (e.button === 2 && game.build.active) { game.build.escape() || game.build.setTool(null); return; }
    const b = game.build;
    if (b.active && b.tool && b.tool.mode === 'floor' && e.button === 0) {
      b.painting = true;
      const t = tileAt(p.x, p.y); b.click(t.x, t.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoomAt((pinch.z * d) / pinch.d / cam.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const b = game.build;
    if (b.active) {
      const t = tileAt(p.x, p.y);
      if (!b.hoverTile || b.hoverTile.x !== t.x || b.hoverTile.y !== t.y) {
        b.hover(t.x, t.y);
        if (b.painting) b.click(t.x, t.y);
      }
    }
    if (!down || b.painting) return;
    if (!down.moved && Math.hypot(p.x - down.sx, p.y - down.sy) > 6) { down.moved = true; canvas.classList.add('dragging'); }
    if (down.moved) { cam.pan(p.x - down.x, p.y - down.y); down.x = p.x; down.y = p.y; }
  });
  const up = (e) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    canvas.classList.remove('dragging');
    const b = game.build;
    if (b.painting) { b.painting = false; down = null; return; }
    if (down && !down.moved && down.button === 0) {
      if (b.active) {
        const t = tileAt(p.x, p.y);
        b.click(t.x, t.y);
      } else {
        const a = game.renderer.pickAgent(p.x, p.y);
        ui.select(a);
        if (a) game.sfx('click');
        else {
          const t = tileAt(p.x, p.y);
          if (game.renderer.plotIndexAt(t.x, t.y) >= 0) { game.sfx('click'); ui.openPanel('garden'); }
        }
      }
    }
    down = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const b = game.build;
    if (e.key === '`' || e.key === '~') { debug.toggle(); debug.rerender(); e.preventDefault(); return; }
    if (e.key === 'Escape') {
      if (b.active) { if (!b.escape()) b.exit(); return; }
      if (ui.modalOpen) return;
      if (game.selected) { game.selected = null; return; }
      if (ui.panel) ui.closePanel();
      return;
    }
    if (e.key === 'b' || e.key === 'B') { ui.onTool('build'); return; }
    if (b.active) {
      if (e.key === 'r' || e.key === 'R') b.rotate();
      if ((e.key === 'Delete' || e.key === 'Backspace') && b.selected) b.sellSelected();
      if ((e.key === 'm' || e.key === 'M') && b.selected) b.startMove();
    }
  });
}
