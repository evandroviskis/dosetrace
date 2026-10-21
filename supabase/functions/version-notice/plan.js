// A-127 UN-6 (founder 2026-10-15; docs/specs/update-notice.md): the version push. Pure — imported by
// index.ts (Deno) and by __tests__/updateNotice*.test.js (node).
//
// App Store guideline 4.5.4 (followed 100%): a "new version" push is promotional, so it goes ONLY to
// people who said yes (user_metadata.version_news === true — asked once in the invitation, then
// Settings › Notificações › "Novidades do DoseTrace"). One per person per version (the
// app_release_pushes ledger), daytime on the person's own clock, never in Silent mode, only to a
// phone below the latest version, and only SEND_AFTER_MS after latest_version was set (so a latest
// set before the store has the version does not spend the one push). Title "Nova versão do
// DoseTrace", body = the first release line, both in the language on the TOKEN row (A-156:
// _shared/pushLanguage). Tapping it opens the invitation (lib/updateRules isUpdateTap).
import { tokenLanguage } from '../_shared/pushLanguage.js';

export const TYPE = 'app_update';
export const CHANNEL = 'app-news';
// 10:00 to 19:59 on the person's clock.
export const DAY_START_HOUR = 10;
export const DAY_END_HOUR = 20;
// The push waits this long after latest_version changed (review round 1, item 5).
export const SEND_AFTER_MS = 24 * 3600 * 1000;

// The in-app title (i18n upd_title), the same words in the push.
export const TITLES = {
  en: 'A new version of DoseTrace',
  es: 'Nueva versión de DoseTrace',
  pt: 'Nova versão do DoseTrace',
  fr: 'Nouvelle version de DoseTrace',
  de: 'Neue Version von DoseTrace',
  it: 'Nuova versione di DoseTrace',
};

const VERSION_RE = /^\d+(\.\d+){0,3}$/;
export function versionBelow(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !VERSION_RE.test(a) || !VERSION_RE.test(b)) return false;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] || 0;
    const q = y[i] || 0;
    if (p !== q) return p < q;
  }
  return false;
}

// The person's local hour; an unreadable zone is night (never wake anyone up on a guess).
export function isDaytime(now, timezone) {
  if (!timezone || typeof timezone !== 'string') return false;
  let hour;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
    hour = Number((parts.find((p) => p.type === 'hour') || {}).value);
  } catch { return false; }
  return Number.isFinite(hour) && hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

function firstLine(notes, lang) {
  const pick = (l) => (notes && Array.isArray(notes[l]) ? notes[l].find((s) => typeof s === 'string' && s.trim()) : null);
  const s = pick(lang) || pick('en');
  return s ? s.trim() : null;
}

export const sentKey = (userId, platform, version) => `${userId}|${platform}|${version}`;

function latestOf(rel, now) {
  const latest = rel && typeof rel.latest_version === 'string' ? rel.latest_version.trim() : null;
  if (!latest || !VERSION_RE.test(latest)) return null;
  const setAt = rel.latest_set_at ? Date.parse(rel.latest_set_at) : NaN;
  if (!Number.isFinite(setAt) || now.getTime() - setAt < SEND_AFTER_MS) return null;
  return latest;
}

// Everything that needs no account read (review round 1, item 8): the version is ready to announce,
// the phone is below it, not already sent, daytime there, one token per person (the most recently
// registered one). → [token + { _release }]
export function pushCandidates({ releases, tokens, sent, now }) {
  const out = [];
  for (const rel of releases || []) {
    const latest = latestOf(rel, now);
    if (!latest) continue;
    const best = new Map();
    for (const t of tokens || []) {
      if (!t || t.platform !== rel.platform || !t.expo_token || !t.user_id) continue;
      const cur = best.get(t.user_id);
      if (!cur || String(t.updated_at || '') > String(cur.updated_at || '')) best.set(t.user_id, t);
    }
    for (const [uid, t] of best) {
      if (!versionBelow(t.app_version, latest)) continue; // already there (or unknown: never asked)
      if (sent && sent.has(sentKey(uid, rel.platform, latest))) continue;
      if (!isDaytime(now, t.timezone)) continue;
      out.push({ ...t, _release: { platform: rel.platform, version: latest, notes: rel.notes } });
    }
  }
  return out;
}

// users: Map user_id → { version_news, silent_mode } (only what the rule needs).
export function versionMessages({ releases, tokens, users, sent, now }) {
  const out = [];
  for (const t of pushCandidates({ releases, tokens, sent, now })) {
    const meta = (users && users.get(t.user_id)) || null;
    if (!meta || meta.version_news !== true) continue; // never without the yes (4.5.4)
    if (meta.silent_mode === true) continue;
    const lang = tokenLanguage(t);
    const body = firstLine(t._release.notes, lang);
    if (!body) continue; // nothing to say: no push
    out.push({
      to: t.expo_token,
      title: TITLES[lang],
      body,
      sound: 'default',
      channelId: CHANNEL,
      data: { type: TYPE, version: t._release.version },
      _claim: { user_id: t.user_id, platform: t._release.platform, version: t._release.version },
    });
  }
  return out;
}

// Tokens Expo says no longer exist (app uninstalled) — removed so they stop being sent to.
export function deadTokens(slice, receipts) {
  const dead = [];
  for (let i = 0; i < (slice || []).length; i++) {
    const r = (receipts || [])[i];
    if (r && r.details && r.details.error === 'DeviceNotRegistered') dead.push(slice[i].to);
  }
  return dead;
}
