// The first cup (design/prologue/OPENING_PLAN.md, step 2): straight after the prologue, under the same rain. Someone
// in a hood runs in under the cart's awning, umbrella dripping, the colour of the street: no face, no telling who.
// The player brews them a cup on the counter (brew3d.js, with no result card: the cup goes straight over), they drink,
// and the hood tears away like the colourist did, showing who it was, in colour. It can't fail: the colour always
// comes back, and the score only changes what they say (a bitter or sour cup is "...but warm", and a pointer to the
// recipe card). They remember working in a café once and stay; the player names and dresses them in the paper doll and
// they start as the partner (game.setStarter). Who it is is picked at random from the cast before anything is shown,
// leaving out the player's own species (the puddle, prologue.js dressSelf, once that picks one).
// Skipped at any point, they start anyway, undressed and with their own name. This cup is the colourist's gift, not
// one of the free fan pour-overs.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { portrait } from '../portrait.js';
import { roleLook, withDress } from '../looks.js';
import { UNIQUE_MODELS, starterRole } from '../data.js';
import { defaultName } from '../staff.js';
import { collageStage, tearPaper } from './prologue.js';
import { openBrew3d } from './brew3d.js';
import { openPaperDoll } from './paperdoll.js';

/** Who comes in out of the rain: anyone of the cast but the player's own species. */
export function pickPasserBy(game) {
  const own = game.state.self && game.state.self.model;   // TODO paper-doll self: set by the puddle (prologue.js dressSelf)
  const pool = UNIQUE_MODELS.filter((m) => m !== own);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** What they say about the cup, by brew.js's verdict: never a complaint, at most "...but warm". */
function tasteLine(verdict) {
  switch (verdict) {
    case 'bitter': return t('A little bitter... but warm.');
    case 'sour': return t('A little sour... but warm.');
    case 'uneven': return t('A little uneven... but warm.');
    default: return t('Oh. That\'s good. Really good.');
  }
}

/**
 * Play the first cup over the game; resolves once the partner has started (watched, or skipped).
 * @param game the Game (held while it plays)
 */
export function playFirstCup(game) {
  const model = pickPasserBy(game);
  const look0 = roleLook(starterRole(model), model);
  let name = '', coat = {};
  // the street as the prologue left it: in faded colour, the cart in its own, its sign lit and its things out
  const street = h('div.pr-street.fc-on', h('i.pr-col.full'), h('i.pr-ht.fc-faded'));
  const rain = h('div.pr-rain.fc-on');
  const cart = h('div.pr-cart.fc-on', h('i.pr-cart-grey'), h('i.pr-cart-col.full'), h('i.pr-sign.fc-lit', h('span', 'Refillit')),
    h('div.pr-goods.on', h('i.pr-g.grinder'), h('i.pr-g.scale'), h('i.pr-g.dripper'), h('i.pr-g.bag', h('i.pr-label')), h('i.pr-g.cup')));
  const passer = h('div.fc-passer');   // the hooded cut-out, grey
  const guest = h('div.fc-guest');     // who it was, in colour, behind the hood
  const bloom = h('i.fc-bloom');       // the colour running back into them
  const stage = collageStage(game, [street, rain, cart, guest, bloom, passer], '.firstcup');
  const { root, wait, anim, done, say, guard } = stage;
  audio.setScene('night', true);   // (still raining from the prologue; set again for a reload straight into this)
  /** The collage steps aside while a screen of its own is up (the brew, the paper doll sit under it). */
  // (display, not visibility: the cart's things are made visible on their own and would show through)
  const away = async (p) => { root.style.display = 'none'; try { return await guard(p); } finally { root.style.display = ''; } };

  const story = async () => {
    const HOOD = t('Someone in a hood');
    await stage.begin();
    anim(street, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' });
    anim(cart, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' });
    anim(rain, [{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
    await wait(900);
    await say(t('The rain comes down harder. Footsteps splash up the street, in a hurry.'));
    // in they run from the right, a little bob to each step, and stop under the awning, shaking the umbrella
    await done(anim(passer, [{ opacity: 1, transform: 'translateX(70vw)' }, { transform: 'translateX(45vw) translateY(-2%)', offset: 0.25 }, { transform: 'translateX(26vw)', offset: 0.5 },
      { transform: 'translateX(9vw) translateY(-2%)', offset: 0.75 }, { opacity: 1, transform: 'none' }], { duration: 1500, easing: 'linear' }));
    await done(anim(passer, [{ transform: 'none' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'none' }], { duration: 500, easing: 'ease-in-out' }));
    await say(t('Someone ducks in under the awning, hood pulled low, the colour of the street. You can\'t tell who it is.'));
    await say(t('...Are you open? Anything warm would do.'), HOOD);
    await say(t('(The note on the counter: brew it for whoever comes in out of the rain.)'));
    // the cup, on the counter in 3D; no result card: it goes straight over
    const cup = await away(openBrew3d(game, { guest: HOOD, handOff: true }));
    // they drink, and the colour runs back into them; the hood tears away like paper
    await say(t('They wrap both hands round the cup and drink.'));
    await say(tasteLine(cup.verdict), HOOD);
    if (cup.verdict !== 'balanced') await say(t('(The recipe card on the counter says how. Next time.)'));
    await done(anim(bloom, [{ opacity: 0, transform: 'scale(.1)' }, { opacity: 0.9, transform: 'scale(1)', offset: 0.6 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 1600, easing: 'ease-out' }));
    guest.replaceChildren(portrait(look0, guest.clientWidth || 260, guest.clientWidth || 260, 'fc-art'));   // (not .portrait: no card behind it)
    guest.classList.add('on');
    await tearPaper(stage, passer, "url('assets/ui/collage/passerby.webp')", guest);
    await done(anim(guest, [{ transform: 'scale(.92)', filter: 'grayscale(1) brightness(1.2)' }, { transform: 'scale(1.06)', filter: 'grayscale(0) brightness(1.25)', offset: 0.6 }, { transform: 'none', filter: 'none' }], { duration: 1200, easing: 'ease-out' }));
    const WHO = defaultName(model);
    await say(t('The colour comes back into them: it\'s {name}!', { name: WHO }));
    await say(t('...Warm. I remember now. I worked in a café, once.'), WHO);
    await say(t('This cart could use a pair of hands. I\'ll stay and help.'), WHO);
    // the player names them and dresses them
    const res = await away(openPaperDoll(game, { look: look0, name: '' }));
    if (res) {
      const { model: m, scale, ...d } = res.look;   // only the dress: the role sets the rest
      coat = d;
      name = res.name || '';
    }
  };

  return stage.run(story).then(() => {
    audio.setScene(null);
    game.setStarter(model, name, coat);
  });
}
