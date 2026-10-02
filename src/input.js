// Mouse, touch and keyboard input for the 3D view.
// Left-drag pans (the ground follows the cursor), right-drag rotates, wheel zooms, two fingers pinch,
// twist and slide like a map,
// Q/E rotate in 90deg steps, click picks characters / tiles. While visiting a friend the camera moves
// around their café (the one the renderer shows) and a tap on their staff or litter offers to help.
import { audio } from './audio.js';
import { endVisit, visitTap } from './ui/visit.js';

const PINCH_TURN = 0.17;   // radians (~10°) of twist before a two-finger gesture starts rotating

export function setupInput(game, canvas, ui, debug) {
  const shown = () => (game.renderer ? game.renderer.game : game);
  const visiting = () => shown() !== game;
  const cam = { zoomAt: (k) => shown().camera.zoomAt(k), rotateBy: (a) => shown().camera.rotateBy(a), rotate: (d) => shown().camera.rotate(d) };
  let down = null;
  const pointers = new Map();
  let pinch = null;
  const R = () => game.renderer;
  const twoFingers = (a, b) => ({ d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    game.touchMode = e.pointerType !== 'mouse';
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { ...twoFingers(a, b), turn: 0, turning: false };
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
      // like a map: the floor between the fingers stays under them while they pinch, twist and slide
      const [a, b] = [...pointers.values()];
      const now = twoFingers(a, b), held = R().groundAt(pinch.mx, pinch.my);
      let turn = now.ang - pinch.ang;
      turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;   // atan2 wraps at ±180°
      // a pinch is never perfectly straight: only start turning once the fingers clearly twist
      if (!pinch.turning) { pinch.turn += turn; pinch.turning = Math.abs(pinch.turn) > PINCH_TURN; turn = 0; }
      shown().camera.zoomNow(now.d / pinch.d);
      if (turn) cam.rotateBy(turn);   // the room turns the same way as the fingers
      R().keepUnder(held, now.mx, now.my);
      Object.assign(pinch, now);
      return;
    }
    const b = game.build;
    // a finger has no hover: on touch the ghost only jumps to where you tap, so panning doesn't drag it along
    if (b.active && e.pointerType === 'mouse' && !down && b.wallMode()) b.hoverWallAt(R().pickWall(p.x, p.y));
    else if (b.active && ((e.pointerType === 'mouse' && !down) || b.painting)) {
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
        if (b.active && b.wallMode()) b.tapWall(R().pickWall(p.x, p.y));
        else if (b.active) {
          // nothing in hand: a hung wall piece under the pointer wins over the floor behind it
          const wid = !b.placing() && !b.tool ? R().pickWallDecor(p.x, p.y) : null;
          if (wid) { b.selectWall(wid); down = null; return; }
          const t = R().pickTile(p.x, p.y);
          // placing: the first click/tap pins the item there, a second one on the same spot (or ✓) places it
          if (b.placing()) b.tapPreview(t.x, t.y);
          else b.click(t.x, t.y);
        }
        else if (visiting()) visitTap(ui, R(), p.x, p.y);   // help out: their staff, their litter
        else {
          const a = R().pickAgent(p.x, p.y);
          ui.select(a);
          if (a) game.sfx('click');
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
      if (visiting() && !ui.modalOpen) { endVisit(ui); return; }
      if (b.active) { if (!b.escape()) b.exit(); return; }
      if (ui.modalOpen) return;
      if (game.selected) { game.selected = null; return; }
      if (ui.panel) ui.closePanel();
      return;
    }
    if (e.key === 'q' || e.key === 'Q') { cam.rotate(-1); return; }
    if (e.key === 'e' || e.key === 'E') { cam.rotate(1); return; }
    if (visiting()) return;
    if (e.key === 'b' || e.key === 'B') { ui.onTool('build'); return; }
    if (b.active) {
      if (e.key === 'r' || e.key === 'R') b.rotate();
      if ((e.key === 'Delete' || e.key === 'Backspace') && b.selected) b.sellSelected();
      if ((e.key === 'Delete' || e.key === 'Backspace') && b.selectedWall) b.sellSelectedWall();
      if ((e.key === 'm' || e.key === 'M') && b.selectedWall) b.startMoveWall();
      if ((e.key === 'm' || e.key === 'M') && b.selected) b.startMove();
    }
  });
}
