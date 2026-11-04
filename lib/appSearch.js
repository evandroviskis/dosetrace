// "Buscar no DoseTrace" (docs/specs/app-search.md, founder pick B2 2026-11-04): the places of the
// app and the person's records by name. Offline, no AI, no network (logic 1): a fixed catalogue
// (lib/appSearchCatalog.js, D01–D53 of the approved picture) with synonyms in the six languages,
// plus the active protocols and the record names read from the phone (lib/appSearchRecords.js).
//
// Matching (logic 2): accents, case and punctuation ignored; one wrong letter from 4 letters, two
// from 9; a half-typed word matches the start of a word; question words are ignored; every typed
// word must match. Synonyms and titles of all six languages match at once; titles and paths are
// shown in the app language. The search only navigates: nothing here answers, recommends or
// interprets, and no row ever carries a value, unit, date, dose or note (AS-13).
// Pure CommonJS (node --test); Metro imports it fine.
'use strict';
const { CATALOG, SHORTCUTS, GROUP_ORDER, GROUP_TITLE, GROUP_TAB } = require('./appSearchCatalog');

const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const SEP = ' › ';

// Small words and question words of the six languages (the picture's matcher, verbatim).
const STOP = {};
('de do da dos das o a os as e em no na um uma the of an to my la le les el los las du des der die das den und di il lo gli y et mi mis mes mon ma meu minha meus minhas i en con com para por pour per mit onde fica cade como achar encontrar procurar quero where how find is what donde esta encontrar ou est trouver wo ist finden dove trovare ficam sao estao are estan sont sind sono')
  .split(' ').forEach((w) => { STOP[w] = 1; });
const NOISE = { dosetrace: 1 };

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Damerau-Levenshtein (optimal string alignment).
function dl(a, b) {
  const m = a.length, n = b.length, d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function allowed(tok) { return tok.length >= 9 ? 2 : tok.length >= 4 ? 1 : 0; }

// 4 = the whole word, 3 = the start of a word, 1 = within the typo allowance (a half-typed word is
// compared with the same-length start of a word from 6 letters), 0 = no match.
function tokScore(tok, words) {
  let best = 0;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w === tok) return 4;
    if (w.indexOf(tok) === 0 && tok.length >= 2) { best = Math.max(best, 3); continue; }
    const al = allowed(tok);
    if (al && best < 1 && Math.abs(w.length - tok.length) <= al + 3) {
      if (dl(tok, w) <= al || (tok.length >= 6 && dl(tok, w.slice(0, tok.length)) <= al)) best = 1;
    }
  }
  return best;
}

function wordsOf(list) {
  const out = [];
  list.forEach((s) => norm(s).split(' ').forEach((w) => { if (w && !NOISE[w] && !STOP[w]) out.push(w); }));
  return out;
}

function queryTokens(q) {
  return norm(q).split(' ').filter((t) => t && !STOP[t]);
}

// One i18n key in one language: "^key" capitalises the first letter (Today's "Doses"), "{name}"
// is the protocol's or record's name.
function resolveKey(translations, lang, key, name) {
  if (key === '{name}') return name || '';
  const cap = key.charAt(0) === '^';
  const k = cap ? key.slice(1) : key;
  const table = translations[lang] || translations.en || {};
  let v = table[k];
  if (typeof v !== 'string') v = (translations.en || {})[k];
  if (typeof v !== 'string') return '';
  return cap ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

function entryView(e, p) {
  return e.oral && p && p.oral ? { ...e, title: e.oral.title, path: e.oral.path, icon: e.oral.icon, syn: e.oral.syn } : e;
}

// Which places exist right now (logic 5): pending from yesterday, alerts, ended, recently deleted.
function exists(e, flags) {
  if (!e.when) return true;
  return !!(flags && flags[e.when]);
}

// The rows the matcher reads. ctx: { translations, language, protocols, records, flags }
//   protocols: the ACTIVE protocols, [{ id, name, color, oral, names: [the compound's name in each
//              language and its aliases] }]
//   records:   [{ kind: 'marker' | 'vaccine', key, title, words, path: [keys] }] (lib/appSearchRecords)
//   flags:     { pending, alerts, ended, deleted }
function buildPlaceIndex(ctx) {
  const tr = ctx.translations || {};
  const lang = LANGS.includes(ctx.language) ? ctx.language : 'en';
  const protocols = ctx.protocols || [];
  const rows = [];
  CATALOG.forEach((e, idx) => {
    if (!exists(e, ctx.flags)) return;
    if (e.proto || e.per) {
      protocols.forEach((p) => {
        const ev = entryView(e, p);
        const titles = LANGS.map((l) => resolveKey(tr, l, ev.title, p.name));
        let syn = [];
        LANGS.forEach((l) => { syn = syn.concat((ev.syn && ev.syn[l]) || []); });
        const shown = e.proto ? p.name : `${resolveKey(tr, lang, ev.title, p.name)} · ${p.name}`;
        rows.push({
          id: `${e.id}:${p.id}`, entry: e.id, g: e.g, icon: ev.icon, color: e.proto ? p.color || null : null, protocolId: p.id,
          title: shown, path: ev.path.map((k) => resolveKey(tr, lang, k, p.name)).join(SEP), open: e.open, idx,
          proto: !!e.proto, per: !!e.per, need: e.need || null,
          own: e.proto ? [] : wordsOf(titles.concat(syn)),
          titleWords: e.proto ? [] : wordsOf(titles),
          name: wordsOf([p.name].concat(p.names || [])),
          phrases: (e.proto ? [p.name].concat(p.names || []) : titles.map((s) => `${s} ${p.name}`).concat(syn)).map(norm),
        });
      });
      return;
    }
    const titles = LANGS.map((l) => resolveKey(tr, l, e.title));
    let syn = [];
    LANGS.forEach((l) => { syn = syn.concat((e.syn && e.syn[l]) || []); });
    rows.push({
      id: e.id, entry: e.id, g: e.g, icon: e.icon, title: resolveKey(tr, lang, e.title),
      path: e.path.map((k) => resolveKey(tr, lang, k)).join(SEP), open: e.open, idx,
      need: e.need || null, own: wordsOf(titles.concat(syn)), titleWords: wordsOf(titles), name: [],
      phrases: titles.concat(syn).map(norm),
    });
  });
  (ctx.records || []).forEach((r, i) => {
    const names = [r.title].concat(r.words || []);
    rows.push({
      id: `${r.kind}:${r.key}`, entry: r.kind, g: 'body', icon: r.kind === 'vaccine' ? 'shield' : 'lab_frame', title: r.title,
      path: (r.path || []).map((k) => resolveKey(tr, lang, k, r.title)).join(SEP),
      open: { tab: 'Body', target: r.kind, key: r.key }, idx: CATALOG.length + i, record: r.kind,
      need: null, own: wordsOf(names), titleWords: wordsOf(names), name: [], phrases: names.map(norm),
    });
  });
  return { rows, language: lang };
}

// The places and records for a query, best first (AS-4): the group with the best match first, then
// tab order; inside a group the best score, then catalogue order.
function searchPlaces(index, q) {
  const nq = norm(q);
  const toks = queryTokens(q);
  if (!toks.length) return [];
  const hits = [];
  index.rows.forEach((r) => {
    let score = 0, ownStrong = false, titleHit = false, needHit = !r.need;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const so = tokScore(t, r.own), sn = tokScore(t, r.name), s = Math.max(so, sn);
      if (!s) return;
      const st = so ? tokScore(t, r.titleWords) : 0;
      if (so >= 3 || st) ownStrong = true;
      if (st) titleHit = true;
      if (r.need && r.need.some((w) => tokScore(t, [norm(w)]) >= 3)) needHit = true;
      score += s;
    }
    if (r.per && !ownStrong) return; // a protocol's vial / calculator needs its own word, not just the name
    if (!needHit) return; // "Novo frasco" needs "novo", "trocar"…
    if (titleHit) score += 2;
    if (r.phrases.some((ph) => ph.indexOf(nq) === 0)) score += 3;
    hits.push({ r, score });
  });
  const best = {};
  hits.forEach((h) => { best[h.r.g] = Math.max(best[h.r.g] || 0, h.score); });
  hits.sort((a, b) => {
    const ga = a.r.g, gb = b.r.g;
    if (ga !== gb) return (best[gb] - best[ga]) || (GROUP_ORDER.indexOf(ga) - GROUP_ORDER.indexOf(gb));
    return (b.score - a.score) || (a.r.idx - b.r.idx);
  });
  return hits.map((h) => h.r);
}

// Consecutive rows of one tab → [{ g, tab, titleKey, rows }].
function groupRows(rows) {
  const out = [];
  rows.forEach((r) => {
    const last = out[out.length - 1];
    if (last && last.g === r.g) last.rows.push(r);
    else out.push({ g: r.g, tab: GROUP_TAB[r.g], titleKey: GROUP_TITLE[r.g], rows: [r] });
  });
  return out;
}

// "Atalhos" before typing: the list of the tab the search was opened from (B2).
function shortcutsFor(index, tab) {
  const ids = SHORTCUTS[tab] || SHORTCUTS.Today;
  return ids.map((id) => index.rows.find((r) => r.id === id)).filter(Boolean);
}

module.exports = {
  LANGS, SEP, STOP, norm, dl, tokScore, queryTokens, resolveKey, buildPlaceIndex, searchPlaces, groupRows, shortcutsFor,
  CATALOG, SHORTCUTS, GROUP_ORDER, GROUP_TITLE, GROUP_TAB,
};
