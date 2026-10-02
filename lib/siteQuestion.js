'use strict';
// S-25 (founder 2026-10-01): an injectable dose is written as Taken only AFTER the app
// asks where it was injected. The "site question" is what Mark taken creates: it
// carries the TAP time (the dose's time, also when the answer comes later or after
// midnight) and is kept on the device until it is answered, so an app killed with the
// question open asks it again instead of losing a dose the user said they took.
// Pure + a tiny store API (pass AsyncStorage) — runs under plain node --test
// (__tests__/siteBeforeTaken.test.js).

const KEY = 'dosetrace_site_questions';
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const localKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Injectables (lyophilized / ready to use) are asked; oral doses have no site.
function needsSiteQuestion(type) {
  return type === 'recon' || type === 'rtu';
}

// source: 'today' (Mark taken) | 'pending' (yesterday's slot) | 'notification'.
// dayKey / slotMs: the day and slot the dose is FOR (default: the tap's day).
// atNow: log at the tap time today (a snoozed copy tapped late).
// skipYesterday: { dayKey, slotMs } — "Today's dose — skip yesterday": yesterday's
// Skipped row is written together with this dose, only when it is answered.
// flipRowId (A-78): the Skipped row this dose logs (a skipped slot's "you can still log it"
// line); the answer turns that row into Taken instead of adding one.
function newQuestion({ protocolId, tapMs, dayKey = null, slotMs = null, atNow = false, skipYesterday = null, source = 'today', ti = null, flipRowId = null }) {
  const day = dayKey || localKey(tapMs);
  return {
    key: `${protocolId}|${day}|${Number.isFinite(slotMs) ? slotMs : ''}${flipRowId != null ? `|r${flipRowId}` : ''}`,
    protocolId, tapMs, dayKey: day, slotMs: Number.isFinite(slotMs) ? slotMs : null,
    atNow: !!atNow, skipYesterday: skipYesterday || null, source, ti: Number.isFinite(ti) ? ti : null,
    flipRowId: flipRowId != null ? flipRowId : null,
  };
}

// One question per dose: a second tap while one is open is the same dose (same key:
// protocol, day, slot). A twice-a-day protocol's 08:00 and 20:00 banners are two.
function addQuestion(list, q) {
  const cur = Array.isArray(list) ? list : [];
  return cur.some((x) => x.key === q.key) ? cur : [...cur, q];
}

function removeQuestion(list, key) {
  return (Array.isArray(list) ? list : []).filter((x) => x.key !== key);
}

// Never dropped for its age: a Taken the user pressed stays until it is answered, or
// until that dose is found logged (questionAnswered / isDoseAlreadyLogged).
function liveQuestions(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && x.protocolId != null && Number.isFinite(x.tapMs) && x.key);
}

// Has THIS question already been answered? Its own row is the Taken at its tap time,
// or the Taken at its slot (a flipped Missed row sits at the slot). dayLogs: that
// protocol's rows of the day.
const SAME_MS = 60 * 1000;
function questionAnswered(dayLogs, q) {
  return (dayLogs || []).some((l) => {
    if (l.protocol_id !== q.protocolId || l.outcome !== 'Taken') return false;
    const t = Date.parse(l.logged_at);
    return t === q.tapMs || (Number.isFinite(q.slotMs) && Math.abs(t - q.slotMs) < SAME_MS);
  });
}

// Reminders to cancel once a banner's question is answered: that slot and every earlier
// one (ti + 1), as the background path did; never fewer than the day's Taken count.
function reminderCancelCount(q, takenAfter) {
  return Math.max(takenAfter || 0, Number.isFinite(q && q.ti) ? q.ti + 1 : 0);
}

// What the write needs (lib/doseActions.js recordDoseTaken): the tap time, the day /
// slot it is for, and the skip of yesterday when there is one.
function commitOpts(q) {
  const o = { tapMs: q.tapMs, dayKey: q.dayKey, atNow: !!q.atNow };
  if (Number.isFinite(q.slotMs)) o.slotMs = q.slotMs;
  if (q.flipRowId != null) o.flipRowId = q.flipRowId; // A-78: the skipped row this dose logs
  if (q.skipYesterday) o.skipYesterday = q.skipYesterday;
  return o;
}

async function readAll(store) {
  try { const raw = await store.getItem(KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
async function writeAll(store, list) {
  try { await store.setItem(KEY, JSON.stringify(list)); } catch { /* best-effort: the question is still on screen */ }
}
async function loadQuestions(store) {
  return liveQuestions(await readAll(store));
}
async function saveQuestion(store, q) {
  const list = addQuestion(await readAll(store), q);
  await writeAll(store, list);
  notify();
  return list;
}
async function dropQuestion(store, key) {
  const list = removeQuestion(await readAll(store), key);
  await writeAll(store, list);
  return list;
}

// In-process signal: a question saved by the notification handler while the app is
// open reaches Today without waiting for the next focus.
const listeners = new Set();
function onQuestionsChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } }

module.exports = {
  needsSiteQuestion, newQuestion, addQuestion, removeQuestion, liveQuestions, commitOpts, questionAnswered, reminderCancelCount,
  loadQuestions, saveQuestion, dropQuestion, onQuestionsChanged, QUESTIONS_KEY: KEY,
};
