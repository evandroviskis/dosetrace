'use strict';
// DV-084 (DL-57): the name a sign-in brings (Apple's first-authorization name, Google's profile name) fills
// display_name only when it is empty — never over a name the person already has or changed in the app.
// → the name to write, or null. Pure.
function nameToFill(meta, candidate) {
  const have = meta && meta.display_name ? String(meta.display_name).trim() : '';
  const next = candidate ? String(candidate).trim() : '';
  return !have && next ? next : null;
}
// DV-162: the profile gate counts a birth date only when it is real — a 4-digit year from 1900 to this year and
// a month number (1–12 as stored; 0 accepted from older data). Old values like "abc" are asked again.
function validBirthYear(v, now = new Date()) {
  if (v == null || !/^\d{4}$/.test(String(v).trim())) return false;
  const y = Number(v);
  return y >= 1900 && y <= now.getFullYear();
}
function validBirthMonth(v) {
  if (v == null || !/^\d{1,2}$/.test(String(v).trim())) return false;
  const m = Number(v);
  return m >= 0 && m <= 12;
}
// Gate B review 2026-10-31 (B1): a sign-up right after onboarding — the name typed there (the fresh stash,
// lib/onboardingStore) wins over the provider's; the provider's name fills only when nothing was typed. Never
// over a stored name. → the name to write, or null. Pure.
function signInName({ meta, providerName = null, stash = null, stashFresh = false }) {
  const typed = stashFresh && stash && stash.display_name ? String(stash.display_name).trim() : '';
  return nameToFill(meta, typed || providerName);
}
// Founder 2026-10-31: the stored birth month as a 0–11 index. Old versions stored 0-based (January = 0), today 1–12;
// only 0 is unambiguous, so 0 = January and 1–12 = that month. Anything else is unknown (null).
function birthMonthIndex(v) {
  if (v == null || !/^\d{1,2}$/.test(String(v).trim())) return null;
  const n = Number(v);
  if (n === 0) return 0;
  return n >= 1 && n <= 12 ? n - 1 : null;
}
// Profile synced (docs/specs/profile-synced.md PS-11) + the adherence report (docs/design/relatorio-adesao.html,
// founder 2026-11-24): the nickname is display_name ('Como você quer ser chamado ou chamada'); the full
// name for reports is report_name (optional, starts empty; never copied from display_name nor from the
// Apple / Google name — Google itself writes full_name, hence the other key). Both are read from the
// user the app gives every reader (getCachedUser: the account_profile table laid over user_metadata,
// lib/profile) or from a metadata object. Pure except saveReportName, which writes through the one
// updateUser wrapper (user_metadata merge first, then the synced table — lib/supabase, lib/profileWrite).
function metaOf(src) {
  if (!src || typeof src !== 'object') return {};
  return src.user_metadata && typeof src.user_metadata === 'object' ? src.user_metadata : src;
}
function getNickname(src) {
  const v = metaOf(src).display_name;
  return v == null ? '' : String(v).trim();
}
function getReportName(src) {
  const v = metaOf(src).report_name;
  return v == null ? '' : String(v).trim();
}
// → { ok, value } (value: the name stored, null when cleared) | { ok: false, error }. deps.updateUser:
// for tests; the app uses supabase.auth.updateUser (lazily required: this file is imported by it).
async function saveReportName(name, deps = {}) {
  const value = name == null ? null : (String(name).trim() || null);
  const updateUser = deps.updateUser || ((a) => require('./supabase').supabase.auth.updateUser(a));
  let res;
  try { res = await updateUser({ data: { report_name: value } }); } catch (e) { return { ok: false, error: e }; }
  if (!res || res.error) return { ok: false, error: (res && res.error) || new Error('save failed') };
  return { ok: true, value };
}
module.exports = { nameToFill, signInName, validBirthYear, validBirthMonth, birthMonthIndex, getNickname, getReportName, saveReportName };
