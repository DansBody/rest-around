// Today's specials (今日特色) — a roguelite layer on the day's trading, behind a debug switch while it is tried out.
// Every calendar day is a "run": the first round of the day draws a theme (rain, market day, exam week…) and every
// round the player is there for opens with a pick of one card out of three. Picked cards stack until midnight,
// so a day builds its own style (a rainy day with a hot-chocolate special and a reading corner trades very
// differently from a market day with a takeaway window and a happy hour).
//
// Cards only turn knobs the café already has, so they can later be modelled by offline.js and allowed for by the
// server's cap check: arrivals, prices, what guests order, bakes, tips, how long guests stay (and whether they
// order a second round), litter, patience, staff energy and speed, and how fast the rating moves.
// Offers are seeded by (café, day, round) so a server could tell a real pick from a made-up one.
// Not modelled yet: offline.js (time away trades without them) and the cap check.
import { dishById, DISH_CATS } from './data.js';
import { localDay, roundOfDay } from './clock.js';

export const SPECIALS_KEY = 'refillit.specials';
export function specialsEnabled() { try { return localStorage.getItem(SPECIALS_KEY) === '1'; } catch { return false; } }
export function setSpecialsEnabled(on) { try { localStorage.setItem(SPECIALS_KEY, on ? '1' : '0'); } catch {} }

/** The day's frame: drawn, not picked. `cats` weights what guests order; `likes` makes some cards come up more. */
export const THEMES = [
  { id: 'rain', icon: '☔', name: 'Rainy day', desc: 'Fewer guests, but they linger, tip better and want something warm.',
    fx: { arrivals: 0.8, stay: 1.3, tip: 1.2 }, cats: { coffee: 1.6, tea: 2, cold: 0.35 }, likes: ['featured', 'study', 'books'] },
  { id: 'market', icon: '🎪', name: 'Market day', desc: 'A crowd in a hurry: lots of guests, little patience.',
    fx: { arrivals: 1.35, patience: 0.8, stay: 0.8 }, cats: { cold: 1.6 }, likes: ['takeaway', 'happy', 'staffmeal', 'rush'] },
  { id: 'exams', icon: '📚', name: 'Exam week', desc: 'Students settle in for hours, order again and leave crumbs.',
    fx: { arrivals: 0.9, stay: 1.5, refill: 0.25, trash: 1.4 }, cats: { coffee: 1.5 }, likes: ['study', 'cups', 'loyalty', 'teaset'] },
];
export const themeById = Object.fromEntries(THEMES.map((x) => [x.id, x]));

/** The cards. `dish: true` names one of the menu's dishes when it is offered; `needs: 'bakery'` only with bakes on. */
export const SPECIALS = [
  { id: 'featured', icon: '☕', name: 'Special of the day', desc: '{dish}: +40% price, ordered three times as often.', dish: true },
  { id: 'takeaway', icon: '🥡', name: 'Takeaway window', desc: '+30% guests. They eat quickly, leave no litter and tip less.', fx: { arrivals: 1.3, stay: 0.5, trash: 0, tip: 0.6 } },
  { id: 'teaset', icon: '🍰', name: 'Afternoon tea set', desc: 'Nearly every guest adds a bake.', needs: 'bakery', fx: { bake: 0.95 } },
  { id: 'happy', icon: '🎉', name: 'Happy hour', desc: 'Prices −20%, guests +40%.', fx: { priceAll: 0.8, arrivals: 1.4 } },
  { id: 'study', icon: '🛋️', name: 'Reading corner', desc: 'Guests stay 60% longer, and 30% order a second round.', fx: { stay: 1.6, refill: 0.3 } },
  { id: 'staffmeal', icon: '🍱', name: 'Staff meal', desc: 'The team tires 30% slower.', fx: { energy: 0.7 } },
  { id: 'influencer', icon: '📸', name: 'Influencer visit', desc: 'The rating moves twice as fast — up or down.', fx: { ratingSpeed: 2 } },
  { id: 'smile', icon: '😊', name: 'Service with a smile', desc: 'Tips +50%.', fx: { tip: 1.5 } },
  { id: 'books', icon: '📖', name: 'Free magazines', desc: 'Guests wait 40% longer before they give up.', fx: { patience: 1.4 } },
  { id: 'cups', icon: '♻️', name: 'Bring your own cup', desc: '70% less litter, and tips +10%.', fx: { trash: 0.3, tip: 1.1 } },
  { id: 'loyalty', icon: '🎟️', name: 'Loyalty stamps', desc: '20% of guests order a second round; tips +15%.', fx: { refill: 0.2, tip: 1.15 } },
  { id: 'rush', icon: '⚡', name: 'Espresso rush', desc: 'The team works 20% faster but tires 40% faster.', fx: { staffSpeed: 1.2, energy: 1.4 } },
];
export const specialById = Object.fromEntries(SPECIALS.map((x) => [x.id, x]));

// ------------------------------------------------------------------ seeded picks
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const today = (s) => localDay(Date.now(), s.tz);
const menuOf = (g) => Object.keys(g.state.dishes).filter((id) => g.state.dishes[id].on && dishById[id] && dishById[id].level <= g.state.level);

/** Today's entry, rolled over at midnight: a new theme, no cards. Returns true when it changed. */
export function syncDay(g) {
  const s = g.state, day = today(s);
  if (s.specials && s.specials.day === day) return false;
  const r = rng(hash(`${s.name}|theme|${day}`));
  s.specials = { day, theme: THEMES[Math.floor(r() * THEMES.length)].id, picks: [], offer: null, later: null };
  g._sp = null;
  return true;
}

/** Three different cards for this round (the theme's favourites come up twice as often); the same three every time. */
export function offerFor(g) {
  const s = g.state, sp = s.specials;
  if (sp.offer && sp.offer.round === s.round) return sp.offer.cards;
  const theme = themeById[sp.theme] || THEMES[0];
  const r = rng(hash(`${s.name}|offer|${sp.day}|${s.round}`));
  const menu = menuOf(g);
  const featured = new Set(sp.picks.filter((p) => p.dish).map((p) => p.dish));
  const pool = SPECIALS.filter((c) => {
    if (c.needs === 'bakery' && !g.eco.bakeryReady()) return false;
    if (c.dish) return menu.some((id) => !featured.has(id));
    return true;
  });
  const cards = [];
  while (cards.length < 3 && cards.length < pool.length) {
    const left = pool.filter((c) => !cards.some((x) => x.id === c.id));
    const w = (c) => (theme.likes.includes(c.id) ? 2 : 1);
    let x = r() * left.reduce((a, c) => a + w(c), 0), pick = left[left.length - 1];
    for (const c of left) { x -= w(c); if (x <= 0) { pick = c; break; } }
    const card = { id: pick.id };
    if (pick.dish) { const opts = menu.filter((id) => !featured.has(id)); card.dish = opts[Math.floor(r() * opts.length)]; }
    cards.push(card);
  }
  sp.offer = { round: s.round, cards };
  return cards;
}

/** Is a card waiting to be picked this round? (Only while the café is open, and only once per round.) */
export function pickPending(g) {
  if (!specialsEnabled() || g.visit) return false;
  syncDay(g);
  const s = g.state, sp = s.specials;
  return !g.day.isNight && !sp.picks.some((p) => p.round === s.round);
}

export function choose(g, card) {
  const s = g.state, sp = s.specials;
  if (!card || sp.picks.some((p) => p.round === s.round)) return;
  if (!offerFor(g).some((c) => c.id === card.id && c.dish === card.dish)) return;
  sp.picks.push({ id: card.id, dish: card.dish || null, round: s.round, slot: roundOfDay(s.round) });
  sp.offer = null;
  g._sp = null;
}

// ------------------------------------------------------------------ what the day's cards add up to
const NEUTRAL = Object.freeze({
  on: false, arrivals: 1, priceAll: 1, tip: 1, stay: 1, refill: 0, trash: 1, patience: 1, energy: 1, staffSpeed: 1, ratingSpeed: 1, bake: 0,
  price: () => 1, weight: () => 1,
});

/** The multipliers the simulation reads (game.sp): the theme's, times every card picked today. */
export function specialMods(g) {
  if (!specialsEnabled() || g.visit || !g.state.specials) return NEUTRAL;
  const sp = g.state.specials, theme = themeById[sp.theme];
  const m = { on: true, arrivals: 1, priceAll: 1, tip: 1, stay: 1, refill: 0, trash: 1, patience: 1, energy: 1, staffSpeed: 1, ratingSpeed: 1, bake: 0 };
  const dishPrice = {}, dishWeight = {};
  const add = (fx) => {
    for (const [k, v] of Object.entries(fx || {})) {
      if (k === 'refill') m.refill = Math.min(0.6, m.refill + v);
      else if (k === 'bake') m.bake = Math.max(m.bake, v);
      else m[k] *= v;
    }
  };
  if (theme) add(theme.fx);
  for (const p of sp.picks) {
    const c = specialById[p.id];
    if (!c) continue;
    if (c.dish && p.dish) { dishPrice[p.dish] = (dishPrice[p.dish] || 1) * 1.4; dishWeight[p.dish] = (dishWeight[p.dish] || 1) * 3; }
    add(c.fx);
  }
  const cats = (theme && theme.cats) || {};
  m.price = (id) => m.priceAll * (dishPrice[id] || 1);
  m.weight = (id) => (cats[(dishById[id] || {}).cat] || 1) * (dishWeight[id] || 1);
  return m;
}

/** A dish name for a card's text. */
export const dishName = (id) => (dishById[id] || {}).name || id;
export const catName = (id) => (DISH_CATS.find((c) => c.id === id) || {}).name || id;
