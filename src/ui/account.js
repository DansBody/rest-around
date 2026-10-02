// The player's account: the Account section in Settings, the link / sign-in cards, and what to say when the
// player comes back from Google or an email link (see cloud.js and ONLINE.md "帳號與登入").
//
// Most players start anonymous (the start screen in welcome.js offers signing in first, but never requires
// it): Settings always offers linking (with a warning while unlinked), and reaching level 3 asks once. Linking keeps the same account, so the café stays
// put; signing in to an account that already has a café leaves this device's unlinked one behind, which is
// said plainly before it happens.
import { h, bus } from '../util.js';
import { cloud } from '../cloud.js';
import { t } from '../i18n.js';
import { confirmBtn } from './panels.js';

const PROMPTED = 'refillit.linkPrompted';
const MIN_PASSWORD = 8;

function card(title, text, ...kids) {
  return h('div.card', h('div.big-title', title), text ? h('div.muted', text) : null, ...kids);
}
export function errText(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/invalid login credentials/i.test(m)) return t('Wrong email or password.');
  if (/rate limit|too many/i.test(m)) return t('Too many tries, please wait a minute and try again.');
  if (/password/i.test(m) && /(weak|short|least)/i.test(m)) return t('Pick a longer password (at least {n} characters).', { n: MIN_PASSWORD });
  return t('Something went wrong: {msg}', { msg: m });
}
/** A form whose submit button shows progress and errors in place. */
function form(fields, label, onSubmit) {
  const err = h('div.err');
  const btn = h('button.btn.primary', { type: 'submit' }, label);
  const f = h('form.account-form', ...fields, err, btn);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = ''; btn.disabled = true;
    try { await onSubmit(err); } catch (x) { console.warn(x); err.textContent = errText(x); } finally { btn.disabled = false; }
  });
  return f;
}
const input = (type, placeholder, value = '') => h('input', { type, placeholder, value, autocomplete: type === 'password' ? 'new-password' : 'email', required: true });

// ---------------- cards ----------------
function linkEmailCard(ui) {
  const email = input('email', t('Email'));
  return card(t('Link with email'), t('We will send a link to this address. Open it to finish linking, then choose a password.'),
    form([email], t('Send link'), async (err) => {
      const r = await cloud.linkEmail(email.value.trim());
      if (r === 'taken') { ui.closeModal(); ui.queueModal(() => takenCard(ui, 'email', email.value.trim())); return; }
      ui.closeModal();
      ui.queueModal(() => card(t('Check your inbox'), t('A link is on its way to {email}. Open it on this device to finish linking.', { email: email.value.trim() }),
        h('button.btn.primary', { onclick: () => ui.closeModal() }, t('OK'))));
      if (ui.panel === 'settings') ui.renderPanel();
    }),
    h('button.linkish', { onclick: () => ui.closeModal() }, t('Cancel')));
}

/** That Google account / email already belongs to another player: offer to open that café instead. */
function takenCard(ui, kind, email = '') {
  const text = kind === 'google' ? t('This Google account already has a café of its own.') : t('{email} already has a café of its own.', { email });
  return card(t('Already in use'), text,
    h('div.away-note.warn', t('You can sign in to it instead, but the café on this device is not linked and will be left behind.')),
    h('div.account-links',
      h('button.btn.primary', { onclick: () => { ui.closeModal(); if (kind === 'google') cloud.signInGoogle(ui.game).catch((e) => ui.toast(errText(e), 'bad')); else ui.queueModal(() => signInCard(ui, email)); } }, t('Sign in to that account')),
      h('button.btn', { onclick: () => ui.closeModal() }, t('Keep this café'))));
}

function signInCard(ui, prefill = '') {
  const email = input('email', t('Email'), prefill), pw = input('password', t('Password'));
  pw.autocomplete = 'current-password';
  return card(t('Sign in'), t('Open the café saved in your account.'),
    !cloud.linked ? h('div.away-note.warn', t('The café on this device is not linked and will be left behind.')) : null,
    h('div.account-links', h('button.btn', { onclick: () => cloud.signInGoogle(ui.game).catch((e) => ui.toast(errText(e), 'bad')) }, t('Continue with Google'))),
    form([email, pw], t('Sign in with email'), async () => { await cloud.signInEmail(ui.game, email.value.trim(), pw.value); }),
    h('button.linkish', { onclick: () => { ui.closeModal(); ui.queueModal(() => forgotCard(ui, email.value.trim())); } }, t('Forgot password?')),
    h('button.linkish', { onclick: () => ui.closeModal() }, t('Cancel')));
}

function forgotCard(ui, prefill = '') {
  const email = input('email', t('Email'), prefill);
  return card(t('Reset password'), t('We will email you a link to choose a new password.'),
    form([email], t('Send link'), async () => {
      await cloud.sendPasswordReset(email.value.trim());
      ui.closeModal();
      ui.toast(t('A reset link is on its way to {email}.', { email: email.value.trim() }), 'good');
    }),
    h('button.linkish', { onclick: () => ui.closeModal() }, t('Cancel')));
}

/** Choose a password: after confirming a linked email ('set') or from a reset link ('reset'). */
function passwordCard(ui, mode) {
  const pw = input('password', t('New password')), pw2 = input('password', t('Repeat password'));
  return card(mode === 'reset' ? t('Choose a new password') : t('Email confirmed!'),
    mode === 'reset' ? '' : t('One last step: choose a password so you can sign in on another device.'),
    form([pw, pw2], t('Save password'), async (err) => {
      if (pw.value.length < MIN_PASSWORD) { err.textContent = t('Pick a longer password (at least {n} characters).', { n: MIN_PASSWORD }); return; }
      if (pw.value !== pw2.value) { err.textContent = t('The passwords do not match.'); return; }
      await cloud.setPassword(pw.value);
      ui.closeModal();
      ui.toast(t('Password saved. Your café is linked to {email}.', { email: cloud.email }), 'good');
      if (ui.panel === 'settings') ui.renderPanel();
    }),
    mode === 'reset' ? null : h('button.linkish', { onclick: () => ui.closeModal() }, t('Later')));
}

function linkPromptCard(ui) {
  return card(t('Keep your café safe'), t('Link an account so your café is never lost, and carry on on any device.'),
    linkButtons(ui, true),
    h('button.linkish', { onclick: () => ui.closeModal() }, t('Later')));
}

export function linkButtons(ui, inModal = false) {
  return h('div.account-links',
    h('button.btn.primary', { onclick: () => { if (inModal) ui.closeModal(); cloud.linkGoogle(ui.game).catch((e) => ui.toast(errText(e), 'bad')); } }, t('Link with Google')),
    h('button.btn', { onclick: () => { if (inModal) ui.closeModal(); ui.queueModal(() => linkEmailCard(ui)); } }, t('Link with email')));
}

// ---------------- the Settings section ----------------
export function accountSection(ui) {
  const out = [h('div.section-title', t('Account'))];
  if (!cloud.user) {
    out.push(h('div.muted', t('Not connected to the server: this café is only on this device for now.')));
    return out;
  }
  if (cloud.linked) {
    const via = [cloud.email, cloud.hasProvider('google') ? 'Google' : ''].filter(Boolean).join(' · ');
    out.push(h('div.away-note', t('Linked: {via}', { via })));
    const row = h('div.btnrow');
    if (cloud.needsPassword) row.append(h('button.btn.small', { onclick: () => ui.queueModal(() => passwordCard(ui, 'set')) }, t('Choose a password')));
    if (!cloud.hasProvider('google')) row.append(h('button.btn.small', { onclick: () => cloud.linkGoogle(ui.game).catch((e) => ui.toast(errText(e), 'bad')) }, t('Link with Google')));
    row.append(confirmBtn('button.btn.small', t('Sign out'), t('Tap again to sign out'), () => cloud.signOut(ui.game)));
    out.push(row);
    return out;
  }
  if (cloud.pendingEmail) out.push(h('div.away-note', t('A link was sent to {email}: open it to finish linking.', { email: cloud.pendingEmail })));
  out.push(h('div.away-note.warn', t('This café is not linked to an account yet: clearing the browser data or changing devices would lose it.')));
  out.push(linkButtons(ui));
  out.push(h('button.linkish', { onclick: () => ui.queueModal(() => signInCard(ui)) }, t('Already have an account? Sign in')));
  return out;
}

// ---------------- after boot ----------------
/** Wire the account into the UI, and say how a trip to Google or an email link went. */
export function initAccount(ui) {
  cloud.onAccount = () => { if (ui.panel === 'settings') ui.renderPanel(); };
  bus.on('levelUp', (e) => {
    if (e.level < 3 || !cloud.online || cloud.linked) return;
    try { if (localStorage.getItem(PROMPTED)) return; localStorage.setItem(PROMPTED, '1'); } catch { return; }
    ui.queueModal(() => linkPromptCard(ui));
  });

  const r = cloud.returned || {};
  if (r.errorCode === 'identity_already_exists' || /already (linked|exists|in use|been)/i.test(r.error)) ui.queueModal(() => takenCard(ui, 'google'));
  else if (r.error) ui.toast(errText({ message: r.error }), 'bad');
  else if (r.type === 'recovery') ui.queueModal(() => passwordCard(ui, 'reset'));
  else if (cloud.linked && cloud.needsPassword) ui.queueModal(() => passwordCard(ui, 'set'));
  else if (r.came && cloud.linked) ui.toast(t('Linked! Your café is safe in your account.'), 'good');
}
