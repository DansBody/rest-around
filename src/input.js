// Mouse, touch and keyboard input for the 3D view.
// Left-drag pans (the ground follows the cursor), right-drag rotates, wheel/pinch zooms,
// Q/E rotate in 90deg steps, click picks characters / tiles.
import { audio } from './audio.js';

export function setupInput(game, canvas, ui, debug) {
  const cam = game.camera;
  let down = null;
  const pointers = new Map();
  let pinch = null;
  const R = () => game.renderer;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
      down = null;
      return;
    }
    down = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, button: e.button };
    const b = game.build;
    if (b.active && b.tool && b.tool.mode === 'floor' && e.button === 0) {
      b.painting = true;
      const t = R().pickTile(p.x, p.y); b.click(t.x, t.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      cam.zoomAt(d / pinch.d); pinch.d = d;
      cam.rotateBy(-(ang - pinch.ang)); pinch.ang = ang;
      return;
    }
    const b = game.build;
    if (b.active) {
      const t = R().pickTile(p.x, p.y);
      if (!b.hoverTile || b.hoverTile.x !== t.x || b.hoverTile.y !== t.y) {
        b.hover(t.x, t.y);
        if (b.painting) b.click(t.x, t.y);
      }
    }
    if (!down || b.painting) return;
    if (!down.moved && Math.hypot(p.x - down.sx, p.y - down.sy) > 6) { down.moved = true; canvas.classList.add('dragging'); }
    if (down.moved) {
      if (down.button === 2 || e.shiftKey) cam.rotateBy(-(p.x - down.x) * 0.008);
      else R().panBetween(down.x, down.y, p.x, p.y);
      down.x = p.x; down.y = p.y;
    }
  });
  const up = (e) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    canvas.classList.remove('dragging');
    const b = game.build;
    if (b.painting) { b.painting = false; down = null; return; }
    if (down && !down.moved) {
      if (down.button === 2 && b.active) { if (!b.escape()) b.setTool(null); }
      else if (down.button === 0) {
        if (b.active) { const t = R().pickTile(p.x, p.y); b.click(t.x, t.y); }
        else {
          const a = R().pickAgent(p.x, p.y);
          ui.select(a);
          if (a) game.sfx('click');
          else {
            const t = R().pickTile(p.x, p.y);
            if (R().plotIndexAt(t.x, t.y) >= 0) { game.sfx('click'); ui.openPanel('garden'); }
          }
        }
      }
    }
    down = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoomAt(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

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
    if (e.key === 'q' || e.key === 'Q') { cam.rotate(-1); return; }
    if (e.key === 'e' || e.key === 'E') { cam.rotate(1); return; }
    if (e.key === 'b' || e.key === 'B') { ui.onTool('build'); return; }
    if (b.active) {
      if (e.key === 'r' || e.key === 'R') b.rotate();
      if ((e.key === 'Delete' || e.key === 'Backspace') && b.selected) b.sellSelected();
      if ((e.key === 'm' || e.key === 'M') && b.selected) b.startMove();
    }
  });
}
