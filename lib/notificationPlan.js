'use strict';
// Pure, side-effect-free planning for dose reminders and the morning summary.
// No native modules or DB access here, so it can be unit-tested under `node --test`.
// notifications.js turns these plans into scheduled OS notifications.
//
// All dates are handled as local-midnight "YYYY-MM-DD" keys. That format sorts
// and compares correctly as plain strings, which keeps the lookahead logic simple.

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// Local-date key for a Date, e.g. "2026-08-11".
function ymd(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Parse a "YYYY-MM-DD" key back to a local-midnight Date.
function parseYmd(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Whole days from key a to key b (b - a). Negative if b is before a.
function dayDiff(aKey, bKey) {
  return Math.round((parseYmd(bKey) - parseYmd(aKey)) / 86400000);
}

// Due-dose date keys for one protocol within [fromKey, fromKey + horizonDays).
// Respects start_date, interval_days and an optional finite schedule_total.
function dueDateKeys(protocol, fromKey, horizonDays) {
  const interval = Math.max(1, protocol.interval_days || 1);
  const total = protocol.schedule_total || 0; // 0 / null = open-ended
  const start = parseYmd(protocol.start_date || fromKey);
  const from = parseYmd(fromKey);
  const end = addDays(from, horizonDays); // exclusive upper bound

  const keys = [];
  const cursor = new Date(start);
  let idx = 0;
  let guard = 0;
  while (cursor < end && guard++ < 4000) {
    if (total && idx >= total) break;
    if (cursor >= from) keys.push(ymd(cursor));
    idx++;
    cursor.setDate(cursor.getDate() + interval);
  }
  return keys;
}

// Reminder times of a protocol as [{ hour, minute }] (08:00 when none are set). The
// server push sender has the same function (send-reminders/plan.ts reminderSlots).
function reminderTimes(reminderTime) {
  if (!reminderTime) return [{ hour: 8, minute: 0 }];
  return String(reminderTime).split(',').filter(Boolean).map((t) => {
    const [h, m] = t.split(':').map(Number);
    return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
  });
}

// Per-day morning-summary plan for the next `windowDays` days.
// Each entry is one of:
//   { dateKey, kind: 'due',   list: [names] }   — doses are due that day
//   { dateKey, kind: 'next',  days }            — nothing that day; next dose is `days` (>=2) away
//   { dateKey, kind: 'next1' }                  — nothing that day; next dose is tomorrow
//   { dateKey, kind: 'none' }                   — nothing that day and nothing upcoming (stay quiet)
// `horizonDays` bounds how far ahead the "next dose" lookahead reaches.
function morningSummaryPlan(protocols, todayKey, windowDays, horizonDays) {
  const dueByDay = new Map();
  for (const p of (protocols || [])) {
    for (const k of dueDateKeys(p, todayKey, horizonDays)) {
      if (!dueByDay.has(k)) dueByDay.set(k, []);
      dueByDay.get(k).push(p.name || '');
    }
  }
  const allDueKeys = [...dueByDay.keys()].sort();

  const plans = [];
  for (let i = 0; i < windowDays; i++) {
    const dayKey = ymd(addDays(parseYmd(todayKey), i));
    const names = dueByDay.get(dayKey);
    if (names && names.length) {
      plans.push({ dateKey: dayKey, kind: 'due', list: names.filter(Boolean) });
      continue;
    }
    const next = allDueKeys.find((k) => k > dayKey);
    if (!next) {
      plans.push({ dateKey: dayKey, kind: 'none' });
    } else {
      const days = dayDiff(dayKey, next);
      plans.push(days === 1 ? { dateKey: dayKey, kind: 'next1' } : { dateKey: dayKey, kind: 'next', days });
    }
  }
  return plans;
}

// Days (local "YYYY-MM-DD", ascending) to send the 20:00 "anything else
// today?" question, looking `windowDays` calendar days ahead from todayKey.
// Rule (founder 2026-09-27, FL-18/42): while the reality check is OPEN — from its
// start until the user weighs in or stops it, including past day 21 (the check
// stays open until the weigh-in) — once a day at 20:00, unless the user already
// closed that local day ("Nothing else today" / "that's it"). Logging food no
// longer cancels the evening's question, and there is no every-other-day backoff.
// The caller passes no start when no check is open.
function foodNudgeDays(startKey, todayKey, closedKeys, windowDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startKey)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayKey))) return [];
  const closed = closedKeys instanceof Set ? closedKeys : new Set(closedKeys || []);
  const firstKey = todayKey < startKey ? startKey : todayKey;
  const out = [];
  for (let i = 0; i < windowDays; i++) {
    const d = ymd(addDays(parseYmd(firstKey), i));
    if (closed.has(d)) continue;
    out.push(d);
  }
  return out;
}

// The 8 PM question only while the user can log food (FL-41): none when locked,
// and not past the last day logging stays open (end of free days / grace week).
function remindersForAccess(days, access) {
  if (!access || !access.canLog) return [];
  if (!access.until || access.mode === 'premium') return days;
  return (days || []).filter((d) => d <= access.until);
}

// Local day a food reminder is about: its data.dayKey, else its id
// ("food-log-2026-09-27"), else null.
function foodReminderDay(id, data) {
  const k = data && typeof data.dayKey === 'string' ? data.dayKey : null;
  if (k && /^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
  const m = /^(?:snz-)?food-log-(\d{4}-\d{2}-\d{2})$/.exec(String(id || ''));
  return m ? m[1] : null;
}

// Where a tap on the 20:00 food reminder goes (FL-18/37) — the running listener AND
// the launch path (app was fully closed) both use this. Every entry point opens the
// ONE food chat (the 'FoodChat' route): body tap → the chat with that evening's
// 3-button question about the reminder's day; "Log it" → the chat's composer;
// "Nothing else today" / snooze → no navigation (lib/notificationActions).
// Returns FoodChat params or null (not a food reminder).
const FOOD_NO_NAV = new Set(['FOOD_DAY_DONE', 'SNOOZE_HOUR', 'SNOOZE_TOMORROW', 'MARK_TAKEN']);
function foodTapParams(resp, nowMs) {
  const req = (resp && resp.notification && resp.notification.request) || {};
  let data = (req.content && req.content.data) || {};
  if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
  if (!data || data.type !== 'food_log') return null;
  const action = resp.actionIdentifier;
  if (FOOD_NO_NAV.has(action)) return null;
  if (action === 'FOOD_LOG_IT') return { logIt: nowMs };
  return { eveningDay: foodReminderDay(req.identifier, data) || null, nonce: nowMs };
}
// A-44 (founder 2026-09-28): every notification tap lands on its reason. One router for the
// running listener and the tap that launched the app. Returns { screen, params } for the Main
// stack (tabs go through MainTabs), or null when the tap must not navigate (Snooze, "Nothing
// else today" — action buttons stay shortcuts). nonce: a repeat tap on the same item still acts.
const NO_NAV_ACTIONS = new Set(['SNOOZE_HOUR', 'SNOOZE_TOMORROW', 'FOOD_DAY_DONE']);
function notifTapTarget(resp, nowMs) {
  const req = (resp && resp.notification && resp.notification.request) || {};
  let data = (req.content && req.content.data) || {};
  if (typeof data.dataString === 'string') { try { data = JSON.parse(data.dataString); } catch { /* keep */ } }
  if (!data || !data.type) return null;
  const action = resp.actionIdentifier;
  if (NO_NAV_ACTIONS.has(action)) return null;
  const tab = (screen, params) => (params ? { screen: 'MainTabs', params: { screen, params } } : { screen: 'MainTabs', params: { screen } });
  if (data.type === 'food_log') {
    const p = foodTapParams(resp, nowMs);
    return p ? { screen: 'FoodChat', params: p } : null;
  }
  if (action === 'MARK_TAKEN') return tab('Today'); // an injectable asks its site there (S-25)
  switch (data.type) {
    case 'dose_reminder':
    case 'dose_followup':
      if (data.protocolId == null) return tab('Today');
      return tab('Today', { focusDose: { protocolId: data.protocolId, dayKey: data.dayKey || null, ti: data.ti != null ? data.ti : null, slotMs: data.slotMs != null ? data.slotMs : null, nonce: nowMs } });
    case 'vial_low':
      return tab('Protocols', data.protocolId != null ? { openProtocolId: data.protocolId } : { openVialId: data.vialId });
    case 'checkin_reminder':
      return { screen: 'Progress', params: { focus: 'weighin', nonce: nowMs } };
    case 'reality_check':
      return { screen: 'Progress', params: { focus: 'reality', nonce: nowMs } };
    case 'morning_summary':
      return tab('Today');
    default:
      return null;
  }
}

// One key per tap, so the launch path and the listener never both navigate.
function responseKey(resp) {
  const n = (resp && resp.notification) || {};
  return String((n.request && n.request.identifier) || '') + '|' + String((resp && resp.actionIdentifier) || '') + '|' + String(n.date || 0);
}

// ── Snooze + notification actions (founder 2026-09-24) ─────────────
// "In 1 hour" is exactly that. "Tomorrow" is the same time tomorrow — except
// late-evening / night snoozes, which land at 09:00 instead of the middle of the night.
const SNOOZE_HOUR_MS = 60 * 60 * 1000;
function snoozeFireAt(kind, nowMs) {
  if (kind === 'hour') return nowMs + SNOOZE_HOUR_MS;
  const n = new Date(nowMs);
  const h = n.getHours();
  if (h >= 7 && h < 21) return nowMs + 24 * SNOOZE_HOUR_MS;
  const t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + (h >= 21 ? 1 : 0), 9, 0, 0, 0);
  return t.getTime();
}

// Snoozed copy id. Its own prefix, so no routine resync (which clears "dose-",
// "vial-", "food-log-"…) ever wipes it; re-snoozing a copy keeps one id.
function snoozeId(origId) {
  const id = String(origId || '');
  return id.startsWith('snz-') ? id : 'snz-' + id;
}

// Protocol/day/slot of a dose reminder id ("dose-12-2026-09-24-t1[-f0]",
// optionally "snz-"-prefixed). null for anything else.
function parseDoseId(id) {
  const m = /^(?:snz-)?dose-(\d+)-(\d{4}-\d{2}-\d{2})-t(\d+)(?:-f\d+)?$/.exec(String(id || ''));
  return m ? { protocolId: Number(m[1]), dayKey: m[2], ti: Number(m[3]) } : null;
}

// Keep only snoozes still in the future and still wanted, newest 4 (iOS caps
// pending local notifications at 64; the regular plan uses ~56).
const MAX_SNOOZES = 4;
function pruneSnoozes(records, nowMs, stillWanted) {
  return (records || [])
    .filter((r) => r && r.id && r.fireAt > nowMs && (!stillWanted || stillWanted(r)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SNOOZES);
}

// "Vial running low" (pre-build pass m10): announced ONCE per vial when it becomes low, never
// again on the next launch. sent = { [vialId]: true } kept on the device. Vials no longer active
// are forgotten; a newly mixed vial is a new row (new id), so it is announced when it runs low.
//   lowIds: vials low now · activeIds: every active vial · sent: what was announced before
// Returns { send: [ids to announce now], sent: the map to keep }.
function vialLowToSend({ lowIds = [], activeIds = [], sent = {} }) {
  const active = new Set(activeIds.map(String));
  const next = {};
  for (const id of Object.keys(sent || {})) if (active.has(String(id)) && sent[id]) next[id] = true;
  const send = [];
  for (const id of lowIds) {
    if (next[String(id)]) continue;
    send.push(id);
    next[String(id)] = true;
  }
  return { send, sent: next };
}

module.exports = { notifTapTarget, vialLowToSend, reminderTimes, ymd, parseYmd, addDays, dayDiff, dueDateKeys, morningSummaryPlan, foodNudgeDays, remindersForAccess, foodReminderDay, foodTapParams, responseKey, snoozeFireAt, snoozeId, parseDoseId, pruneSnoozes, MAX_SNOOZES };
