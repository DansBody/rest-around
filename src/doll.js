// Paper-doll characters. Every layer is a separate manifest asset aligned via rig slots; all motion
// (walk bob, squash & stretch, arm swing, sitting, eating, working, napping, hops) is procedural.
import { assets } from './assets.js';
import { clamp } from './util.js';

const TAU = Math.PI * 2;

/**
 * look: { skin, shoe, hair:[style,color], top:[style,color], bottom:[style,color], hat:[style,color]|null }
 * pose: { mode, t, phase, expr, held:{id, dish}, lift, hop, alpha, shake, seed }
 * facing: fl | fr | bl | br.  (x, y) = feet position in world pixels.
 */
export function drawDoll(ctx, look, pose, facing, x, y, scale = 1) {
  const rig = assets.rig;
  const base = facing[0] === 'b' ? 'bl' : 'fl';
  const flip = facing[1] === 'r';
  const S = rig.slots[base];
  const t = pose.t || 0;
  const mode = pose.mode || 'idle';
  const seed = pose.seed || 0;

  // ---------- procedural parameters ----------
  let bob = 0, sx = 1, sy = 1, lean = 0, headTilt = 0, lift = pose.lift || 0;
  let armL = 0.12, armR = -0.12, legLy = 0, legRy = 0, legLx = 0, legRx = 0, legSy = 1;
  let expr = pose.expr || 'neutral';
  const breathe = Math.sin(t * 2.3 + seed) * 0.022;
  sy = 1 + breathe; sx = 1 - breathe * 0.5;

  const walking = pose.moving;
  if (walking) {
    const ph = pose.phase || 0;
    bob = Math.abs(Math.sin(ph)) * 3.5;
    const sq = Math.cos(ph * 2);
    sy = 1 - 0.045 * sq; sx = 1 + 0.035 * sq;
    legLy = -Math.max(0, Math.sin(ph)) * 4; legRy = -Math.max(0, -Math.sin(ph)) * 4;
    legLx = Math.sin(ph) * 1.5; legRx = -Math.sin(ph) * 1.5;
    armL = Math.sin(ph) * 0.55; armR = Math.sin(ph) * 0.55;
    lean = 0.03;
  }
  switch (mode) {
    case 'carry':
      armL = -1.05 + (walking ? Math.sin(pose.phase) * 0.08 : 0); armR = 1.05 - (walking ? Math.sin(pose.phase) * 0.08 : 0);
      break;
    case 'sit':
    case 'eat':
    case 'wait':
      legSy = 0.5; legLy = legRy = -3; armL = 0.35; armR = -0.35;
      if (mode === 'eat') {
        const p = ((t + seed) % 1.3) / 1.3;
        const up = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) : 0;
        armR = -0.35 + up * 2.75;
        headTilt = Math.sin(t * 5) * 0.04;
        expr = up > 0.5 ? 'eating' : (pose.expr || 'happy');
      }
      break;
    case 'cook':
      armL = -0.95 + Math.sin(t * 7) * 0.3; armR = 0.95 + Math.cos(t * 7) * 0.3; headTilt = Math.sin(t * 2) * 0.05;
      break;
    case 'sweep':
      armR = -0.5 + Math.sin(t * 7) * 0.55; armL = -0.6; lean = 0.08;
      break;
    case 'shake':
      armR = -2.3 + Math.sin(t * 22) * 0.25; armL = 0.4; bob += Math.abs(Math.sin(t * 22)) * 1.2;
      break;
    case 'repair':
      armR = -1.5 - Math.abs(Math.sin(t * 9)) * 0.9; armL = -0.5; lean = 0.06;
      break;
    case 'talk':
      armR = -0.9 + Math.sin(t * 6) * 0.2; headTilt = Math.sin(t * 3) * 0.06;
      break;
    case 'play':
      armL = -1.2 + Math.sin(t * 13) * 0.25; armR = 1.2 + Math.cos(t * 11) * 0.25; bob += Math.abs(Math.sin(t * 6)) * 1.5;
      break;
    case 'nap':
      lift -= rig.napDrop || 8; legSy = 0.45; legLy = legRy = -2; armL = 0.5; armR = -0.5;
      headTilt = 0.22 + Math.sin(t * 1.2) * 0.04; sy = 1 + Math.sin(t * 1.2) * 0.035; expr = 'sleepy';
      break;
    default: // idle: look around a little
      headTilt = Math.sin(t * 0.7 + seed * 3) * 0.05;
  }
  // blink (neutral / happy faces only)
  if ((expr === 'neutral') && ((t + seed * 7) % 3.7) < 0.12) expr = 'sleepy';
  if (pose.hop > 0 && pose.hop < 1) {
    const hp = pose.hop;
    lift += Math.sin(hp * Math.PI) * 13;
    const land = hp < 0.15 ? 1 - hp / 0.15 : hp > 0.85 ? (hp - 0.85) / 0.15 : 0;
    sy *= 1 - land * 0.12; sx *= 1 + land * 0.1;
  }
  const shakeX = pose.shake ? Math.sin(t * 45) * 2.2 : 0;

  // ---------- draw ----------
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (pose.alpha != null) ctx.globalAlpha *= clamp(pose.alpha, 0, 1);
  // soft contact shadow (stays on the floor)
  const sh = rig.shadow || [30, 11];
  const shs = 1 - Math.min(0.35, (bob + Math.max(0, lift - (pose.lift || 0))) / 40);
  ctx.fillStyle = 'rgba(70,45,35,0.2)';
  ctx.beginPath(); ctx.ellipse(0, (pose.lift || 0) > 0 ? -(pose.lift || 0) + 2 : 0, sh[0] / 2 * shs, sh[1] / 2 * shs, 0, 0, TAU); ctx.fill();

  ctx.translate(shakeX, -lift - bob);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(lean);
  ctx.scale(sx, sy);

  const fk = flip ? 'fr' : 'fl';
  const baseFacing = base === 'bl' ? (flip ? 'br' : 'bl') : fk;
  const drawPart = (id, slot, o = {}) => {
    const sp = assets.sprite(id, baseFacing);
    if (!sp) return;
    const tint = o.tint && sp.def.tintable ? o.tint : null;
    const img = tint ? assets.tinted(sp, tint) : sp.img;
    const p = typeof slot === 'string' ? S[slot] : slot;
    ctx.save();
    ctx.translate(p[0] + (o.dx || 0), p[1] + (o.dy || 0));
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
    ctx.drawImage(img, -sp.ax, -sp.ay, sp.w, sp.h);
    ctx.restore();
  };
  const hand = (shoulder, ang) => {
    const o = S.handOffset || [0, 19];
    const c = Math.cos(ang), s = Math.sin(ang);
    return [S[shoulder][0] + o[0] * c - o[1] * s, S[shoulder][1] + o[0] * s + o[1] * c];
  };
  const held = pose.held;
  const drawHeld = () => {
    if (!held) return;
    if (held.id === 'held_tray') {
      drawPart('held_tray', 'carry');
      if (held.dish) {
        const sp = assets.sprite(held.dish, 'any');
        if (sp) { ctx.save(); ctx.translate(S.carry[0], S.carry[1]); ctx.scale(0.6, 0.6); if (flip) ctx.scale(-1, 1); ctx.drawImage(sp.img, -sp.ax, -sp.ay, sp.w, sp.h); ctx.restore(); }
      }
    } else {
      drawPart(held.id, hand('shoulderR', armR), { rot: armR * 0.9 });
    }
  };
  const headGroup = (fn) => {
    ctx.save();
    const n = S.neck;
    ctx.translate(n[0], n[1]); ctx.rotate(headTilt); ctx.translate(-n[0], -n[1]);
    fn();
    ctx.restore();
  };

  const order = rig.order[base];
  let inHead = false;
  const headParts = new Set(['head', 'face', 'hair', 'hat']);
  const pending = [];
  const flushHead = () => { if (pending.length) { const list = pending.splice(0); headGroup(() => list.forEach((f) => f())); } };
  for (const part of order) {
    const isHead = headParts.has(part);
    if (!isHead && inHead) { flushHead(); inHead = false; }
    const job = partFn(part);
    if (!job) continue;
    if (isHead) { inHead = true; pending.push(job); } else job();
  }
  flushHead();
  ctx.restore();

  function partFn(part) {
    switch (part) {
      case 'legL': return () => drawPart('char_leg', 'legL', { tint: look.shoe, dx: legLx, dy: legLy, sy: legSy });
      case 'legR': return () => drawPart('char_leg', 'legR', { tint: look.shoe, dx: legRx, dy: legRy, sy: legSy });
      case 'body': return () => drawPart('char_body', 'body', { tint: look.skin });
      case 'bottom': return look.bottom ? () => drawPart('bottom_' + look.bottom[0], 'hip', { tint: look.bottom[1] }) : null;
      case 'top': return look.top ? () => drawPart('top_' + look.top[0], 'body', { tint: look.top[1] }) : null;
      case 'armL': return () => drawPart('char_arm', 'shoulderL', { tint: look.skin, rot: armL });
      case 'armR': return () => drawPart('char_arm', 'shoulderR', { tint: look.skin, rot: armR });
      case 'head': return () => drawPart('char_head', 'neck', { tint: look.skin });
      case 'face': return base === 'fl' ? () => drawPart('face_' + expr, 'face') : null;
      case 'hair': return look.hair ? () => drawPart('hair_' + look.hair[0], 'crown', { tint: look.hair[1] }) : null;
      case 'hat': return look.hat && look.hat[0] ? () => drawPart('hat_' + look.hat[0], 'hatTop', { tint: look.hat[1] }) : null;
      case 'held': return held ? drawHeld : null;
      default: return null;
    }
  }
}

/** Where the emote bubble goes, relative to the feet. */
export function emoteOffset(pose) {
  const s = assets.rig.slots.fl.emote;
  return [s[0], s[1] - (pose.lift || 0) + (pose.mode === 'nap' ? (assets.rig.napDrop || 8) : 0)];
}
