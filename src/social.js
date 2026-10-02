// Friends helping friends (see ONLINE.md "好友與互動"): the rules both the game and the server use.
//
// A visitor can pick up a friend's litter, feed one of their staff a snack, or gift ingredients. The
// helper pays for what they give (from their own save, on the server) and earns friendship and a few
// café points, never coins. The help lands in the friend's inbox and is merged into their save at their
// next heartbeat or login (`applyDeliveries`), so a friend who is playing at that very moment loses nothing.
//
// Pure, like offline.js: plain JSON in and out, runs in the browser and in the Edge Function.
import { snackById, ingById, UNIQUE_MODELS } from './data.js';

export const FRIENDS = {
  max: 50,                          // friends (and open invites) per player
  hearts: [0, 10, 30, 60, 100],     // friendship points needed for 1..5 hearts
  // per friend per day, by hearts (index 0 = 1 heart)
  daily: { clean: [1, 1, 2, 2, 3], snack: [1, 2, 2, 3, 3], gift: [2, 4, 6, 8, 10] },
  cleanPerVisit: 3,                 // litter one clean-up picks up
  friendship: { clean: 1, snack: 2, gift: 1 },   // per action (a gift counts once however many items)
  helperPoints: 3,                  // café points the helper earns per action
};
export const HELP_KINDS = ['clean', 'snack', 'gift'];

/** What a player shows on friend lists: a nickname and one of our own characters on a coloured disc. */
export const AVATAR = {
  models: UNIQUE_MODELS,
  bgs: ['#f6d7c3', '#f9c6d0', '#fde3a7', '#c9e8d4', '#c6dcf2', '#ddd0f0', '#e8e2d8', '#3a3a44'],
  nickMax: 16,
};
/** A clean nickname: trimmed, no control characters, at most AVATAR.nickMax characters. */
export const cleanNick = (s) => Array.from(String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, AVATAR.nickMax).join('').trim();
export const validAvatar = (a) => !!a && AVATAR.models.includes(a.model) && AVATAR.bgs.includes(a.bg);

export const heartsFor = (points) => { let h = 1; while (h < FRIENDS.hearts.length && points >= FRIENDS.hearts[h]) h++; return h; };
/** What is left today for `kind` toward one friend: `used` is how much was already done today (gift: items). */
export const leftToday = (kind, hearts, used) => Math.max(0, FRIENDS.daily[kind][hearts - 1] - (used || 0));

/** Litter in a save: the pieces on the floor plus what piled up unseen while it was closed. */
export const trashIn = (d) => ((d.world && d.world.trash) || []).length + ((d.world && d.world.extraTrash) || 0);

/**
 * Check a help request against the helper's own save and take what it costs.
 * @param helper  the helper's last accepted save (not modified)
 * @param target  the friend's last accepted save (read only: is there anything to clean, is the staff there)
 * @param req     { kind, snack?, staff?, items? }
 * @param used    how much of `kind` was already done today toward this friend
 * @returns { error } or { data: helper save after paying, payload: what goes in the friend's inbox, amount }
 */
export function planHelp(helper, target, req, hearts, used) {
  const kind = req && req.kind;
  if (!HELP_KINDS.includes(kind)) return { error: 'kind' };
  const left = leftToday(kind, hearts, used);
  if (left <= 0) return { error: 'limit' };
  const out = JSON.parse(JSON.stringify(helper));
  const st = out.state;
  let payload, amount = 1;
  if (kind === 'clean') {
    const n = Math.min(FRIENDS.cleanPerVisit, trashIn(target));
    if (!n) return { error: 'nothing' };
    payload = { n };
  } else if (kind === 'snack') {
    const sn = snackById[req.snack];
    if (!sn) return { error: 'snack' };
    if (!((st.snacks || {})[sn.id] >= 1)) return { error: 'have' };
    const staff = (target.staff || []).find((s) => s.look && s.look.model === req.staff);
    if (!staff) return { error: 'staff' };
    st.snacks[sn.id] -= 1;
    if (!st.snacks[sn.id]) delete st.snacks[sn.id];
    payload = { snack: sn.id, staff: req.staff, energy: sn.energy };
  } else {
    const items = {};
    for (const [id, n] of Object.entries(req.items || {})) {
      const k = Math.floor(Number(n));
      if (!ingById[id] || !(k > 0)) continue;
      items[id] = k;
    }
    amount = Object.values(items).reduce((a, b) => a + b, 0);
    if (!amount) return { error: 'items' };
    if (amount > left) return { error: 'limit' };
    for (const [id, k] of Object.entries(items)) {
      if (!(((st.inv || {})[id] || 0) >= k)) return { error: 'have' };
      st.inv[id] -= k;
      if (!st.inv[id]) delete st.inv[id];
    }
    payload = { items };
  }
  st.points = (st.points || 0) + FRIENDS.helperPoints;
  return { data: out, payload, amount };
}

/**
 * Merge a friend's help into a save.
 * @param deliveries  [{ id, kind, payload, from_name }]
 * @returns { data, applied: [{ id, kind, from, ...what it did }] }
 */
export function applyDeliveries(save, deliveries) {
  const out = JSON.parse(JSON.stringify(save));
  const st = out.state, w = out.world;
  const applied = [];
  for (const d of deliveries || []) {
    const p = d.payload || {}, from = d.from_name || '';
    if (d.kind === 'clean') {
      let n = Math.max(0, Math.floor(p.n || 0)), took = 0;
      const extra = Math.min(n, w.extraTrash || 0);
      w.extraTrash = (w.extraTrash || 0) - extra; n -= extra; took += extra;
      const floor = Math.min(n, (w.trash || []).length);
      w.trash = (w.trash || []).slice(floor); took += floor;
      applied.push({ id: d.id, kind: 'clean', from, n: took });
    } else if (d.kind === 'snack') {
      const s = (out.staff || []).find((x) => x.look && x.look.model === p.staff);
      if (s) { s.energy = Math.min(100, (s.energy || 0) + (p.energy || 0)); applied.push({ id: d.id, kind: 'snack', from, snack: p.snack, staff: p.staff, energy: p.energy }); }
      else {   // that staff member has left: the snack goes in the pantry instead
        st.snacks = st.snacks || {}; st.snacks[p.snack] = (st.snacks[p.snack] || 0) + 1;
        applied.push({ id: d.id, kind: 'snack', from, snack: p.snack, staff: null });
      }
    } else if (d.kind === 'gift') {
      st.inv = st.inv || {};
      for (const [id, n] of Object.entries(p.items || {})) if (ingById[id]) st.inv[id] = (st.inv[id] || 0) + n;
      applied.push({ id: d.id, kind: 'gift', from, items: p.items || {} });
    }
  }
  return { data: out, applied };
}
