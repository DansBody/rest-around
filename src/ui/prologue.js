// The prologue (opening-premise): a newcomer steps off the last bus into a city with no colour. A figure under a
// street lamp (the city's first colourist, never named here) hands over the last cup of colour it could make, says
// "Refill it." and leaves a palette: a centre well with a little colour left and eight empty wells, one per street
// lot (street.js, palette.js). Then the grey passers-by (tutorial.js pickCard) and the tour.
// Staged in 2D over the café as Refillit OS collage: the grey halftone street, the colourist as the one denim
// cut-out, the grey hand with the cup, a real porcelain palette as a sticker. All of it black and white until the cup
// is drunk; then the street fills in with faded colour, and only the colourist's denim is strong. A tap moves the story
// on (and finishes a line still typing); Skip ends it at once. Seen once per browser (localStorage): a reload before a partner is picked goes
// straight to the passers-by, and Reset game (panels.js) forgets it, so a new café starts with the story again.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';

const SEEN = 'refillit.prologue';
export function prologueSeen() { try { return localStorage.getItem(SEEN) === '1'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN, '1'); } catch { /* private mode: it just plays again */ } }
/** A reset café starts from the story again. */
export function forgetPrologue() { try { localStorage.removeItem(SEEN); } catch { /* nothing kept */ } }

const quiet = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const OUT = 'cubic-bezier(.2,.8,.3,1)', IN = 'cubic-bezier(.6,0,.8,.3)';
const TYPE_MS = 45;   // per character of a line
const STOP = Symbol('skipped');

/**
 * Play the prologue over the game. Resolves when it is over (watched or skipped); the game is held meanwhile.
 * @param game the Game (held while the story plays)
 */
export function playPrologue(game) {
  const still = quiet();
  const colour = h('i.pr-col');   // the same street in faded colour, under the halftone print
  const print = h('i.pr-ht');      // the grey halftone, which thins out as the colour comes in
  const paint = h('i.pr-paint');   // a real watercolour bloom spreading over it: the colour comes in where it has run
  const street = h('div.pr-street', colour, paint, print);
  const rain = h('div.pr-rain');
  const figure = h('div.pr-figure');
  // the cup's steam: a real wisp of steam (a see-through halftone piece), a few copies rising in turn behind the arm
  const hand = h('div.pr-hand', h('div.pr-steam', [0, 1, 2].map((i) => h('i', { style: { '--i': i } }))), h('i.pr-arm'));
  const pal = h('div.pr-palette', h('i.pr-glow'));
  const title = h('div.pr-title');
  const who = h('b.pr-who');
  const text = h('span.pr-text');
  const more = h('i.pr-more', '▼');
  const line = h('div.pr-line', who, text, more);
  const skip = h('button.pr-skip', t('Skip'));
  // the browser only plays sound after a tap: when nothing has had one yet, the story starts with one
  const start = audio.ctx && audio.ctx.state === 'running' ? null : h('div.pr-start', h('span', t('Tap to begin')));
  const root = h('div#prologue.bw', street, rain, figure, hand, pal, title, line, skip, start);   // black and white till the cup
  document.body.appendChild(root);
  const held = game.hold;
  game.hold = true;
  audio.prefetch('night');   // the rainy set, decoded while the screen comes up
  audio.setScene('night', true);

  let skipped = false, wake = null, onSkip;
  const skipP = new Promise((res) => { onSkip = res; });
  const guard = (p) => Promise.race([p, skipP]).then((v) => { if (skipped) throw STOP; return v; });
  const tap = () => guard(new Promise((res) => { wake = res; }));
  const wait = (ms) => guard(new Promise((res) => setTimeout(res, still ? Math.min(ms, 200) : ms)));
  const anim = (el, frames, o) => el.animate(frames, { fill: 'both', easing: OUT, ...o, duration: still ? 1 : o.duration, delay: still ? 0 : o.delay || 0 });
  root.addEventListener('pointerdown', () => audio.unlock());   // a tap is what lets the browser play the rain
  root.addEventListener('click', (e) => { if (e.target === skip) return; if (wake) { const w = wake; wake = null; w(); } });
  skip.addEventListener('click', () => { skipped = true; onSkip(); });

  /** A line at the foot: who says it (null: narration), typed out; a tap finishes it, the next tap moves on. */
  async function say(words, speaker = null) {
    who.textContent = speaker || '';
    line.classList.toggle('narr', !speaker);
    line.classList.add('show');
    more.style.visibility = 'hidden';
    const chars = [...words];
    let n = still ? chars.length : 0, typing;
    text.textContent = chars.slice(0, n).join('');
    const full = () => { clearInterval(typing); n = chars.length; text.textContent = words; };
    if (n < chars.length) {
      const done = new Promise((res) => {
        typing = setInterval(() => { n++; text.textContent = chars.slice(0, n).join(''); if (n >= chars.length) { clearInterval(typing); res(); } }, TYPE_MS);
      });
      await Promise.race([done, tap()]).finally(full);
    }
    more.style.visibility = 'visible';
    await tap();
    line.classList.remove('show');
  }

  const story = async () => {
    const FIG = t('Someone under the lamp');
    if (start) {   // the tap that lets the rain play
      await tap();
      await guard(start.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 500, fill: 'forwards' }).finished);
      start.remove();
    }
    // 1. the last bus, rain, a grey street
    anim(street, [{ opacity: 0, transform: 'scale(1.18) translateX(-3%)' }, { opacity: 1, transform: 'scale(1.06) translateX(0)' }], { duration: 2600, easing: 'ease-out' });
    anim(rain, [{ opacity: 0 }, { opacity: 1 }], { duration: 1800, delay: 400 });
    await wait(1400);
    title.textContent = t('This city has no colour.');
    anim(title, [{ transform: 'translate(-120%, 0) skewX(-8deg)' }, { transform: 'translate(4%, 0) skewX(-8deg)', offset: 0.75 }, { transform: 'translate(0, 0) skewX(-8deg)' }], { duration: 700 });
    await wait(700);
    await say(t('You came in on the last bus of the night. Everything here is the colour of rain.'));
    anim(title, [{ opacity: 1 }, { opacity: 0, transform: 'translate(0, -30px) skewX(-8deg)' }], { duration: 400, easing: IN });
    // 2. the figure under the lamp
    anim(street, [{ transform: 'scale(1.06)' }, { transform: 'scale(1.16) translateX(-6%)' }], { duration: 2400, easing: 'ease-in-out' });
    anim(figure, [{ opacity: 0, transform: 'translateX(30%) rotate(3deg)' }, { opacity: 1, transform: 'translateX(-2%) rotate(-1deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 900 });
    await wait(1900);
    await say(t('Oh. You can still see it, can\'t you? The colour.'), FIG);
    await say(t('Here. The last cup I could make. Go on, while it\'s warm.'), FIG);
    // 3. the cup, held out, steaming
    anim(hand, [{ transform: 'translate(60%, -70%) rotate(8deg)' }, { transform: 'translate(-2%, 2%) rotate(-2deg)', offset: 0.8 }, { transform: 'none' }], { duration: 1200, easing: OUT });
    hand.classList.add('on');
    await wait(1300);
    await say(t('(Tap to drink.)'));
    // drinking: the cup comes up close, and a bloom of watercolour runs out from the middle of the view: where it has
    // spread, the street is in (faded) colour; the paint itself thins away as it goes
    anim(hand, [{ transform: 'none', opacity: 1 }, { transform: 'translate(-10%, 10%) scale(2.2)', opacity: 0 }], { duration: 700, easing: IN });
    root.classList.add('drunk');
    root.classList.remove('bw');   // the colour comes in, and with it the colourist's own
    const RUN = { duration: 4500, delay: 350, easing: 'cubic-bezier(.5,.05,.35,1)' };   // a drop that gathers, runs, then slows
    const size = (k) => `${k}% auto`;
    const spread = anim(colour, [{ maskSize: size(3), webkitMaskSize: size(3) }, { maskSize: size(430), webkitMaskSize: size(430) }], RUN);
    anim(paint, [{ backgroundSize: size(3), opacity: 0.95 }, { opacity: 0.8, offset: 0.4 }, { backgroundSize: size(430), opacity: 0 }], RUN);
    anim(print, [{ opacity: 1 }, { opacity: 0.42 }], RUN);
    spread.finished.then(() => { spread.cancel(); colour.classList.add('full'); }).catch(() => {});   // no mask edge left over
    await wait(2200);
    await say(t('Warm, bitter, then sweet. The street fills in with colour, faded, like an old photograph.'));
    // 4. "Refill it." (the game's name: said as it is, in every language) and the palette
    await say('Refill it.', FIG);
    anim(pal, [{ transform: 'translate(-50%, 120%) rotate(-30deg)' }, { transform: 'translate(-50%, -4%) rotate(4deg)', offset: 0.75 }, { transform: 'translate(-50%, 0) rotate(0)' }], { duration: 1000 });
    pal.classList.add('on');
    await wait(1100);
    await say(t('This palette held every colour on this street once. I let it run dry.'), FIG);
    await say(t('Eight wells, one for each corner of the street. Fill them again, and I\'ll come back.'), FIG);
    // 5. the figure goes, torn away in slices; the centre well is all that is left
    figure.classList.add('gone');
    anim(figure, [{ opacity: 1, clipPath: 'inset(0 0 0 0)' }, { opacity: 0, clipPath: 'inset(0 0 100% 0)' }], { duration: 900, easing: IN });
    await wait(1000);
    pal.classList.add('centre');
    await say(t('The centre well still holds a little colour. Enough for one small café.'));
    // the centre well opens over everything, and the café is behind it
    const dive = h('div.pr-dive');
    root.appendChild(dive);
    await guard(anim(dive, [{ clipPath: 'circle(0% at 50% 62%)' }, { clipPath: 'circle(150% at 50% 62%)' }], { duration: 900, easing: IN }).finished);
  };

  return story().catch((e) => { if (e !== STOP) console.warn('Prologue', e); }).then(async () => {
    markSeen();
    audio.setScene(null);
    game.hold = held;
    if (game.renderer && game.renderer.popCart) game.renderer.popCart();   // the centre well lands: up pops the cart
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 1 : 500, fill: 'forwards' });
    await a.finished.catch(() => {});
    root.remove();
  });
}
