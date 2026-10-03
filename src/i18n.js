// Tiny i18n: English source strings are the keys; `t('Hello {name}', { name })` looks the string
// up in the active language and fills in {placeholders}. Game data names (dishes, furniture…) are
// localized in place by localizeData(). The chosen language is remembered in localStorage.
import { DISHES, DISH_CATS, INGREDIENTS, SNACKS, FURNITURE, FLOORS, WALLS, WALL_DECOR, ROLES, DAY, SKILL, ABILITIES, KIT_TEXT, CLUB_TEXT, WEAR } from './data.js';
import { ZH_TW } from './lang/zh-TW.js';

export const LANGS = { en: 'English', 'zh-TW': '繁體中文' };
const DICTS = { 'zh-TW': ZH_TW };
const KEY = 'rest-around-lang';

function initial() {
  try { const v = localStorage.getItem(KEY); if (v && LANGS[v]) return v; } catch { /* storage blocked */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language]).join(',')) || '';
  return /\bzh\b|zh-/i.test(nav) ? 'zh-TW' : 'en';
}

let lang = initial();
/** Strings looked up but not translated (checked by the automated test). */
export const missing = new Set();

export function getLang() { return lang; }
export function setLang(l) {
  if (!LANGS[l]) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  localizeData();
}

export function t(s, vars) {
  let out = s;
  if (lang !== 'en') {
    const d = DICTS[lang];
    if (d && Object.prototype.hasOwnProperty.call(d, s)) out = d[s];
    else if (s) missing.add(s);
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return out;
}

/** Translate stored English text (tasks, moods) only if a translation exists. */
export function tt(s) { return lang === 'en' || !s ? s : (DICTS[lang][s] ?? s); }

/** Localize names/descriptions baked into the game data (keeps the English originals). */
export function localizeData() {
  const list = [...DISHES, ...DISH_CATS, ...INGREDIENTS, ...SNACKS, ...FURNITURE, ...FLOORS, ...WALLS, ...WALL_DECOR, ...Object.values(ROLES), ...DAY.phases, ...Object.values(ABILITIES), ...KIT_TEXT, ...CLUB_TEXT, ...WEAR];
  for (const o of list) {
    if (o.nameEn == null) o.nameEn = o.name;
    o.name = t(o.nameEn);
    if (o.desc != null) { if (o.descEn == null) o.descEn = o.desc; o.desc = t(o.descEn); }
    if (o.skill != null) { if (o.skillEn == null) o.skillEn = o.skill; o.skill = t(o.skillEn); }   // a club's skill name
  }
  if (!SKILL.titlesEn) SKILL.titlesEn = [...SKILL.titles];
  SKILL.titles.splice(0, SKILL.titles.length, ...SKILL.titlesEn.map((x) => t(x)));
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant-TW';
}

/** "{title} {role}" — e.g. "Skilled Chef" / "熟練廚師". */
export function titledRole(title, role) { return t('{title} {role}', { title, role }); }
