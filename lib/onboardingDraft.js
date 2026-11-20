'use strict';
// The protocol the onboarding builds BEFORE the account exists (docs/specs/onboarding-protocol.md
// OB-14..OB-24) and its way into the account (OB-22, OB-23 / OP-2), plus the 15-day builder for an
// existing account that never created a protocol (OB-26). Pure (node --test); the storage is passed
// in (createDraftStore) and lib/onboardingDraftStore.js binds it to AsyncStorage.
//
// Engineering decisions (senior review 2026-11-20):
//  - No AI before the account (the assistant's edge function needs a session): the compound list is
//    the catalog (lib/compounds) filtered by what she uses, plus a typed name kept as written.
//  - The draft lives as JSON in its OWN AsyncStorage key, never in SQLite before sign-in: a row there
//    makes isLocalDBEmpty false and a returning account's fullImportFromCloud would be skipped.
//  - It is durable: it survives an app kill before signup (e.g. while confirming the email). Its owner
//    marker is the hand-off (handoffAt: she reached Create account / Sign in from THIS onboarding) and
//    it expires (DRAFT_TTL_DAYS). The SIGNED_OUT wipe never touches it (it is not account data: nobody
//    signed in owns it yet).
//  - After SIGNED_IN (deferred, never inside onAuthStateChange) it is written through the one save of
//    the manual form (lib/protocolSave), with the vial and the past-doses answer.
//  - Numbers are kept as typed and read with parseDecimal(text, language) in the language they were
//    typed in (draft.language).

const { LYOPHILIZED_KEYS, RTU_KEYS, ORAL_KEYS, matchesQuery } = require('./compounds');
const { parseDecimal } = require('./doseMath');
const { inputNumber, decimalText, unitText } = require('./localeFormat');
const { newProtocolForm } = require('./protocolForm');
const { isClockTime } = require('./assistantTime');
const { localISO } = require('./localDate');
const { formatTime } = require('./timeFormat');
const { pastStartAsk } = require('./pastDoses');
const { pluralKey } = require('./plural'); // plural.js is ESM; require() of it works under node and Metro (lib/paywallPlans does the same)

const DRAFT_KEY = 'dt_onboarding_draft';
const DRAFT_TTL_DAYS = 14;
const DAY_MS = 86400000;
const NBSP = ' ';

// ── The catalog by "O que você está usando?" ──
const GLP1_BASES = ['albiglutide', 'cagrilintide', 'dulaglutide', 'eloralintide', 'exenatide', 'liraglutide', 'lixisenatide', 'mazdutide', 'retatrutide', 'semaglutide', 'survodutide', 'tirzepatide'];
const HORMONE_LYO = ['hcg', 'hgh', 'fsh', 'hmg'];
const RTU_HORMONE = /^rtu_(testosterone|nandrolone|trenbolone|drostanolone|boldenone|methenolone|stanozolol|sustanon|estradiol|progesterone)/;
const baseOf = (key) => String(key).replace(/^(lyo|rtu|oral)_/, '');

function categoryKeys(cat) {
  if (cat === 'glp1') return [...LYOPHILIZED_KEYS, ...RTU_KEYS].filter((k) => GLP1_BASES.includes(baseOf(k)));
  if (cat === 'hormones') return [...RTU_KEYS.filter((k) => RTU_HORMONE.test(k)), ...LYOPHILIZED_KEYS.filter((k) => HORMONE_LYO.includes(baseOf(k)))];
  if (cat === 'peptides') return LYOPHILIZED_KEYS.filter((k) => !GLP1_BASES.includes(baseOf(k)));
  if (cat === 'oral') return ORAL_KEYS.slice();
  return [];
}

const formOfKey = (k) => (k.startsWith('lyo_') ? 'recon' : k.startsWith('rtu_') ? 'rtu' : 'oral');

// One row per compound (a compound sold as powder AND ready-to-use is one row with both forms).
// → [{ base, label, forms: { recon?, rtu?, oral? } }] sorted by label. Nothing is suggested: an
// empty query lists the category.
function compoundChoices({ tracking, query = '', t }) {
  const cats = (Array.isArray(tracking) && tracking.length ? tracking : ['peptides', 'hormones', 'glp1', 'oral']);
  const byBase = new Map();
  for (const cat of cats) {
    for (const key of categoryKeys(cat)) {
      const base = `${formOfKey(key) === 'oral' ? 'oral:' : ''}${baseOf(key)}`;
      const e = byBase.get(base) || { base, label: '', forms: {} };
      e.forms[formOfKey(key)] = key;
      if (!e.label || formOfKey(key) === 'recon') e.label = t(key);
      byBase.set(base, e);
    }
  }
  return [...byBase.values()]
    .filter((e) => Object.values(e.forms).some((key) => matchesQuery(query, key, t(key))))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function listTitleKey(tracking) {
  const list = Array.isArray(tracking) ? tracking : [];
  return list.length === 1 ? `ob_cmp_title_${list[0]}` : 'ob_cmp_title_any';
}

const FORM_ORDER = ['recon', 'rtu', 'oral'];
function pickCompound(protocol, entry) {
  const forms = { ...(entry && entry.forms) };
  const have = FORM_ORDER.filter((f) => forms[f]);
  return { ...(protocol || {}), base: entry.base, name: entry.label, forms, form: have.length === 1 ? have[0] : null, typed: false };
}

// A typed name, kept as written (trimmed). Only "Suplementos orais" picked → oral; an injectable is
// asked how it comes.
function typedCompound(protocol, text, tracking) {
  const name = String(text == null ? '' : text).trim();
  const onlyOral = Array.isArray(tracking) && tracking.length === 1 && tracking[0] === 'oral';
  return { ...(protocol || {}), base: null, name, forms: {}, form: onlyOral ? 'oral' : null, typed: true, typedOral: onlyOral };
}

function needsForm(p) {
  if (!p || !p.name) return false;
  if (p.typed) return !p.typedOral; // an injectable typed name: asked how it comes
  const f = p.forms || {};
  return !!(f.recon && f.rtu);
}

function compoundIdFor(p) {
  if (!p || !p.forms || !p.form) return null;
  return p.forms[p.form] || null;
}

// ── Vial and dose (OB-16) ──
function vialFields(form) {
  if (form === 'oral') return ['dose'];
  if (form === 'rtu') return ['amount', 'ml', 'dose'];
  return ['amount', 'water', 'dose'];
}
const pos = (text, language) => { const n = parseDecimal(text, language); return Number.isFinite(n) && n > 0; };
function vialReady(p, language) {
  if (!p) return false;
  if (p.vialUnknown) return true;
  return vialFields(p.form).every((k) => pos(p[k], language));
}
// The small vial: its label follows the typed amount ("20 mg"); the liquid rises with the diluent.
function vialPicture(p, language) {
  const n = parseDecimal(p && p.amount, language);
  const label = Number.isFinite(n) && n > 0 ? `${decimalText(n, language)} ${unitText((p && p.unit) || 'mg', language)}` : '';
  const liquid = p && p.form === 'rtu' ? p.ml : p && p.water;
  return { label, filled: pos(liquid, language) };
}

// ── Frequency and time (OB-17) ──
// The app's schedule is one interval of days (protocols.interval_days). "2 vezes por semana" and
// "Dias da semana" from the picture need a weekday schedule the app does not have: not offered
// (a deviation for the founder, docs/specs/onboarding-protocol.md OB-17).
const FREQUENCIES = [
  { key: 'daily', interval: 1, tKey: 'ob_freq_daily', subKey: 'ob_freq_daily_sub' },
  { key: 'alt', interval: 2, tKey: 'ob_freq_alt', subKey: 'ob_freq_alt_sub' },
  { key: 'weekly', interval: 7, tKey: 'ob_freq_weekly', subKey: 'ob_freq_weekly_sub' },
  { key: 'custom', interval: null, tKey: 'ob_freq_custom', subKey: 'ob_freq_custom_sub' },
];
const CUSTOM_INTERVALS = [3, 4, 5, 6, 10, 14];
function intervalOf(p) {
  const f = FREQUENCIES.find((x) => x.key === (p && p.freq));
  if (!f) return null;
  if (f.interval) return f.interval;
  const n = Number(p.interval);
  return Number.isInteger(n) && n >= 2 && n <= 60 ? n : null;
}
function frequencyReady(p) {
  if (!p || !intervalOf(p)) return false;
  if (p.freq === 'weekly' && !(Number.isInteger(p.weekday) && p.weekday >= 0 && p.weekday <= 6)) return false;
  return isClockTime(p.time);
}

// ── When she starts (OB-18) ──
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
const fromISO = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
function onOrAfterWeekday(d, wd) { return addDays(d, (wd - d.getDay() + 7) % 7); }

function startDateFor(p, now) {
  const today = day0(now);
  let base = today;
  if (p.startMode === 'later') base = fromISO(p.laterOn) || today;
  if (p.startMode === 'started') base = fromISO(p.startedOn) || today;
  if (p.freq === 'weekly' && Number.isInteger(p.weekday)) {
    let d = onOrAfterWeekday(base, p.weekday);
    // Already started: the first dose was on her day — snapped forward within the week, never past today.
    if (p.startMode === 'started' && d >= today) d = addDays(d, -7);
    base = d;
  }
  return localISO(base);
}

// The app's past-doses count for a start in the past (lib/pastDoses, the form's own rule).
function pastCount(p, now) {
  if (!p || p.startMode !== 'started') return 0;
  const interval = intervalOf(p);
  if (!interval || !isClockTime(p.time)) return 0;
  const ask = pastStartAsk({ protocol: { start_date: startDateFor(p, now), interval_days: interval, doses_per_day: 1, reminder_time: p.time, type: p.form }, vial: null, nowMs: now.getTime(), curveAsk: true });
  return ask ? ask.n : 0;
}
// "Quase todas" only with more than one dose (the form's rule, founder "3 b").
function pastAnswers(n) { return n > 1 ? ['yes', 'almost', 'no'] : ['yes', 'no']; }

function startReady(p, now) {
  if (!p || !['today', 'started', 'later'].includes(p.startMode)) return false;
  const today = localISO(day0(now));
  if (p.startMode === 'later') return !!fromISO(p.laterOn) && p.laterOn > today;
  if (p.startMode === 'started') {
    if (!fromISO(p.startedOn) || !(p.startedOn < today)) return false;
    return pastCount(p, now) === 0 || ['yes', 'almost', 'no'].includes(p.pastAnswer);
  }
  return true;
}

// ── The draft → the add-protocol form (OB-22) ──
function draftToForm(p, { now = new Date(), language } = {}) {
  const lang = language || 'en';
  const f = newProtocolForm(now);
  f.name = p.name || '';
  f.compoundId = compoundIdFor(p);
  f.type = p.form || 'recon';
  const unknown = !!p.vialUnknown;
  f.water = '';
  if (f.type === 'recon') {
    f.amount = unknown ? '' : (p.amount || ''); f.unit = p.unit || 'mg';
    f.water = unknown ? '' : (p.water || '');
  }
  if (f.type === 'rtu' && !unknown) {
    const amt = parseDecimal(p.amount, lang), ml = parseDecimal(p.ml, lang);
    f.concentrationUnit = p.unit || 'mg';
    if (amt > 0 && ml > 0) { f.concentration = inputNumber(Math.round((amt / ml) * 10000) / 10000, lang); f.vialMl = p.ml; }
  }
  f.dose = unknown ? '' : (p.dose || ''); f.doseUnit = p.doseUnit || 'mg';
  if (f.type === 'oral' && !unknown) {
    f.servingStrength = p.dose || ''; f.servingStrengthUnit = p.doseUnit || 'mg'; f.servingUnits = '1';
  }
  // PQ-14: the goals from her profile that map to this protocol (set at "Protocolo pronto").
  f.goals = Array.isArray(p.purpose) ? p.purpose.filter((k) => typeof k === 'string' && k) : [];
  f.intervalDays = intervalOf(p) || 1;
  f.dosesPerDay = 1;
  f.reminderTimes = [isClockTime(p.time) ? p.time : ''];
  const startDate = startDateFor(p, now);
  f.startDate = startDate;
  // The reconstituted vial's mix date: today when she starts today and the vial is in hand; otherwise
  // unknown (never a future day — the Edit vial rule refuses one).
  const mixedOn = f.type === 'recon' && !unknown && p.startMode === 'today' && startDate === localISO(day0(now)) ? startDate : null;
  return { form: f, startDate, skipVial: f.type === 'recon' && (unknown || !(pos(f.amount, lang) && pos(f.dose, lang))), mixedOn };
}

// ── The ready summary (OB-19) and the reminder line (OB-24) ──
const amountText = (v, unit, language) => `${decimalText(parseDecimal(v, language), language)}${NBSP}${unitText(unit || 'mg', language)}`;
function frequencyText(p, { t, language, timeFormat, weekdayName }) {
  const time = formatTime(p.time, language, timeFormat);
  if (p.freq === 'weekly') return t('ob_freq_weekly_on').replace('{day}', weekdayName(p.weekday, 'short')).replace('{time}', time);
  if (p.freq === 'daily') return t('ob_freq_daily_on').replace('{time}', time);
  if (p.freq === 'alt') return t('ob_freq_alt_on').replace('{time}', time);
  return t('ob_freq_custom_on').replace('{n}', String(intervalOf(p))).replace('{time}', time);
}
// purpose: the protocol goal keys from her profile (lib/protocolPurpose purposeFromProfile) → "Para: …".
function summaryRows(p, { t, language, timeFormat, now, weekdayName, dateText, purpose }) {
  const rows = [{ key: 'compound', label: t('ob_sum_compound'), value: p.name }];
  if (Array.isArray(purpose) && purpose.length) rows.push({ key: 'purpose', label: t('ob_sum_for'), value: purpose.map((k) => t(k) || k).join(', ') });
  if (!p.vialUnknown) {
    if (p.form === 'recon') rows.push({ key: 'vial', label: t('ob_sum_vial_label'), value: t('ob_sum_vial').replace('{amount}', amountText(p.amount, p.unit, language)).replace('{water}', amountText(p.water, 'mL', language)) });
    if (p.form === 'rtu') rows.push({ key: 'vial', label: t('ob_sum_vial_label'), value: t('ob_sum_vial_rtu').replace('{amount}', amountText(p.amount, p.unit, language)).replace('{ml}', amountText(p.ml, 'mL', language)) });
    rows.push({ key: 'dose', label: t('ob_sum_dose'), value: amountText(p.dose, p.doseUnit, language) });
  }
  rows.push({ key: 'frequency', label: t('ob_sum_frequency'), value: frequencyText(p, { t, language, timeFormat, weekdayName }) });
  const start = startDateFor(p, now);
  if (p.startMode === 'started') {
    const n = pastCount(p, now);
    rows.push({ key: 'since', label: t('ob_sum_since'), value: n > 0 ? t(pluralKey('ob_sum_since_n', n, language)).replace('{date}', dateText(start)).replace('{n}', String(n)) : dateText(start) });
  } else {
    rows.push({ key: 'since', label: t('ob_sum_from'), value: dateText(start) });
  }
  return rows;
}
function reminderLine(p, { t, timeFormat, language, weekdayName }) {
  const time = formatTime(p.time, language, timeFormat);
  const key = p.freq === 'weekly' ? 'ob_rem_weekly' : p.freq === 'daily' ? 'ob_rem_daily' : p.freq === 'alt' ? 'ob_rem_alt' : 'ob_rem_custom';
  return t(key).replace('{day}', p.freq === 'weekly' ? weekdayName(p.weekday, 'long') : '').replace('{time}', time).replace('{n}', String(intervalOf(p) || '')).replace('{compound}', p.name);
}

// ── Into the account (OB-22 / OB-23 / OP-2) ──
const NEW_ACCOUNT_SLACK_MS = 10 * 60 * 1000;
function isExpired(draft, nowMs) {
  const exp = Date.parse(draft && draft.expiresAt);
  return !Number.isFinite(exp) || nowMs > exp;
}
// → 'none' (nothing to save) | 'drop' (expired) | 'check' (a save was cut off half-way: look for it
// before writing again) | 'insert' (the account she just created in this flow) | 'ask' (keep or
// discard, OP-2) | 'limit' (keeping it would go above the free limit: discard or Premium).
function applyDecision({ draft, user, nowMs, activeCount = 0, limit = 3, premium = false }) {
  if (!draft || draft.skipped || !draft.protocol || !draft.protocol.name) return 'none';
  if (isExpired(draft, nowMs)) return 'drop';
  if (draft.applyingAt) return 'check';
  if (!premium && activeCount >= limit) return 'limit';
  const created = Date.parse(user && user.created_at);
  const started = Date.parse(draft.createdAt);
  const isNew = Number.isFinite(created) && Number.isFinite(started) && created >= started - NEW_ACCOUNT_SLACK_MS;
  if (isNew && draft.handoffAt && activeCount === 0) return 'insert';
  return 'ask';
}

// ── The 15-day builder (OB-26) ──
const BUILDER_MIN_DAYS = 15;
const BUILDER_KEY = 'protocol_builder_shown_at';
// everCount: every protocol of the account on the phone — active, ended, deleted and the
// tombstones of the permanently deleted. synced: this account's data has arrived (the first
// import / sync finished), so an empty phone is not read as "never created a protocol".
function builderEligible({ user, nowMs, everCount, synced }) {
  if (!user || !synced || everCount !== 0) return false;
  const meta = user.user_metadata || {};
  if (meta[BUILDER_KEY]) return false;
  const created = Date.parse(user.created_at);
  return Number.isFinite(created) && nowMs - created >= BUILDER_MIN_DAYS * DAY_MS;
}
// The account write: one key — Supabase merges user_metadata's top-level keys, so nothing else is
// rewritten (CLAUDE.md "writes merge, never clobber").
function builderShownPatch(nowISO) { return { [BUILDER_KEY]: nowISO }; }

// ── The storage (AsyncStorage-shaped: getItem / setItem / removeItem) ──
function createDraftStore(storage) {
  async function read() {
    try { const s = await storage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  async function write(d) { try { await storage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* best effort */ } }
  return {
    async load(nowMs = Date.now()) {
      const d = await read();
      if (!d) return null;
      if (isExpired(d, nowMs)) { try { await storage.removeItem(DRAFT_KEY); } catch { /* next time */ } return null; }
      return d;
    },
    // Merges (an undefined never clobbers an earlier step). The first save starts the clock.
    async save(patch, nowISO = new Date().toISOString()) {
      const cur = (await read()) || null;
      const base = cur && !isExpired(cur, Date.parse(nowISO)) ? cur : { v: 1, createdAt: nowISO, expiresAt: new Date(Date.parse(nowISO) + DRAFT_TTL_DAYS * DAY_MS).toISOString(), help: [], protocol: null, skipped: false, handoffAt: null };
      const next = { ...base, updatedAt: nowISO };
      for (const [k, v] of Object.entries(patch || {})) if (v !== undefined) next[k] = v;
      await write(next);
      return next;
    },
    async markHandoff(nowISO = new Date().toISOString()) { const d = await read(); if (d) await write({ ...d, handoffAt: nowISO }); },
    async markApplying(nowISO = new Date().toISOString()) { const d = await read(); if (d) await write({ ...d, applyingAt: nowISO }); },
    async clear() { try { await storage.removeItem(DRAFT_KEY); } catch { /* best effort */ } },
  };
}

module.exports = {
  DRAFT_KEY, DRAFT_TTL_DAYS, GLP1_BASES, categoryKeys, compoundChoices, listTitleKey, pickCompound, typedCompound,
  needsForm, compoundIdFor, vialFields, vialReady, vialPicture, FREQUENCIES, CUSTOM_INTERVALS, intervalOf,
  frequencyReady, startDateFor, pastCount, pastAnswers, startReady, draftToForm, summaryRows, frequencyText,
  reminderLine, isExpired, applyDecision, BUILDER_MIN_DAYS, BUILDER_KEY, builderEligible, builderShownPatch,
  createDraftStore, amountText,
};
