'use strict';
// AD-99 (founder 2026-10-20, picture docs/design/ad99-ad100-labs.html B / P2, spec
// docs/specs/ad99-ad100-labs.md LB-1..LB-7): the line under the lab journal's title with the AI
// scans this account used this month. Pure CommonJS (node --test).
//
// The number is the SERVER's: supabase/functions/extract-bloodwork counts ai_scan_usage (this
// user, this UTC month, labs + vaccine cards + vials together — the one budget it enforces) and
// answers { used, renews_on } to { mode: 'usage' }. The app keeps no counter of its own. No answer
// (offline, an error, a server without the usage mode) → null → no line: never a guessed number.
const { pluralKey } = require('./plural');
const { MONTHS_SHORT } = require('./localeFormat');

const FREE_SCANS = 3; // the server's FREE_SCAN_LIMIT (extract-bloodwork/quota.ts); a test keeps them equal
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// { data, error } from supabase.functions.invoke → { used, renewsOn } or null.
function readScanUsage(res) {
  if (!res || res.error || !res.data || typeof res.data !== 'object') return null;
  const used = res.data.used;
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0) return null;
  const r = res.data.renews_on;
  return { used, renewsOn: typeof r === 'string' && ISO_DAY.test(r) ? r : null };
}

// Asks the scan function in usage mode (no file is sent). Never throws.
async function fetchScanUsage(invoke) {
  try {
    return readScanUsage(await invoke('extract-bloodwork', { body: { mode: 'usage' } }));
  } catch {
    return null;
  }
}

// The renewal month (0-11): the server's next month start, else the next UTC month from `now`.
function renewMonth(renewsOn, now) {
  if (typeof renewsOn === 'string' && ISO_DAY.test(renewsOn)) return Number(renewsOn.slice(5, 7)) - 1;
  return (now.getUTCMonth() + 1) % 12;
}

// The line's two parts. Free: "2 de 3 leituras usadas este mês" + "(exames, vacinas e frascos) ·
// renovam em 1º de nov."; `full` at 3 of 3 (the count is drawn in attention, bold). Premium (P2):
// "5 leituras usadas este mês" + "(exames, vacinas e frascos)" — never the 20, never the renewal
// (AD-69: Premium strings carry no scan limit). null without a number, and null while Premium is
// not known yet (AD-99 review: a Premium account never sees the free "3 de 3 … renovam" first).
function scanUsageLine(input) {
  if (!input || typeof input.used !== 'number' || !Number.isInteger(input.used) || input.used < 0) return null;
  if (typeof input.premium !== 'boolean') return null;
  const { used, renewsOn, premium, language, t } = input;
  const now = input.now || new Date();
  const kinds = t('blood_scans_kinds');
  if (premium) {
    return { count: t(pluralKey('blood_scans_used', used, language)).replace('{n}', String(used)), rest: kinds, full: false };
  }
  const n = Math.min(used, FREE_SCANS); // more rows than the free budget (Premium earlier this month) never reads "5 de 3"
  const months = MONTHS_SHORT[language] || MONTHS_SHORT.en;
  const count = t(pluralKey('blood_scans_used_of', n, language)).replace('{n}', String(n)).replace('{limit}', String(FREE_SCANS));
  const renew = t('blood_scans_renew').replace('{month}', months[renewMonth(renewsOn, now)]);
  return { count, rest: `${kinds} · ${renew}`, full: n >= FREE_SCANS };
}

// AD-99 review: the count is asked only while the lab journal (and so the line) is on screen — the
// phone's lab section, or the Fold's right page showing the journal (not a test, a marker, the
// vaccines or Dose accumulation). `rightPage` = the right page's type on the Fold.
function scanUsageShown({ book, section, rightPage } = {}) {
  return book ? rightPage === 'labs' : section === 'labs';
}

module.exports = { FREE_SCANS, readScanUsage, fetchScanUsage, scanUsageLine, scanUsageShown };
