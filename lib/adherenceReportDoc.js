'use strict';
// The adherence report as it is sent (docs/specs/adherence-report.md; picture docs/design/relatorio-adesao.html,
// approved by the founder 2026-11-24). It is read by a third person — usually a doctor who never saw the app —
// so every number comes in a sentence that explains itself, in the third person; the top says what the report
// is; "Como ler este relatório" defines each term once; nothing judges (no good / bad, no alert colour, no
// advice: the product guardrail). One model → the text (Share as text, the preview) and the A4 page (HTML →
// expo-print, Share PDF). The numbers come from the screen, made by the shared owners (lib/adherenceReport,
// lib/doseStreak, the vial's supply count); this file only writes them. It never sees the nickname or the
// e-mail: the only name it gets is reportName, the full name (lib/profileName getReportName). Pure.
//
// model = {
//   reportName,                       full name or null (no name line without it)
//   sinceMs, nowMs,                   the period (Today's 30-day ring window) and the moment of generation
//   overall: { due, counted, taken, skipped, missed, adherence },
//   protocols: [{ id, name, endedAtMs, dose, frequency, due, counted, taken, skipped, missed, adherence,
//                 unrecorded, streak, streakSinceMs, vialRemaining }],
//   unsync: null | { never, sinceMs }, gaps: [{ fromMs, toMs }]   (A-181, as before)
// }
// opts = { t, language, timeFormat, extraSections }
const { formatDate, labelColon } = require('./localeFormat');
const { formatTime } = require('./timeFormat');
const { pluralKey } = require('./plural');
const { fillPercent } = require('./adherenceReport');

// AR-22: THE place where per-protocol extra sections are appended (after the protocol's own lines, in the text
// and the PDF). extraSections(protocol) → [{ title, lines: [string] }]. Nothing is added by default; the dose
// marks / observations (feat/dose-observation) plug in here.
const NO_EXTRA_SECTIONS = () => [];

const RULE = '─'.repeat(28);

function htmlEscape(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const ucFirst = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
// "Diariamente" → "diariamente" after "Dose configurada: 2 cápsulas, ". An acronym ("BID") stays.
const lcFirst = (s) => (s && s.length > 1 && s[1] === s[1].toLocaleLowerCase() ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
const fill = (tpl, vals) => Object.keys(vals).reduce((s, k) => s.split(`{${k}}`).join(String(vals[k])), tpl);

function buildAdherenceReport(model, opts) {
  const { t, language, timeFormat } = opts;
  const extraSections = typeof opts.extraSections === 'function' ? opts.extraSections : NO_EXTRA_SECTIONS;
  const colon = labelColon(language);
  const day = (ms) => formatDate(new Date(ms), language, 'numeric') || '';
  const dayMonth = (ms) => formatDate(new Date(ms), language, 'numericDayMonth') || '';
  const clock = (ms) => { const d = new Date(ms); return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, language, timeFormat); };
  const withN = (s, n) => fill(s, { n, count: n }); // the singular / plural key is picked with pluralKey at each call
  const pctText = (v) => fillPercent(t('report_percent'), v);
  const name = model.reportName ? String(model.reportName).trim() : '';
  const when = fill(t('report_generated_at'), { date: day(model.nowMs), time: clock(model.nowMs) });
  const range = fill(t('report_period_range'), { from: day(model.sinceMs), to: day(model.nowMs) });
  const protocols = model.protocols || [];
  const endedCount = protocols.filter((p) => p.endedAtMs != null).length;
  const endedText = endedCount === 0 ? t('report_ended_none') : withN(t(pluralKey('report_ended', endedCount, language)), endedCount);
  const star = !!(model.unsync || (model.gaps && model.gaps.length));
  const o = model.overall || {};

  // The notes under the summary (A-181), in the third person.
  const notes = [];
  if (model.unsync) notes.push(model.unsync.never ? t('report_unsynced_never') : fill(t('report_unsynced'), { date: day(model.unsync.sinceMs) }));
  for (const g of model.gaps || []) notes.push(fill(t('report_gap'), { from: dayMonth(g.fromMs), to: dayMonth(g.toMs - 1) }));

  const sums = [
    withN(t(pluralKey('report_sum_due', o.due || 0, language)), o.due || 0),
    withN(t(pluralKey('report_sum_taken', o.taken || 0, language)), o.taken || 0),
    withN(t(pluralKey('report_sum_skipped', o.skipped || 0, language)), o.skipped || 0),
    withN(t(pluralKey('report_sum_missed', o.missed || 0, language)), o.missed || 0),
  ].join('; ') + '.';
  const overallLine = `${fillPercent(t('report_overall'), o.adherence)}${star ? '*' : ''}`;
  const overallLabel = t('report_overall').split('{percent}')[0].replace(/\s*:\s*$/, '');
  const overallRatio = fill(t('report_overall_ratio'), { taken: o.counted || 0, due: o.due || 0 });

  // One protocol's rows: label, small note, value (the same words in the text and the PDF table).
  function rows(p) {
    const since = p.streak > 0 && p.streakSinceMs != null
      ? fill(t(p.streakSinceMs < model.sinceMs ? 'report_since_before' : 'report_since'), { date: dayMonth(p.streakSinceMs) })
      : '';
    const adhNote = p.adherence == null ? t('report_adh_none') : fill(t('report_adh_note'), { taken: p.counted, due: p.due });
    const out = [
      { label: t('report_due_label'), note: t('report_due_note'), join: 'comma', value: String(p.due) },
      { label: t('report_taken_label'), value: String(p.taken) },
      { label: t('report_skipped_label'), note: t('report_skipped_note'), join: 'paren', value: String(p.skipped) },
      { label: t('report_missed_label'), note: t('report_missed_note'), join: 'paren', value: String(p.missed) },
      { kind: 'adherence', label: t('report_adh_label'), note: adhNote, value: pctText(p.adherence) + (p.unrecorded > 0 ? '*' : '') },
    ];
    // "Doses ainda não contadas por isso: 3" under the adherence line; in the table, the label without its count.
    if (p.unrecorded > 0) out.push({ kind: 'unrecorded', label: t('report_unrecorded').replace(/\s*:\s*\{n\}\s*$/, ''), value: String(p.unrecorded), text: fill(t('report_unrecorded'), { n: p.unrecorded }) });
    out.push({ kind: 'streak', label: t('report_streak_label'), note: since, value: String(p.streak) });
    if (p.vialRemaining != null) out.push({ label: t('report_vial_label'), note: t('report_vial_note'), join: 'comma', value: String(p.vialRemaining) });
    return out;
  }
  function rowText(r) {
    if (r.text) return r.text;
    if (r.kind === 'adherence') {
      // "Adesão: 97%. Doses registradas como tomadas ÷ doses previstas no período (29 de 30)." — the asterisk
      // (A-181) at the end of the line, as today.
      const starred = r.value.endsWith('*');
      return `${r.label}${colon} ${starred ? r.value.slice(0, -1) : r.value}. ${ucFirst(r.note)}.${starred ? '*' : ''}`;
    }
    if (r.kind === 'streak') return `${r.label}${colon} ${r.value}${r.note ? ` (${r.note})` : ''}`;
    const head = r.note ? (r.join === 'paren' ? `${r.label} (${r.note})` : `${r.label}, ${r.note}`) : r.label;
    return `${head}${colon} ${r.value}`;
  }
  // An ended protocol says so ("BPC-157 · Encerrado em 20 de set.", as on My Protocols).
  const endedSuffix = (p) => (p.endedAtMs != null ? ` · ${fill(t('protocols_ended_on'), { date: formatDate(new Date(p.endedAtMs), language, 'dayMonth') || '' })}` : '');
  const protocolTitle = (p) => `${p.name}${endedSuffix(p)}`;
  const doseLine = (p) => fill(t('report_dose_setup'), { dose: p.dose, frequency: lcFirst(p.frequency || '—') });
  const how = [
    ['report_how_due_t', 'report_how_due_d'], ['report_how_taken_t', 'report_how_taken_d'], ['report_how_skipped_t', 'report_how_skipped_d'],
    ['report_how_missed_t', 'report_how_missed_d'], ['report_adh_label', 'report_how_adh_d'], ['report_how_streak_t', 'report_how_streak_d'],
    ['report_how_vial_t', 'report_how_vial_d'], ['report_how_star_t', 'report_how_star_d'],
  ].map(([a, b]) => [t(a), t(b)]);
  const disclaimer = `${t('report_footer_1')} ${t('report_footer_2')}`;
  const footer = fill(t('report_generated_footer'), { when });

  // ── Text ──
  const L = [];
  L.push(t('settings_report_title').toLocaleUpperCase(), '', t('report_about'), '');
  if (name) L.push(`${t('report_name_label')}${colon} ${name}`);
  L.push(`${t('report_period_label')}${colon} ${range} (${t('report_period_note')})`);
  L.push(`${t('report_generated_label')}${colon} ${when}`, '');
  L.push(t('report_summary').toLocaleUpperCase());
  L.push(`${t('report_protocols_in_report')}${colon} ${protocols.length} (${endedText})`);
  L.push(overallLine, overallRatio, sums);
  for (const n of notes) L.push(n);
  for (const p of protocols) {
    L.push('', RULE);
    L.push(`${p.name.toLocaleUpperCase()}${endedSuffix(p)}`);
    L.push(doseLine(p), '');
    for (const r of rows(p)) L.push(rowText(r));
    for (const s of extraSections(p) || []) {
      L.push('', s.title);
      for (const line of s.lines || []) L.push(line);
    }
  }
  L.push('', RULE, t('report_how_title').toLocaleUpperCase());
  // "Dose prevista: dose que…" (German keeps the capital: its nouns are always capitalised).
  for (const [term, def] of how) L.push(`${term}${colon} ${language === 'de' ? def : lcFirst(def)}`);
  L.push('', t('report_no_judgement'), disclaimer, footer);
  const text = L.join('\n');

  // ── A4 page (paper: white, the same in both themes — a deliberately fixed surface, like the labs PDF) ──
  const e = htmlEscape;
  const meta = [];
  if (name) meta.push([t('report_name_label'), e(name)]);
  meta.push([t('report_generated_label'), e(when)]);
  meta.push([t('report_period_label'), `${e(range)} <span class="lab2">(${e(t('report_period_note'))})</span>`]);
  meta.push([t('report_protocols_label'), `${protocols.length} (${e(endedText)})`]);
  const metaHtml = `<div class="meta">${meta.map(([k, v]) => `<b>${e(k)}</b><span>${v}</span>`).join('')}</div>`;
  const top = `<div class="top"><h1>${e(t('settings_report_title'))}</h1><span>${e(t('report_pdf_by'))}</span></div>`;
  const disc = `<div class="disc"><span>${e(t('report_no_judgement'))} ${e(disclaimer)}</span><span class="when">${e(fill(t('report_generated_footer'), { when }))}</span></div>`;
  const protoHtml = protocols.map((p) => {
    const trs = rows(p).map((r) => {
      return `<tr><td>${e(r.label)}${r.note ? `<small>${e(r.note)}</small>` : ''}</td><td class="n">${e(r.value)}</td></tr>`;
    }).join('');
    const extras = (extraSections(p) || []).map((s) => `<div class="sub">${e(s.title)}</div>${(s.lines || []).map((l) => `<div class="obs">${e(l)}</div>`).join('')}`).join('');
    return `<div class="pr"><div class="ph4"><b>${e(protocolTitle(p))}</b><span>${e(lcFirst(doseLine(p)))}</span></div><div class="body"><table>${trs}</table>${extras ? `<div class="extras">${extras}</div>` : ''}</div></div>`;
  }).join('');
  const notesHtml = notes.length ? `<div class="notes">${notes.map((n) => `<p>${e(n)}</p>`).join('')}</div>` : '';
  const howHtml = `<div class="how"><b>${e(t('report_how_title'))}</b><dl>${how.map(([a, b]) => `<dt>${e(a)}</dt><dd>${e(b)}</dd>`).join('')}</dl></div>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 15mm; }
  html, body { background: #fff; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111315; font-size: 10.5px; line-height: 1.42; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.5px solid #111315; padding-bottom: 7px; margin-bottom: 9px; }
  .top h1 { margin: 0; font-size: 19px; font-weight: 700; }
  .top span { font-size: 9.5px; color: #454A4F; }
  .about { font-size: 10px; color: #2C3034; margin: 0 0 9px; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 10px; margin-bottom: 10px; }
  .meta b { font-weight: 600; color: #454A4F; }
  .lab2 { color: #5B6064; }
  .sum { display: flex; gap: 12px; background: #F2F3F0; border-radius: 5px; padding: 9px 11px; align-items: center; margin-bottom: 6px; }
  .sum .big { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sum .tx { font-size: 10px; color: #2C3034; }
  .notes p { font-size: 9.5px; color: #2C3034; margin: 3px 0; }
  .pr { border: 1px solid #C9CCC6; border-radius: 5px; overflow: hidden; margin-top: 9px; page-break-inside: avoid; }
  .pr .ph4 { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; background: #F2F3F0; padding: 6px 10px; border-bottom: 1px solid #C9CCC6; }
  .pr .ph4 b { font-size: 12px; } .pr .ph4 span { font-size: 9.5px; color: #454A4F; text-align: right; }
  .pr .body { padding: 6px 10px 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  td { padding: 3px 0; border-bottom: 1px solid #E3E5E0; vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; padding-left: 10px; }
  td small { display: block; color: #5B6064; font-size: 8.8px; font-weight: 400; }
  .extras { margin-top: 6px; }
  .sub { font-size: 8.8px; font-weight: 700; color: #454A4F; text-transform: uppercase; letter-spacing: .05em; margin: 4px 0 3px; }
  .obs { margin: 0 0 3px; }
  .how { page-break-before: always; border: 1px solid #C9CCC6; border-radius: 5px; padding: 9px 12px; font-size: 10px; line-height: 1.5; }
  .how b { font-size: 11px; }
  .how dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 6px 0 0; }
  .how dt { font-weight: 600; } .how dd { margin: 0; color: #2C3034; }
  .disc { margin-top: 14px; border-top: 1px solid #C9CCC6; padding-top: 7px; font-size: 9px; color: #454A4F; display: flex; justify-content: space-between; gap: 14px; page-break-inside: avoid; }
  .disc .when { white-space: nowrap; }
</style></head><body>
  ${top}
  <div class="about"><b>${e(t('report_about_label'))}</b> ${e(t('report_about'))}</div>
  ${metaHtml}
  <div class="sum"><div class="big">${e(pctText(o.adherence))}${star ? '*' : ''}</div><div class="tx"><b>${e(overallLabel)}${colon}</b> ${e(ucFirst(fill(t('report_adh_note'), { taken: o.counted || 0, due: o.due || 0 })))}.<br>${e(sums)}</div></div>
  ${notesHtml}
  ${protoHtml}
  ${disc}
  ${top}
  ${howHtml}
  ${disc}
</body></html>`;

  return { text, html };
}

module.exports = { buildAdherenceReport, NO_EXTRA_SECTIONS, htmlEscape };
