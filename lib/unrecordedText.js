'use strict';
// The texts of the unrecorded-period sheet and card (UP-2, UP-13, UP-14, UP-24, UP-28, UP-34, UP-35, UP-36),
// built from the plan the save uses (lib/unrecordedPeriod planUnrecordedAnswer) so the summary never drifts
// from what is written. Pure: the caller passes t, the language and the date / time formatters of the app
// language (lib/localeFormat formatDate, lib/timeFormat formatTime). CommonJS (node --test).
const { pluralKey } = require('./plural');
const { sortedDoseTimes } = require('./schedule');

const fill = (s, vals) => Object.entries(vals).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), String(s));

// Dates listed in a sentence ("4 e 11 de set."): the formatter of the app language, joined by the language's
// own list (Intl.ListFormat when there is one), never more than the first 6 (the rest are in the list).
function dateList(msList, fmtDay, language) {
  const items = (msList || []).map(fmtDay).filter(Boolean);
  try { return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); }
}

// The line under the title: "125 mg · Semanalmente, segunda às 09:00" — the dose and the schedule in force.
function scheduleLine(p, { t, fmtTime, freqLabel }) {
  const dose = p && p.dose ? (p.dose_unit ? `${String(p.dose)} ${p.dose_unit}` : String(p.dose)) : ''; // A-134: never split
  const times = sortedDoseTimes(p || {}).slice(0, (p && p.doses_per_day) || 1).map(fmtTime).filter(Boolean).join(', ');
  const freq = freqLabel ? freqLabel((p && p.interval_days) || 1) : '';
  return [dose, [freq, times].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
}

// The question of one protocol. ask = { protocol, entries }; name = its display name.
// → { title, sub, appLine, personLine, counter (null for a single question), counterA11y }.
function questionTexts(ask, { t, language, name, fmtDay, fmtTime, freqLabel, index = 0, total = 1, personMarked = [] }) {
  const e = ask.entries;
  const n = e.length;
  const from = fmtDay(e[0].slotMs);
  const to = fmtDay(e[n - 1].slotMs);
  const title = n === 1 ? fill(t('unrec_title_single'), { from, name }) : fill(t('unrec_title'), { from, to, n, name });
  const app = e.filter((x) => x.row).map((x) => x.slotMs);
  const appLine = app.length ? fill(t(pluralKey('unrec_app_line', app.length, language)), { dates: dateList(app, fmtDay, language) }) : null;
  const personLine = personMarked.length ? fill(t(pluralKey('unrec_person_line', personMarked.length, language)), { dates: dateList(personMarked, fmtDay, language) }) : null;
  return {
    title,
    sub: scheduleLine(ask.protocol, { t, fmtTime, freqLabel }),
    appLine,
    personLine,
    noneSub: fill(t(pluralKey('unrec_none_sub', n, language)), { n }),
    counter: total > 1 ? fill(t('unrec_counter'), { i: index + 1, n: total }) : null,
    counterA11y: total > 1 ? fill(t('unrec_counter_a11y'), { i: index + 1, n: total }) : null,
  };
}

// The summary before Salvar (UP-14), from the plan's own summary. vialDay: the vial's day formatted.
function summaryText(summary, { t, language, fmtDay }) {
  if (!summary) return '';
  const parts = [];
  const range = (list) => ({ from: fmtDay(list[0]), to: fmtDay(list[list.length - 1]) });
  if (summary.choice === 'all') {
    const r = range(summary.takenMs);
    parts.push(summary.taken === 1 ? fill(t('unrec_sum_all_single'), r) : fill(t('unrec_sum_all'), { n: summary.taken, ...r }));
  } else if (summary.choice === 'none') {
    const r = range(summary.skippedMs);
    parts.push(summary.skipped === 1 ? fill(t('unrec_sum_none_single'), r) : fill(t('unrec_sum_none'), { n: summary.skipped, ...r }));
  } else if (summary.choice === 'pick') {
    parts.push(fill(t(pluralKey('unrec_sum_pick', summary.taken, language)), { a: summary.taken, b: summary.skipped }));
  } else if (summary.choice === 'unknown') {
    const r = range(summary.allMs);
    parts.push(summary.n === 1 ? fill(t('unrec_sum_unknown_single'), r) : fill(t('unrec_sum_unknown'), { n: summary.n, ...r }));
  }
  if (summary.bottle) parts.push(t('unrec_bottle_same'));
  else if (summary.vial && summary.vial.used > 0) {
    const date = fmtDay(summary.vial.startMs);
    parts.push(fill(t(pluralKey(summary.vial.finished ? 'unrec_vial_finished' : 'unrec_vial_used', summary.vial.used, language)), { date, k: summary.vial.used }));
    if (summary.vial.others > 0) parts.push(fill(t(pluralKey('unrec_vial_others', summary.vial.others, language)), { m: summary.vial.others }));
  } else {
    parts.push(t('unrec_vial_same'));
  }
  return parts.join(' ');
}

// The Dose log card (UP-24). card = lib/unrecordedPeriod cardSummary.
function cardTexts(card, { t, language, fmtDay }) {
  if (!card) return null;
  const protocols = fill(t(pluralKey('unrec_card_protocols', card.k, language)), { k: card.k });
  const from = fmtDay(card.fromMs);
  const to = fmtDay(card.toMs);
  return {
    title: fill(t('unrec_card_title'), { date: fmtDay(card.beforeMs) }),
    body: card.n === 1 ? fill(t('unrec_card_body_single'), { protocols, from }) : fill(t('unrec_card_body'), { n: card.n, protocols, from, to }),
    action: t('unrec_answer'),
  };
}

// The lab line (UP-34). → null (no missed dose) or { line, link, a11y }.
function labLineTexts(n, { t, language }) {
  if (!(n > 0)) return null;
  const line = fill(t(pluralKey('lab_missed_line', n, language)), { n });
  const link = t('lab_missed_link');
  return { line, link, a11y: `${line}, ${link}` };
}

module.exports = { fill, dateList, scheduleLine, questionTexts, summaryText, cardTexts, labLineTexts };
