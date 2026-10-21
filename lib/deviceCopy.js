'use strict';
// A-119 words and sheets (approved pictures: docs/design/a119-one-active-device.html screens 1, 1b,
// 2, 2b, 3, 3b, 4; docs/design/a119-more-texts.html: takeover with unsent records, account deleted
// "em outro aparelho", the kind words, sign-out edge cases 5a / 5b). Pure: every sheet is a DTSheet
// config built from t (the app's translations), the app language and the time format. Dates and
// times follow the app language and this phone's time zone ("14 de out. às 21:32").

const { formatDate } = require('./localeFormat');
const { formatTime } = require('./timeFormat');
const { deviceWords } = require('./deviceRules');
const { KIND_ORDER } = require('./unsentSummary');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const lang = (l) => (LANGS.includes(l) ? l : 'en');
// Short month names as the app writes them (lib/localeFormat MONTHS_SHORT, format context).
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
};

const fill = (s, map) => Object.keys(map).reduce((acc, k) => acc.split(`{${k}}`).join(map[k]), String(s));

// Small language fixes a template cannot carry: Italian elides before 8 and 11 ("dall'8", "l'11"),
// French writes the first of the month "1er".
function polish(text, language) {
  const l = lang(language);
  // A date that ends in an abbreviation ("out.") at the end of a sentence keeps one period.
  let s = text.replace(/\.\.(?!\.)/g, '.');
  if (l === 'it') {
    s = s.replace(/\b(il|al|dal|del) (8|11)\b/g, (_, w, n) => ({ il: "l'", al: "all'", dal: "dall'", del: "dell'" })[w] + n);
  }
  if (l === 'fr') {
    s = s.replace(/\b1 (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)/g, '1er $1');
  }
  return s;
}

// "14 de out. às 21:32" / "Oct 14 at 9:32 PM": a server time, shown in this phone's time zone.
function when(t, language, timeFormat, iso, now = new Date()) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return fill(t('dev_when'), {
    date: formatDate(d, language, 'dayMonthAuto', now),
    time: formatTime(`${hh}:${mm}`, language, timeFormat || 'auto'),
  });
}

function dayDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

// The days of the unsent rows, oldest to newest, as each language says a range ("de 12 a 14 de
// out.", "Oct 12 to 14"). '' when there is no dated row.
function dayRange(language, from, to, now = new Date()) {
  if (!from) return '';
  const l = lang(language);
  const a = dayDate(from);
  const b = dayDate(to || from);
  const thisYear = a.getFullYear() === now.getFullYear() && b.getFullYear() === now.getFullYear();
  const full = (d) => formatDate(d, l, thisYear ? 'dayMonth' : 'dayMonthYear', now);
  const sameDay = (to || from) === from;
  const sameMonth = thisYear && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const D = (d) => (l === 'fr' && d.getDate() === 1 ? '1er' : d.getDate());
  const M = (d) => MONTHS[l][d.getMonth()];
  const Y = (d) => (thisYear ? '' : ` de ${d.getFullYear()}`);
  let s;
  switch (l) {
    case 'pt':
      s = sameDay ? `de ${full(a)}` : sameMonth ? `de ${D(a)} a ${D(b)} de ${M(a)}` : `de ${full(a)} a ${full(b)}`;
      break;
    case 'es':
      s = sameDay ? `del ${D(a)} de ${M(a)}${Y(a)}` : sameMonth ? `del ${D(a)} al ${D(b)} de ${M(a)}` : `del ${D(a)} de ${M(a)}${Y(a)} al ${D(b)} de ${M(b)}${Y(b)}`;
      break;
    case 'fr':
      s = sameDay ? `du ${full(a)}` : sameMonth ? `du ${D(a)} au ${D(b)} ${M(a)}` : `du ${full(a)} au ${full(b)}`;
      break;
    case 'de':
      s = sameDay ? `vom ${full(a)}` : sameMonth ? `vom ${D(a)}. bis ${D(b)}. ${M(a)}` : `vom ${full(a)} bis ${full(b)}`;
      break;
    case 'it':
      s = sameDay ? `del ${full(a)}` : sameMonth ? `dal ${D(a)} al ${D(b)} ${M(a)}` : `dal ${full(a)} al ${full(b)}`;
      break;
    case 'en':
    default:
      s = sameDay ? full(a) : sameMonth ? `${M(a)} ${D(a)} to ${D(b)}` : `${full(a)} to ${full(b)}`;
  }
  return polish(s, l);
}

// "2 doses, 1 pesagem e 3 itens de comida" — one word per kind, in the approved order.
function kindsList(t, byKind) {
  const parts = [];
  for (const k of KIND_ORDER) {
    const n = byKind && byKind[k];
    if (!n) continue;
    parts.push(fill(t(`dev_kind_${k}_${n === 1 ? 'one' : 'many'}`), { n: String(n) }));
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${t('dev_list_and')} ${parts[parts.length - 1]}`;
}

// What was not backed up, with its dates when it has any: "2 doses e 1 pesagem, de 12 a 14 de out.".
function whatText(t, language, summary, { here = false, now } = {}) {
  const kinds = kindsList(t, summary.byKind);
  const range = dayRange(language, summary.from, summary.to, now);
  const key = here ? (range ? 'dev_kinds_here_range' : 'dev_kinds_here') : (range ? 'dev_kinds_range' : null);
  return key ? fill(t(key), { kinds, range }) : kinds;
}

// How the notices name the other phone (ledger 2026-10-15): two grammatical forms per kind — where
// ("no iPhone", "on the iPhone") and who ("o iPhone", "the iPhone"); at the start of a sentence the
// first letter is capitalized ("O iPhone sai…", "No iPhone, nada muda.").
function deviceForms(t, info) {
  const w = deviceWords(info);
  const f = (form) => fill(t(`dev_${w.kind}_${form}`), { name: w.name || '' });
  return { in: f('in'), subj: f('subj') };
}
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function dev(s, forms) {
  return String(s).replace(/\{(dev_in|dev)\}/g, (m, k, at, whole) => {
    const v = k === 'dev_in' ? forms.in : forms.subj;
    const before = whole.slice(0, at);
    return before === '' || /[.!?]\s+$/.test(before) || /\n\s*$/.test(before) ? capital(v) : v;
  });
}

// Portuguese: the approved "Elas não estão" reads right only when every kind is feminine.
const PT_FEMININE = new Set(['dose', 'weighIn', 'vaccine', 'protocol', 'target']);
function allFeminine(byKind) {
  return Object.keys(byKind || {}).filter((k) => byKind[k] > 0).every((k) => PT_FEMININE.has(k));
}

// Screens 1 / 1b (+ the paragraph for this phone's own unsent records, more-texts 1).
function noticeSheet({ t, language, timeFormat, notice, onOk, now }) {
  if (!notice) return null;
  const forms = deviceForms(t, notice.device);
  const first = notice.lastSentAt
    ? fill(t('dev_notice_dated'), { when: when(t, language, timeFormat, notice.lastSentAt, now) })
    : t('dev_notice_never');
  const paras = [dev(first, forms), dev(t('dev_notice_now_here'), forms)];
  const own = notice.own && notice.own.count > 0 ? notice.own : null;
  if (own) {
    const key = own.count === 1 ? 'dev_notice_own_one' : (allFeminine(own.byKind) ? 'dev_notice_own_many' : 'dev_notice_own_many_mixed');
    paras.push(fill(t(key), { what: whatText(t, language, own, { here: true, now }) }));
  }
  return {
    icon: own ? 'warning' : undefined,
    title: t('dev_notice_title'),
    body: polish(paras.join('\n\n'), language),
    buttons: [{ label: t('dev_notice_ok'), kind: 'primary', onPress: onOk }],
    onDismiss: onOk,
  };
}

// Screens 2 / 2b (replaced) and the account deleted on another device. Locked: the account is no
// longer on this phone; only Continue (wipe and sign out).
function verdictSheet({ t, language, timeFormat, verdict, onContinue, onRetry, now }) {
  if (!verdict) return null;
  const button = [{ label: t('dev_continue'), kind: 'primary', onPress: onContinue }];
  if (verdict.kind === 'gone') {
    return { title: t('dev_gone_title'), body: t('dev_gone_body'), buttons: button, locked: true };
  }
  // Gate B / auditor: never a wipe without a count — while this phone's unsent rows cannot be counted
  // there is no Continue (no wipe); round 2: the phone is never left silently stopped either — a
  // locked sheet says it is being checked and offers a retry (the count is also tried at every open
  // and foreground). Its words await the founder's approval (not in the picture).
  const s = verdict.summary;
  if (verdict.unknown || !s || typeof s.count !== 'number') {
    return { icon: 'warning', title: t('dev_counting_title'), body: t('dev_counting_body'), buttons: [{ label: t('dev_counting_retry'), kind: 'primary', onPress: onRetry }], locked: true };
  }
  const w = verdict.at ? when(t, language, timeFormat, verdict.at, now) : '';
  const paras = [w ? fill(t('dev_replaced_body'), { when: w }) : t('dev_replaced_body_nodate')];
  if (s.count > 0) paras.push(fill(t(s.count === 1 ? 'dev_replaced_unsent_one' : 'dev_replaced_unsent_many'), { what: whatText(t, language, s, { now }) }));
  return { icon: 'warning', title: t('dev_replaced_title'), body: polish(paras.join('\n\n'), language), buttons: button, locked: true };
}

// Screen 4: a phone that never signed in while another device holds the account (DL-103).
// Gate B H1: this phone's unsent changes are named before either choice (both remove them).
function askSheet({ t, language, ask, onUseHere, onSignOut, now }) {
  if (!ask) return null;
  const forms = deviceForms(t, ask.device);
  let body = dev(t('dev_ask_body'), forms);
  const s = ask.summary;
  let extra = null;
  if (ask.unknown === true) extra = t('so_unknown_count');
  else if (s && s.count > 0) extra = fill(t(s.count === 1 ? 'dev_ask_unsent_one' : 'dev_ask_unsent_many'), { n: String(s.count), what: whatText(t, language, s, { now }) });
  if (extra) {
    const cut = body.indexOf('\n\n');
    body = cut < 0 ? `${body}\n\n${extra}` : `${body.slice(0, cut)}\n\n${extra}${body.slice(cut)}`;
  }
  return {
    title: t('dev_ask_title'),
    body: polish(body, language),
    // DTSheet stacks two long labels in reverse: "Use here" on top, "Sign out of this phone" below.
    buttons: [{ label: t('dev_ask_signout'), kind: 'secondary', onPress: onSignOut }, { label: t('dev_ask_use'), kind: 'primary', onPress: onUseHere }],
    locked: true,
  };
}

// Screens 3 / 3b / 5a / 5b: sign-out is never blocked; the sheet says what really happened (no
// internet, or the backup did not finish), what is not in the account (kinds and dates, records the
// server will never accept), when this phone last backed up everything, and that signing in on the
// new phone is enough. summary null = the app could not count (5b).
function signOutSheet({ t, language, timeFormat, offline, summary, lastBackup, onAnyway, onStay, now }) {
  const known = !!(summary && typeof summary.count === 'number');
  const paras = [t(offline ? 'so_offline' : 'so_online')];
  if (known) {
    const n = summary.count;
    const parts = [fill(t(n === 1 ? 'so_count_one' : 'so_count_many'), { n: String(n), what: whatText(t, language, summary, { now }) })];
    const r = Math.min(summary.refused || 0, n);
    if (r > 0) parts.push(fill(t(n === 1 ? 'so_refused_only' : r === 1 ? 'so_refused_one' : 'so_refused_many'), { n: String(r) }));
    parts.push(t(n === 1 ? 'so_removes_one' : 'so_removes_many'));
    paras.push(parts.join(' '));
  } else {
    paras.push(`${t('so_unknown_count')} ${t('so_unknown_removes')}`);
  }
  paras.push(lastBackup ? fill(t('so_last_backup'), { when: when(t, language, timeFormat, lastBackup, now) }) : t('so_never_backup'));
  paras.push(t('so_switch_tip'));
  return {
    icon: 'warning',
    title: t(known ? 'so_title' : 'so_title_unknown'),
    body: polish(paras.join('\n\n'), language),
    // Stacked in reverse by DTSheet: "Sign out anyway" (red) on top, the way to stay below.
    buttons: [
      { label: t(offline ? 'settings_signout_connect_first' : 'settings_signout_stay'), kind: 'secondary', onPress: onStay },
      { label: t('settings_signout_anyway'), kind: 'danger', onPress: onAnyway },
    ],
    onDismiss: onStay,
  };
}

module.exports = { when, dayRange, kindsList, whatText, deviceForms, noticeSheet, verdictSheet, askSheet, signOutSheet, polish };
