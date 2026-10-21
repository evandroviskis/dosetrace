'use strict';
// A-127 in-app update notice (docs/specs/update-notice.md UN-1..UN-7; picture
// docs/design/a127-update-notice.html; ledger 2026-10-15 "an invitation by default, required only
// when the founder decides"). The pure rules: plain CommonJS, no React Native, so every rule runs
// under node --test.
//
// The server row (supabase/migrations/20261022000000_app_releases.sql, one per platform):
//   latest_version — below it: the invitation ("Agora não" always there);
//   min_version    — below it: the full screen that cannot be closed (UN-4);
//   notes          — { en: ['line', …], pt: […], … } "O que há de novo", written per version;
//   reason         — { en: 'line', … } the founder's reason line on the required screen.
// A-119 (DL-105) keeps its own server refusal floor (device_policy.min_app_version → DT003 and
// device_status min_version, stored by lib/deviceFlow): below it the SAME required screen shows.

const { versionBelow } = require('./deviceRules');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const DAY_MS = 24 * 3600 * 1000;
// "Depois de 'Agora não', aparece mais uma vez 7 dias depois" (picture, decided by logic).
const AGAIN_AFTER_MS = 7 * DAY_MS;
const MAX_SHOWS = 2;
const MAX_LINES = 5;

const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const version = (v) => (typeof v === 'string' && VERSION_RE.test(v.trim()) ? v.trim() : null);

function cleanLines(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, MAX_LINES);
}
function cleanText(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// → { platform, latest, min, notes: { lang: [lines] }, reason: { lang: text } } | null
function parseRelease(row, platform) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (platform && row.platform !== platform) return null;
  const notes = {};
  const reason = {};
  const n = row.notes && typeof row.notes === 'object' && !Array.isArray(row.notes) ? row.notes : {};
  const r = row.reason && typeof row.reason === 'object' && !Array.isArray(row.reason) ? row.reason : {};
  for (const l of LANGS) {
    const lines = cleanLines(n[l]);
    if (lines.length) notes[l] = lines;
    const text = cleanText(r[l]);
    if (text) reason[l] = text;
  }
  return { platform: row.platform || platform || null, latest: version(row.latest_version), min: version(row.min_version), notes, reason };
}

const langOf = (l) => (LANGS.includes(l) ? l : 'en');
// The person's language, else English (the founder writes English first), else nothing.
function linesFor(release, language) {
  if (!release || !release.notes) return [];
  return release.notes[langOf(language)] || release.notes.en || [];
}
function reasonFor(release, language) {
  if (!release || !release.reason) return null;
  return release.reason[langOf(language)] || release.reason.en || null;
}

// UN-4: below the founder's per-platform minimum, or below the server's refusal floor (A-119).
function isRequired(appVersion, release, deviceMin) {
  if (!version(appVersion)) return false;
  if (release && release.min && versionBelow(appVersion, release.min)) return true;
  if (version(deviceMin) && versionBelow(appVersion, deviceMin)) return true;
  return false;
}

// The phone's calendar day ("nunca mais de uma vez por dia").
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// seen = { version, shows, lastAt } — the latest version this phone invited to, how many times and
// when last (any version). Stamped when the invitation SHOWS (a kill on the sheet still counts).
function markShown(seen, ver, now) {
  const same = seen && seen.version === ver;
  return { version: ver, shows: (same ? seen.shows || 0 : 0) + 1, lastAt: now };
}

// UN-2 / UN-6. → { show, version, reason }
function inviteDecision({ appVersion, release, deviceMin = null, seen = null, now, forced = false }) {
  const latest = release && release.latest;
  if (!latest || !version(appVersion) || !versionBelow(appVersion, latest)) return { show: false, reason: 'current' };
  if (isRequired(appVersion, release, deviceMin)) return { show: false, reason: 'required' };
  if (forced) return { show: true, version: latest, reason: 'push' };
  // A showing stamped more than a day ahead of now was made with a clock that was ahead: unknown.
  let last = seen && Number.isFinite(seen.lastAt) ? seen.lastAt : null;
  if (last != null && last > now + DAY_MS) last = null;
  // Once a calendar day at most; a clock moved back a little (before the last showing) waits too.
  if (last != null && (now < last || dayKey(now) === dayKey(last))) return { show: false, reason: 'today' };
  const same = seen && seen.version === latest;
  const shows = same ? seen.shows || 0 : 0;
  if (shows === 0) return { show: true, version: latest, reason: 'new' };
  if (shows >= MAX_SHOWS) return { show: false, reason: 'done' };
  if (last == null || now - last >= AGAIN_AFTER_MS) return { show: true, version: latest, reason: 'again' };
  return { show: false, reason: 'wait' };
}

// UN-5: asked once. An answer in the account (any phone) or stored on this phone for this account
// ends the question; afterwards it lives only in Settings › Notificações.
function askOptIn({ meta, asked, userId }) {
  if (meta && typeof meta.version_news === 'boolean') return false;
  if (asked && asked.userId === userId) return false;
  return true;
}
// Off unless the person said yes (App Store guideline 4.5.4).
function optedIn(meta) {
  return !!meta && meta.version_news === true;
}

// UN-6: the version push (supabase/functions/version-notice) carries { type: 'app_update' }.
function isUpdateTap(resp) {
  const req = resp && resp.notification && resp.notification.request;
  let data = (req && req.content && req.content.data) || null;
  if (data && typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { data = null; } }
  return !!data && data.type === 'app_update';
}

// UN-2 "never over another sheet or before the first screen", and the required screen never pulled
// from under something the person is typing. rootState: the root navigator's state.
//   'invite'   — only on the tab screens (Main › MainTabs), with no sheet open;
//   'required' — before anything is drawn, or on a screen with nothing in progress (the tabs, the
//                sign-in / onboarding screens, which keep their own drafts), with no sheet open.
// An unlock (required → not required) is always allowed.
const CALM_ROOTS = new Set(['Auth', 'OnboardingFlow']);
function screenAllows({ rootState, sheets = 0, kind }) {
  if (sheets > 0) return false;
  const focused = rootState && Array.isArray(rootState.routes) ? rootState.routes[rootState.index || 0] : null;
  if (!focused) return kind === 'required';
  if (focused.name === 'Main') {
    const inner = focused.state;
    const top = inner && Array.isArray(inner.routes) ? inner.routes[inner.index || 0] : null;
    // Main's stack opens on MainTabs; no inner state yet means nothing else was pushed.
    return !top || top.name === 'MainTabs';
  }
  return kind === 'required' && CALM_ROOTS.has(focused.name);
}

module.exports = {
  LANGS, DAY_MS, AGAIN_AFTER_MS, MAX_SHOWS,
  parseRelease, linesFor, reasonFor, isRequired, markShown, inviteDecision, askOptIn, optedIn, isUpdateTap, dayKey, screenAllows,
};
