'use strict';
// Dose mark and observation, option B (founder 2026-11-24 13:02 / 13:06 EST; picture
// docs/design/dose-jejum-refeicao-treino.html; docs/specs/dose-observation.md DO-1..DO-29).
// A completed dose may carry ONE mark — "Em jejum" ('fasted') or "Com refeição" ('meal') — and a free
// observation the person writes afterwards (dose_logs.dose_context / dose_note). Per protocol,
// "Repetir nas próximas doses" (protocols.repeat_dose_context / repeat_dose_note; both empty = off)
// copies them into every NEW completed dose from Today, the notification and Pendentes de ontem
// (lib/doseActions recordDoseTaken, applyRepeat).
// The app only keeps what the person marked or wrote: it never reads, judges or reacts to the text
// (the emergency line is fixed, from the phone's region only, and names no symptom). Pure, CommonJS.

const { isDeclared, loggedOnly } = require('./declared');

const CONTEXTS = ['fasted', 'meal'];
const CONTEXT_KEY = { fasted: 'dose_obs_fasted', meal: 'dose_obs_meal' };

// Only the two marks exist; anything else is no mark.
function cleanContext(v) {
  return CONTEXTS.includes(v) ? v : null;
}
// The saved text: the typed text without blank space at its ends; empty = no observation.
function cleanNote(text) {
  if (text == null) return null;
  const s = String(text).replace(/^\s+|\s+$/g, '');
  return s || null;
}

// A completed dose logged in the app (never Pulada / Perdida / "Não houve dose", never declared history).
function canObserveDose(log) {
  return !!log && log.outcome === 'Taken' && !isDeclared(log, log.protocol_created_at);
}

// The marks never go together; tapping the chosen one removes it.
function toggleContext(current, tapped) {
  const c = cleanContext(tapped);
  if (!c) return cleanContext(current);
  return cleanContext(current) === c ? null : c;
}

// ── The observation's draft (lib/draftStore, A-77: kept in memory per dose until saved or cancelled) ──
function noteDraftKey(logId) {
  return 'doseNote:' + logId;
}
const draftText = (draft) => (draft == null ? null : (typeof draft === 'string' ? draft : draft.text));
// Cancelar / Salvar show while the text differs from the saved one (the protocol note's rule).
function noteDirty(text, saved) {
  return String(text ?? '') !== String(saved ?? '');
}
// What a way out of the sheet saves: undefined = nothing to write; null = the observation was erased.
function noteToSave(draft, saved) {
  const text = draftText(draft);
  if (text == null) return undefined;
  const next = cleanNote(text);
  return next === cleanNote(saved) ? undefined : next;
}

// ── "Repetir nas próximas doses" ──
// DO-30 (chair decision 2026-11-24, by logic, option b; the founder may change it): only a protocol with ONE
// dose a day repeats — one setting cannot hold a morning "Em jejum" and an evening "Com refeição", and from the
// notification it would stamp the other dose unseen. On 2+ doses a day: no switch, nothing stamped (a value
// left from a 1-a-day schedule stays stored but is never applied).
function repeatAllowed(protocol) {
  return !!protocol && (Number(protocol.doses_per_day) || 1) <= 1;
}
function repeatOf(protocol) {
  if (!protocol || !repeatAllowed(protocol)) return null;
  const dose_context = cleanContext(protocol.repeat_dose_context);
  const dose_note = cleanNote(protocol.repeat_dose_note);
  return dose_context || dose_note ? { dose_context, dose_note } : null;
}
// Off by default; shown once this dose has a mark or an observation, or while the protocol repeats.
function repeatShown(log, protocol) {
  if (!canObserveDose(log) || !repeatAllowed(protocol)) return false;
  return !!repeatOf(protocol) || !!cleanContext(log.dose_context) || !!cleanNote(log.dose_note);
}
// Switching on copies THIS dose's mark and observation; it never writes any dose.
function repeatOnFields(log) {
  return { repeat_dose_context: cleanContext(log && log.dose_context), repeat_dose_note: cleanNote(log && log.dose_note) };
}
const REPEAT_OFF = Object.freeze({ repeat_dose_context: null, repeat_dose_note: null });

// ── Lines ──
function markLabel(ctx, t) {
  const c = cleanContext(ctx);
  return c ? t(CONTEXT_KEY[c]) : null;
}
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
function noteLine(note) {
  const n = cleanNote(note);
  return n ? oneLine(n) : null;
}
// Today's "Doses concluídas" row: "Em jejum · Antes da yoga" (one line), or null.
function observationLine(log, t) {
  if (!log) return null;
  const parts = [markLabel(log.dose_context, t), noteLine(log.dose_note)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
// The Undo bar after a take the repeat stamped: "Dose registrada · Em jejum · Antes da yoga".
function takenToastText({ base, applied, t }) {
  if (!applied) return base;
  const parts = [base, markLabel(applied.dose_context, t), noteLine(applied.dose_note)].filter(Boolean);
  return parts.join(' · ');
}
// The repeat row's line: what every new dose of {name} gets.
function repeatBody(protocolOrFields, name, t) {
  const r = repeatOf(protocolOrFields);
  if (!r) return '';
  const q = (x) => t('dose_obs_quote').replace('{x}', x);
  const mark = markLabel(r.dose_context, t);
  const note = noteLine(r.dose_note);
  const what = mark && note ? t('dose_obs_repeat_both').replace('{a}', q(mark)).replace('{b}', q(note)) : q(mark || note);
  return t('dose_obs_repeat_body').replace('{name}', name || '').replace('{what}', what);
}

// ── The fixed emergency line (docs/design/dose-notes.html rule) ──
// The phone's region: 192 (SAMU) in Brazil, 911 in the USA, 999 in the United Kingdom, 112 in the
// European Union; anywhere else 112 "or the local emergency number".
const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
function emergencyFor(region) {
  const r = String(region || '').toUpperCase();
  if (r === 'BR') return { number: '192', kind: 'samu' };
  if (r === 'US') return { number: '911', kind: 'plain' };
  if (r === 'GB' || r === 'UK') return { number: '999', kind: 'plain' };
  if (EU.includes(r)) return { number: '112', kind: 'plain' };
  return { number: '112', kind: 'local' };
}
const CALL_KEY = { samu: 'dose_obs_sos_call_samu', plain: 'dose_obs_sos_call', local: 'dose_obs_sos_call_local' };
// Founder 2026-11-24: "Não podemos sugerir o que a pessoa está sentindo. Precisamos somente direcionar uma
// pessoa que não se sinta bem a ligar para a emergência." No symptom is named (one not listed could be taken as
// not urgent), and the sentence is the same for every dose: "Não está se sentindo bem depois da dose? Em uma
// emergência, ligue para o 192 (SAMU)."
function emergencyText({ region, t }) {
  const e = emergencyFor(region);
  return {
    question: t('dose_obs_sos_q'),
    call: t(CALL_KEY[e.kind]).replace('{number}', e.number),
    number: e.number,
    tel: `tel:${e.number}`,
  };
}

// ── Report seam (wired into the adherence report by reportObservationSections below, integration 2026-11-24) ──
// Per protocol, over [fromMs, toMs): the logged Taken doses (declared history out, the same rows as the
// adherence counts), how many carry each mark and how many none, and the observations grouped — the same
// text once with its number of doses and first / last moment (most frequent first, then the oldest).
function observationSummary({ logs, protocols, fromMs = -Infinity, toMs = Infinity }) {
  const rows = loggedOnly(logs || [], protocols || []).filter((l) => {
    if (l.outcome !== 'Taken') return false;
    const ms = Date.parse(l.logged_at);
    return Number.isFinite(ms) && ms >= fromMs && ms < toMs;
  });
  const out = new Map();
  for (const l of rows) {
    if (!out.has(l.protocol_id)) out.set(l.protocol_id, { protocolId: l.protocol_id, taken: 0, fasted: 0, meal: 0, none: 0, notes: [], _by: new Map() });
    const p = out.get(l.protocol_id);
    p.taken++;
    const c = cleanContext(l.dose_context);
    if (c) p[c]++; else p.none++;
    const n = cleanNote(l.dose_note);
    if (n) {
      const ms = Date.parse(l.logged_at);
      const g = p._by.get(n);
      if (g) { g.count++; g.firstMs = Math.min(g.firstMs, ms); g.lastMs = Math.max(g.lastMs, ms); }
      else p._by.set(n, { text: n, count: 1, firstMs: ms, lastMs: ms });
    }
  }
  return [...out.values()].map(({ _by, ...p }) => ({
    ...p,
    notes: [..._by.values()].sort((a, b) => (b.count - a.count) || (a.firstMs - b.firstMs)),
  }));
}

// ── The adherence report's sections (integration 2026-11-24: lib/adherenceReportDoc extraSections, AR-22) ──
// Pictures: docs/design/dose-jejum-refeicao-treino.html part 4 and docs/design/relatorio-adesao.html ("Doses
// registradas como tomadas em jejum (marcado pela pessoa): 27 de 29"). Only what she marked is counted — never a
// "sem marca" count; identical observations once with their number of doses and first / last day, a different
// one with the dose's day and time; nothing marked and nothing written → no section. summary: one protocol of
// observationSummary. → [{ title, lines, textTitle, textLines }] (a line is a string or { quote, detail }).
function reportObservationSections(summary, { t, language, timeFormat }) {
  if (!summary) return [];
  const { formatDate, labelColon } = require('./localeFormat');
  const { formatTime } = require('./timeFormat');
  const fill = (tpl, vals) => Object.keys(vals).reduce((s, k) => s.split(`{${k}}`).join(String(vals[k])), tpl);
  const dayMonth = (ms) => formatDate(new Date(ms), language, 'numericDayMonth') || '';
  const clock = (ms) => { const d = new Date(ms); return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, language, timeFormat); };
  const out = [];
  const marks = CONTEXTS.filter((c) => summary[c] > 0);
  if (marks.length) {
    const vals = (c) => ({ n: summary[c], total: summary.taken });
    out.push({
      title: t('report_obs_marked_title'),
      lines: marks.map((c) => fill(t(`report_obs_${c}`), vals(c))),
      textTitle: null, // the text line itself says "(marcado pela pessoa)"
      textLines: marks.map((c) => fill(t(`report_obs_${c}_text`), vals(c))),
    });
  }
  const notes = (summary.notes || []).filter((n) => cleanNote(n.text));
  if (notes.length) {
    const lines = notes.map((n) => ({
      quote: t('dose_obs_quote').replace('{x}', noteLine(n.text)),
      detail: n.count > 1
        ? fill(t('report_obs_note_many'), { n: n.count, from: dayMonth(n.firstMs), to: dayMonth(n.lastMs) })
        : fill(t('report_obs_note_one'), { date: dayMonth(n.firstMs), time: clock(n.firstMs) }),
    }));
    out.push({ title: t('report_obs_notes_title'), lines, textTitle: `${t('report_obs_notes_title')}${labelColon(language)}` });
  }
  return out;
}

module.exports = {
  reportObservationSections,
  CONTEXTS, cleanContext, cleanNote, canObserveDose, toggleContext,
  noteDraftKey, noteDirty, noteToSave,
  repeatAllowed, repeatOf, repeatShown, repeatOnFields, REPEAT_OFF,
  markLabel, noteLine, observationLine, takenToastText, repeatBody,
  emergencyFor, emergencyText, observationSummary,
};
