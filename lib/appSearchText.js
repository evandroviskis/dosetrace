// App search, the app's own help and legal texts (AS-24…AS-27, logic 8): the FAQ (question +
// answer, the store text filled), "Entenda os números" (the five LearnBlock explainers), the
// privacy policy, the terms and the medical disclaimer, split into paragraphs exactly like
// components/LegalModal.js (lib/legalBlocks), each keeping its heading. Built at run time from the
// same i18n/translations.js strings the screens show, so the index can never differ from them;
// searched in the app language only. Results show the app's fixed text unchanged.
//
// Matching: every typed word must be in the same paragraph (its title and heading count); a word
// matches as the whole word, its start (from 3 letters), the same word with another ending (from 5
// letters: "apagar" finds "apaga" and "apagados") or one wrong letter (from 7 letters); the paragraph
// with the typed words closest together comes first. Pure CommonJS (node --test).
'use strict';
const { legalBlocks } = require('./legalBlocks');
const { fillStoreText } = require('./storeText');

// The five explainers of components LearnBlock (screens/components/LearnBlock.js EXPLAINERS).
const LEARN = [
  { key: 'intro', title: 'cal_intro_title', body: 'cal_intro_body' },
  { key: 'scale', title: 'cal_expl_scale_title', body: 'cal_expl_scale_body' },
  { key: 'deficit', title: 'cal_expl_deficit_title', body: 'cal_expl_deficit_body' },
  { key: 'measure', title: 'cal_expl_measure_title', body: 'cal_expl_measure_body' },
  { key: 'composition', title: 'cal_expl_comp_title', body: 'cal_expl_comp_body' },
];
// The three legal texts, as Settings opens them (the terms with the store path filled).
const LEGAL = [
  { doc: 'privacy', key: 'settings_privacy_body', title: 'settings_privacy_policy', icon: 'lock', fill: false },
  { doc: 'terms', key: 'settings_terms_body', title: 'settings_terms', icon: 'clipboard', fill: true },
  { doc: 'disclaimer', key: 'settings_disclaimer_body', title: 'settings_disclaimer', icon: 'info', fill: false },
];
const SEP = ' › ';

// The text a legal reader shows for one document (Settings, AuthScreen and onboarding fill the terms).
function legalContent(t, doc, platformOS) {
  const d = LEGAL.find((x) => x.doc === doc);
  if (!d) return '';
  const raw = t(d.key);
  return d.fill ? fillStoreText(raw, t, platformOS) : raw;
}

// UNITS = [{ src, icon, title, heading, body, where, open }]; t = the app-language translator.
function buildTextIndex(t, platformOS) {
  const units = [];
  const faqPath = [t('tabbar_settings'), t('settings_support'), t('settings_faq')].join(SEP);
  const cats = t('faq_categories');
  (Array.isArray(cats) ? cats : []).forEach((c, ci) => {
    (c.questions || []).forEach((q, qi) => {
      units.push({ src: 'faq', icon: 'help', title: q.q, heading: c.category, body: fillStoreText(q.a, t, platformOS), where: `${faqPath} · ${c.category}`, open: { kind: 'faq', id: q.id || null, ci, qi } }); // CE-6: the FAQ opens it by id (lib/faqLinks)
    });
  });
  const learnPath = [t('tab_journey'), t('cal_learn')].join(SEP);
  LEARN.forEach((e) => {
    units.push({ src: 'learn', icon: 'info', title: t(e.title), heading: '', body: t(e.body), where: learnPath, open: { kind: 'learn', key: e.key } });
  });
  const legalPath = [t('tabbar_settings'), t('settings_data_privacy')].join(SEP);
  LEGAL.forEach((d) => {
    let heading = '';
    legalBlocks(legalContent(t, d.doc, platformOS)).forEach((b, bi) => {
      if (b.heading) { heading = b.text; return; }
      units.push({ src: d.doc, icon: d.icon, title: t(d.title), heading, body: b.text, where: heading ? `${legalPath} · ${heading}` : legalPath, open: { kind: 'legal', doc: d.doc, block: bi } });
    });
  });
  return units;
}

const STOP = {};
('de do da dos das o a os as e em no na um uma the of an to my la le les el los las du des der die das den und di il lo gli y et mi mis mes mon ma meu minha meus minhas i en con com para por pour per mit onde fica cade como achar encontrar procurar quero where how find is what donde esta ou est trouver wo ist finden dove trovare ficam sao estao are estan sont sind sono que se ao seu sua seus suas voce')
  .split(' ').forEach((w) => { STOP[w] = 1; });

function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss'); }
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
function cp(a, b) { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
// 4 whole word, 3 start (from 3 letters), 2 another ending (from 5), 1 one wrong letter (from 7).
function tokText(tok, w) {
  if (w === tok) return 4;
  if (tok.length >= 3 && w.indexOf(tok) === 0) return 3;
  if (tok.length >= 5 && cp(tok, w) >= Math.max(4, tok.length - (tok.length >= 7 ? 2 : 1)) && Math.abs(w.length - tok.length) <= 3) return 2;
  if (tok.length >= 7 && Math.abs(w.length - tok.length) <= 1 && dl(tok, w) <= 1) return 1;
  return 0;
}
const WORD = /[0-9A-Za-zÀ-ÖØ-öø-ÿĀ-žß]+/g;
function words(text) {
  const out = [];
  let m;
  WORD.lastIndex = 0;
  while ((m = WORD.exec(text))) out.push({ w: norm(m[0]), i: m.index, e: m.index + m[0].length });
  return out;
}
// About 120 letters around the stretch that holds the typed words, cut at word boundaries.
function excerptRange(text, ws, from, to) {
  if (!ws.length) return { start: 0, end: Math.min(text.length, 120), pre: false, post: text.length > 120 };
  if (ws[to].e - ws[from].i > 150) to = from;
  let start = Math.max(0, ws[from].i - 40);
  let end = Math.min(text.length, Math.max(ws[to].e + 50, start + 120));
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  while (end < text.length && /\S/.test(text[end])) end++;
  return { start, end, pre: start > 0, post: end < text.length };
}
// The shortest stretch of words holding one hit of every typed word.
function bestWindow(lists) {
  const all = [];
  lists.forEach((l, t) => { l.forEach((j) => { all.push([j, t]); }); });
  all.sort((a, b) => a[0] - b[0]);
  const need = lists.length, cnt = {};
  let have = 0, lo = 0, best = null;
  for (let hi = 0; hi < all.length; hi++) {
    const t = all[hi][1];
    cnt[t] = (cnt[t] || 0) + 1;
    if (cnt[t] === 1) have++;
    while (have === need) {
      if (!best || all[hi][0] - all[lo][0] < best[1] - best[0]) best = [all[lo][0], all[hi][0]];
      const u = all[lo][1];
      cnt[u]--;
      if (!cnt[u]) have--;
      lo++;
    }
  }
  return best;
}

function textTokens(q) {
  return norm(q).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length >= 2 && !STOP[t]);
}

// The paragraphs for a query, best first: [{ unit, k, score, text, pre, post, marks: [[from, to]] }].
// opt.full: marks over the whole paragraph (the opened text marks the words where the person lands).
function makeTextSearch(units) {
  const idx = units.map((u, k) => ({ u, k, body: words(u.body), head: words(`${u.title || ''} ${u.heading || ''}`) }));
  return function searchText(q, opt) {
    const toks = textTokens(q);
    if (!toks.length) return [];
    const hits = [];
    idx.forEach((x) => {
      let score = 0;
      const lists = [], marks = [];
      for (let t = 0; t < toks.length; t++) {
        let best = 0, inHead = 0;
        const list = [];
        const sc = x.body.map((w) => tokText(toks[t], w.w));
        sc.forEach((v) => { if (v > best) best = v; });
        if (best) sc.forEach((v, j) => { if (v === best) { list.push(j); marks.push(j); } });
        x.head.forEach((w) => { const s = tokText(toks[t], w.w); if (s > inHead) inHead = s; });
        if (!best && !inHead) return;
        score += Math.max(best, inHead) + (inHead ? 2 : 0);
        if (list.length) lists.push(list);
      }
      const win = lists.length ? bestWindow(lists) : null;
      if (win && lists.length > 1) { const span = win[1] - win[0]; score += span <= 3 ? 4 : span <= 8 ? 3 : span <= 20 ? 1 : 0; }
      const ex = opt && opt.full
        ? { start: 0, end: x.u.body.length, pre: false, post: false }
        : win ? excerptRange(x.u.body, x.body, win[0], win[1]) : excerptRange(x.u.body, x.body, 0, 0);
      const mk = marks
        .filter((j, n) => marks.indexOf(j) === n && x.body[j].i >= ex.start && x.body[j].e <= ex.end)
        .sort((p, r) => p - r)
        .map((j) => [x.body[j].i - ex.start, x.body[j].e - ex.start]);
      hits.push({ unit: x.u, k: x.k, score, text: x.u.body.slice(ex.start, ex.end), pre: ex.pre, post: ex.post, marks: mk });
    });
    hits.sort((a, b) => (b.score - a.score) || (a.k - b.k));
    return hits;
  };
}

// The words of `text` to mark for a query (the opened LegalModal / FAQ / LearnBlock paragraph).
function markRanges(text, q) {
  const hits = makeTextSearch([{ title: '', heading: '', body: String(text || '') }])(q, { full: true });
  return hits.length ? hits[0].marks : [];
}

// Splits a text into [{ text, mark }] pieces for rendering the marks.
function markedPieces(text, marks) {
  const out = [];
  let at = 0;
  (marks || []).forEach(([a, b]) => {
    if (a > at) out.push({ text: text.slice(at, a), mark: false });
    out.push({ text: text.slice(a, b), mark: true });
    at = b;
  });
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

module.exports = { LEARN, LEGAL, legalContent, buildTextIndex, makeTextSearch, markRanges, markedPieces, textTokens, tokText };
