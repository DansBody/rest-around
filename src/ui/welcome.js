// The start screen (see ONLINE.md "帳號與登入"): shown once the loading bar is full, only when this browser
// has no signed-in player yet. The big button starts as a guest straight away (an anonymous player, linkable
// later from Settings); below it, a player who already has a café signs in with Google or an email and goes
// straight back to it, instead of opening an empty café first. It lives in the loading card, so loading and
// choosing read as one screen.
import { h } from '../util.js';
import { cloud } from '../cloud.js';
import { t } from '../i18n.js';
import { glyph } from './icons.js';
import { errText } from './account.js';

/**
 * Ask how to start. Resolves when the player went in as a guest or signed in by email; signing in with
 * Google leaves the page (and comes back signed in, so this is not shown again).
 * @param loading  the #loading screen
 * @param o        { hasLocal: a café is saved in this browser, error: how a trip to Google went wrong }
 */
export function chooseStart(loading, o = {}) {
  const card = loading.querySelector('.load-card');
  const keep = [...card.querySelectorAll('.load-bar, .load-msg')];
  for (const el of keep) el.hidden = true;
  const pane = h('div.start-pane');
  const show = (...kids) => pane.replaceChildren(...kids.filter(Boolean));
  card.appendChild(pane);
  loading.classList.add('choosing');

  return new Promise((resolve) => {
    const done = () => {
      loading.classList.remove('choosing');
      pane.remove();
      for (const el of keep) el.hidden = false;
      resolve();
    };
    const busy = (b, label) => { b.disabled = true; b.classList.add('busy'); if (label) b.lastChild.textContent = label; };

    const main = (error = '') => {
      const google = h('button.btn.start-google', {
        onclick: async () => {
          busy(google, t('Opening Google…'));
          try { await cloud.startGoogle(); } catch (e) { main(errText(e)); }
        },
      }, googleMark(), h('span', t('Continue with Google')));
      show(
        h('button.btn.primary.start-guest', { onclick: done }, h('span', t('Open my café'))),
        h('div.start-or', h('span', t('Already have a café?'))),
        google,
        h('button.btn.start-email', { onclick: () => emailForm() }, glyph('mail', 18), h('span', t('Sign in with email'))),
        error ? h('div.start-err', error) : null,
        h('div.start-note', o.hasLocal
          ? t('This device has a café that is not linked to an account. Open my café carries on with it; signing in opens the café in your account instead.')
          : t('Starting as a guest? You can link an account any time in Settings, and keep your progress.')));
    };

    const emailForm = (msg = '') => {
      const email = h('input', { type: 'email', placeholder: t('Email'), autocomplete: 'email', required: true });
      const pw = h('input', { type: 'password', placeholder: t('Password'), autocomplete: 'current-password', required: true });
      const err = h('div.start-err');
      const go = h('button.btn.primary', { type: 'submit' }, h('span', t('Sign in')));
      const f = h('form.start-form', email, pw, err, go);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(go);
        try { await cloud.startEmail(email.value.trim(), pw.value); done(); }
        catch (x) { err.textContent = errText(x); go.disabled = false; go.classList.remove('busy'); }
      });
      show(
        h('div.start-head', h('button.btn.small.start-back', { type: 'button', onclick: () => main(), 'aria-label': t('Back') }, glyph('back', 16)), h('b', t('Sign in with email'))),
        f,
        msg ? h('div.start-note', msg) : null,
        h('button.linkish', { type: 'button', onclick: async () => {
          const v = email.value.trim();
          if (!v) { err.textContent = t('Enter your email first.'); email.focus(); return; }
          try { await cloud.sendPasswordReset(v); emailForm(t('A reset link is on its way to {email}.', { email: v })); }
          catch (x) { err.textContent = errText(x); }
        } }, t('Forgot password?')));
      email.focus();
    };

    main(o.error ? errText({ message: o.error }) : '');
  });
}

/** Google's "G", in its own colours (the sign-in button guidelines ask for it). */
function googleMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/>'
    + '<path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/>'
    + '<path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z"/>'
    + '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/>';
  return svg;
}
