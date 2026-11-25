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
// docs/specs/adherence-report.md AR-17/AR-18 + docs/specs/profile-synced.md PS-11 (founder 2026-11-24): the
// profile keeps two names. display_name is the nickname ("Como você quer ser chamado ou chamada"), shown in the
// app; report_name is the optional full name, printed only in the reports she exports for someone else
// (adherence report, labs / vaccines PDF). Never "full_name": Google writes that key by itself. report_name
// starts empty for everyone and is never filled from display_name, Apple or Google. Screens read and write both
// names ONLY through these functions. They read the user the app gives every reader (getCachedUser: the
// account_profile table laid over user_metadata, lib/profile) or a metadata object; writes go through the one
// updateUser wrapper (user_metadata merge first, then the synced table — lib/supabase, lib/profileWrite).
const REPORT_NAME_KEY = 'report_name';
function metaOf(src) {
  if (!src || typeof src !== 'object') return {};
  return src.user_metadata && typeof src.user_metadata === 'object' ? src.user_metadata : src;
}
const clean = (v) => (v == null ? '' : String(v).trim());
// The nickname / the full name of this user ('' when none).
function getNickname(src) { return clean(metaOf(src).display_name); }
function getReportName(src) { return clean(metaOf(src)[REPORT_NAME_KEY]); }
// The keys Edit profile merges into its save. The nickname is required there (the save checks it first). The
// full name goes in ONLY when the person changed the field from the value loaded — an untouched field, or one
// read before the profile arrived, never clears a stored name; erasing it herself writes null (PS-11: cleared).
function nicknameFields(typed) { return { display_name: clean(typed) || null }; }
function reportNameFields(typed, loaded) {
  const next = clean(typed);
  return next === clean(loaded) ? {} : { [REPORT_NAME_KEY]: next || null };
}
// AR-17b (founder 2026-11-24): Edit profile asks "Nome completo" first, then the nickname. While she types
// the full name, the nickname follows it with the FIRST name ("Evandro Santos" → "Evandro"), but only when the
// nickname was empty as the edit began, and it stops following as soon as she edits the nickname herself (erase
// or write). An existing nickname is never rewritten. The onboarding name step reuses these.
function firstNameOf(full) {
  const words = clean(full).split(/\s+/).filter(Boolean);
  return words.length ? words[0] : '';
}
// Does the nickname follow the full name in this edit? Only an empty one (an existing nickname stays).
function nicknameFollows(nicknameAtStart) { return !clean(nicknameAtStart); }
// The nickname after the full name changed: the first name while following, else unchanged.
function nicknameAfterFullName({ following, nickname, fullName }) {
  return following ? firstNameOf(fullName) : nickname;
}
// The sheet before a report (AR-19): saves the full name alone — a merge write of one key through the one
// updateUser wrapper, every other profile key stays as it is. Never throws: → { ok: true, value } or
// { ok: false, error }. Nothing typed writes nothing ({ ok: false }): the sheet never clears a stored name;
// clearing is Edit profile's erase (reportNameFields → null). deps.updateUser({ data }) is for the tests; the
// app uses supabase.auth.updateUser (lazily required: this file is imported by it).
// deps.saveEdit(data) (integration 2026-11-24, PS-18): the offline profile path the screens pass (lib/profile
// saveProfileFields → saveProfileEdit): without internet the name is kept on this phone and sent later
// ({ ok: true, value, kept: true }); a refusal (A-119 DT001, any 4xx) is { ok: false }.
async function saveReportName(name, deps = {}) {
  const value = clean(name);
  if (!value) return { ok: false };
  if (typeof deps.saveEdit === 'function') {
    let r;
    try { r = await deps.saveEdit({ [REPORT_NAME_KEY]: value }); } catch (e) { return { ok: false, error: e }; }
    if (!r || r.status === 'failed') return { ok: false, error: (r && r.error) || new Error('save failed') };
    return { ok: true, value, kept: r.status === 'kept' };
  }
  const updateUser = deps.updateUser || ((a) => require('./supabase').supabase.auth.updateUser(a));
  let res;
  try { res = await updateUser({ data: { [REPORT_NAME_KEY]: value } }); } catch (e) { return { ok: false, error: e }; }
  if (!res || res.error) return { ok: false, error: (res && res.error) || new Error('save failed') };
  return { ok: true, value };
}
module.exports = {
  nameToFill, signInName, validBirthYear, validBirthMonth, birthMonthIndex,
  REPORT_NAME_KEY, getNickname, getReportName, nicknameFields, reportNameFields, saveReportName,
  firstNameOf, nicknameFollows, nicknameAfterFullName,
};
