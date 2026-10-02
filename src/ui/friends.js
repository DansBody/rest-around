// The Friends panel (see ONLINE.md "好友與互動"): your profile card and friend code, adding a friend by
// code, invites in and out, and the friend list with its hearts and what is left to do for each today.
// Everything comes from the server (`friends`, `profile_set`, `friend_*` ops); the panel keeps the last
// answer in ui.friends and refreshes it whenever it is opened or changed.
import { h } from '../util.js';
import { cloud } from '../cloud.js';
import { t } from '../i18n.js';
import { portrait } from '../portrait.js';
import { assets } from '../assets.js';
import { UNIQUE_NAMES, snackById } from '../data.js';
import { AVATAR, FRIENDS } from '../social.js';
import { gl, glyph } from './icons.js';
import { confirmBtn } from './panels.js';
import { linkButtons } from './account.js';
import { startVisit } from './visit.js';

const STALE = 20000;   // ms before the list is fetched again when the panel is drawn

/** "Friends dropped by": who helped and how, one block per friend. `list` is the help the server just merged into the save. */
export function helpedCard(ui, list) {
  const by = new Map();
  for (const d of list) { const k = d.from || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
  const line = (icon, ...kids) => h('div.helped-line', icon, h('span', ...kids));
  const blocks = [...by].map(([from, ds]) => {
    const lines = [];
    const litter = ds.filter((d) => d.kind === 'clean').reduce((a, d) => a + (d.n || 0), 0);
    if (litter) lines.push(line(glyph('sparkles', 18), t('Picked up {n} pieces of litter', { n: litter })));
    for (const d of ds.filter((x) => x.kind === 'snack' && snackById[x.snack])) {
      const sn = snackById[d.snack];
      lines.push(line(assets.iconEl(sn.asset, 20), d.staff
        ? t('Gave {staff} a {snack} (+{n} energy)', { staff: UNIQUE_NAMES[d.staff] || d.staff, snack: sn.name, n: d.energy })
        : t('Left a {snack} in your pantry', { snack: sn.name })));
    }
    const items = {};
    for (const d of ds.filter((x) => x.kind === 'gift')) for (const [id, n] of Object.entries(d.items || {})) items[id] = (items[id] || 0) + n;
    if (Object.keys(items).length) lines.push(line(glyph('gift', 18), t('Brought'), ' ', ...Object.entries(items).map(([id, n]) => h('span.ing', assets.iconEl('ing_' + id, 18), '×' + n))));
    return h('div.helped-block', h('b', from || t('A friend')), ...lines);
  });
  return h('div.card.helped',
    h('div.hero-ico', assets.iconEl('emote_heart', 56)),
    h('div.big-title', t('Friends dropped by')),
    h('div.muted', t('Your friends lent a hand at {cafe}:', { cafe: ui.game.state.name })),
    ...blocks,
    h('button.btn.primary', { onclick: () => ui.closeModal() }, t('Thank you!')));
}

/** A player's face: one of our characters on a coloured disc. */
export function avatarEl(avatar, size = 48) {
  const a = avatar && AVATAR.models.includes(avatar.model) ? avatar : { model: AVATAR.models[0], bg: AVATAR.bgs[0] };
  const pic = portrait({ model: a.model, hide: [], tint: null, scale: 1, roleHat: null }, size, size, 'avatar-img');
  return h('div.avatar', { style: { width: size + 'px', height: size + 'px', background: a.bg } }, pic);
}
/** 1–5 hearts, the earned ones filled. */
export function heartsEl(n) {
  return h('span.hearts', { title: t('Friendship {n}/5', { n }) }, Array.from({ length: 5 }, (_, i) => glyph('heart', 14, 'ico glyph' + (i < n ? '' : ' off'))));
}
const fmtCode = (c) => (c || '').replace(/^(.{4})(.{4})$/, '$1-$2');

/** What is left to do for a friend today, as short phrases (empty when nothing is). */
export function leftText(left) {
  const l = left || {};
  return [l.clean && t('litter ×{n}', { n: l.clean }), l.snack && t('snacks ×{n}', { n: l.snack }), l.gift && t('gifts ×{n}', { n: l.gift })].filter(Boolean);
}

export function errText(e) {
  return ({
    code: t('No café has that friend code.'), self: t('That is your own friend code!'),
    full: t('Your friend list is full ({n} at most).', { n: FRIENDS.max }), their_full: t('Their friend list is full.'),
    link: t('Link an account first to add friends.'), invite: t('That invite is gone.'), friend: t('You are not friends any more.'),
    avatar: t('Pick one of the characters.'), offline: t('Could not reach the server, try again.'),
    save: t('Their café could not be opened.'),
    // helping (social.js planHelp)
    limit: t("That's all of this kind of help for today. Come back tomorrow 💗"), nothing: t('Their café is already spotless!'),
    have: t('Your pantry does not have that any more.'), staff: t('That staff member is not at their café any more.'),
    snack: t('Pick one of the snacks.'), items: t('Pick at least one ingredient.'), session: t('Your café was opened on another device, so it was closed here.'),
  })[e] || t('Something went wrong: {msg}', { msg: e });
}

async function load(ui) {
  const st = ui.friends;
  if (st.loading) return;
  st.loading = true;
  const r = await cloud.api('friends');
  st.loading = false;
  if (r.status === 200) { st.data = r.body; st.at = Date.now(); st.error = ''; }
  else st.error = r.body.error || 'offline';
  if (ui.panel === 'friends') ui.renderPanel();
}
/** Run a friends call, say how it went, and fetch the list again. */
async function act(ui, op, body, done) {
  const r = await cloud.api(op, body);
  if (r.status !== 200) { ui.toast(errText(r.body.error || 'offline'), 'bad'); return null; }
  if (done) done(r.body);
  ui.friends.at = 0;
  load(ui);
  return r.body;
}

export function renderFriends(ui, body) {
  ui.friends = ui.friends || { data: null, at: 0, loading: false, error: '' };
  const st = ui.friends;
  if (!cloud.user) { body.append(h('div.muted', t('Friends need the server: this café is playing offline right now.'))); return; }
  if (ui.subview && ui.subview.profile) return renderProfile(ui, body);
  if (!st.data || Date.now() - st.at > STALE) load(ui);
  if (!st.data) { body.append(h('div.muted', st.error ? errText(st.error) : t('Loading…'))); return; }
  const d = st.data, me = d.me;

  // ----- you
  body.append(
    h('div.row.me-card', avatarEl(me.avatar, 56),
      h('div.grow', h('h3', me.name || ui.game.state.name), h('div.muted', `${me.cafe || ui.game.state.name} · ${t('Lv {n}', { n: me.level })}`)),
      h('button.btn.small', { onclick: () => { ui.subview = { profile: true }; ui.renderPanel(); } }, t('Edit'))),
    h('div.orow', h('span', t('Friend code')), h('div.code-row',
      h('b.friend-code', fmtCode(me.code)),
      h('button.btn.small', { title: t('Copy'), onclick: async () => {
        try { await navigator.clipboard.writeText(fmtCode(me.code)); ui.toast(t('Friend code copied!'), 'good'); } catch { ui.toast(fmtCode(me.code)); }
      } }, gl('copy', t('Copy'), 15)))));

  // ----- add a friend
  body.append(h('div.section-title', t('Add a friend')));
  if (!d.linked) {
    body.append(h('div.away-note.warn', t('Link an account first to add friends: friendships stay with the account.')), linkButtons(ui));
  } else {
    const code = h('input', { type: 'text', placeholder: 'XXXX-XXXX', maxlength: 9, autocomplete: 'off', style: { textTransform: 'uppercase' } });
    const send = async () => {
      if (!code.value.trim()) return;
      await act(ui, 'friend_add', { code: code.value }, (b) => ui.toast(
        b.status === 'accepted' ? t('You are friends now! 💗') : b.status === 'already' ? t('You are already friends.') : t('Invite sent! It shows up once they accept.'), 'good'));
    };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    body.append(h('div.code-row', code, h('button.btn.primary.small', { onclick: send }, t('Send invite'))));
  }

  // ----- invites
  const person = (f, ...actions) => h('div.row', avatarEl(f.avatar, 44),
    h('div.grow', h('h3', f.name || t('A friend')), h('div.muted', `${f.cafe} · ${t('Lv {n}', { n: f.level })}`)), ...actions);
  if (d.incoming.length) {
    body.append(h('div.section-title', t('Invites')));
    for (const f of d.incoming) body.append(person(f,
      h('button.btn.small.primary', { onclick: () => act(ui, 'friend_accept', { id: f.id }, () => ui.toast(t('You are friends now! 💗'), 'good')) }, t('Accept')),
      h('button.btn.small', { onclick: () => act(ui, 'friend_remove', { id: f.id }) }, t('Decline'))));
  }
  if (d.outgoing.length) {
    body.append(h('div.section-title', t('Sent invites')));
    for (const f of d.outgoing) body.append(person(f, h('button.btn.small', { onclick: () => act(ui, 'friend_remove', { id: f.id }) }, t('Cancel'))));
  }

  // ----- friends
  body.append(h('div.section-title', t('Friends ({n}/{m})', { n: d.friends.length, m: d.max })));
  if (!d.friends.length) body.append(h('div.muted', t('No friends yet. Share your friend code to invite someone!')));
  for (const f of d.friends.sort((a, b) => b.points - a.points)) {
    const left = leftText(f.left);
    body.append(h('div.row.friend', avatarEl(f.avatar, 48),
      h('div.grow',
        h('h3', f.name || t('A friend'), ' ', heartsEl(f.hearts)),
        h('div.muted', `${f.cafe} · ${t('Lv {n}', { n: f.level })}`),
        h('div.muted.small', left.length ? t('You can still help today: {what}', { what: left.join(' · ') }) : t('You helped as much as you can today 💗'))),
      h('div.friend-actions',
        h('button.btn.small.primary', { onclick: () => startVisit(ui, f) }, t('Visit')),
        confirmBtn('button.btn.small', '✕', t('Remove?'), () => act(ui, 'friend_remove', { id: f.id })))));
  }
}

// ---------------- your profile ----------------
function renderProfile(ui, body) {
  const me = ui.friends.data.me;
  const draft = ui.subview.draft || (ui.subview.draft = { nickname: me.nickname || '', avatar: { ...(me.avatar || { model: AVATAR.models[0], bg: AVATAR.bgs[0] }) } });
  const nick = h('input', { type: 'text', value: draft.nickname, maxlength: AVATAR.nickMax, placeholder: me.cafe || ui.game.state.name });
  nick.addEventListener('input', () => { draft.nickname = nick.value; });
  const back = () => { ui.subview = null; ui.renderPanel(); };
  body.append(
    h('div.btnrow', { style: { marginBottom: '6px' } }, h('button.btn.small', { onclick: back }, gl('back', t('Back'), 14)), h('b', { style: { alignSelf: 'center' } }, t('Your profile'))),
    h('div', { style: { display: 'flex', justifyContent: 'center', margin: '6px 0 10px' } }, avatarEl(draft.avatar, 112)),
    h('div.section-title', t('Nickname')), nick,
    h('div.muted.small', { style: { marginTop: '4px' } }, t('Shown to your friends. Leave it empty to show the café name.')),
    h('div.section-title', t('Character')),
    h('div.avatar-pick', AVATAR.models.map((m) => h('button.avatar-opt' + (draft.avatar.model === m ? '.on' : ''), { title: UNIQUE_NAMES[m], onclick: () => { draft.avatar.model = m; ui.renderPanel(); } }, avatarEl({ model: m, bg: draft.avatar.bg }, 52)))),
    h('div.section-title', t('Background')),
    h('div.swatches', AVATAR.bgs.map((c) => h('div.sw' + (draft.avatar.bg === c ? '.on' : ''), { style: { background: c }, onclick: () => { draft.avatar.bg = c; ui.renderPanel(); } }))),
    h('button.btn.primary', { style: { width: '100%', marginTop: '16px' }, onclick: () => act(ui, 'profile_set', { nickname: draft.nickname, avatar: draft.avatar }, (b) => {
      ui.friends.data.me = b.me;
      ui.toast(t('Profile saved!'), 'good');
      ui.subview = null; ui.renderPanel();
    }) }, t('Save')));
}
