'use strict';
// Pure logic for the food-log chat (FL-31..40). No React Native / Expo imports,
// so it runs under plain `node --test`. The chat view is REBUILT from stored
// food_logs rows every time (FL-35): the user's messages (raw_text), the entries
// each produced, day markers (closed / not recorded) and the follow-up state kept
// on the items themselves (ask / ask_skipped / ask_pending / ask_done). Nothing
// exists only in the chat view.

const { foodOnly, closedDays, dayTotals, pickDayQuestion, entryDateFor } = require('./nutrition');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const ymdLocal = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

function safeItems(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
}

// When a row was TYPED (ms). created_at is ISO from the app, or SQLite's
// "YYYY-MM-DD HH:MM:SS" (UTC, no zone) for old rows.
function typedAt(row) {
  const s = row && row.created_at;
  if (!s) return 0;
  let iso = String(s);
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(iso)) iso = iso.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}
// The local day a row was typed on (falls back to its entry day).
function typedDay(row) {
  const t = typedAt(row);
  return t ? ymdLocal(new Date(t)) : (row && row.entry_date) || null;
}

// One message = one group of rows (FL-38). New rows carry the message id on their
// items ("msg"), so a multi-day catch-up split into several rows shows as ONE
// bubble. Rows saved before message ids fall back to same text + same typed day.
function messageKey(row) {
  const items = safeItems(row && row.parsed_items);
  const m = items.find((it) => it && it.msg);
  if (m) return 'm:' + m.msg;
  if (row && row.raw_text) return 'l:' + row.raw_text + '|' + typedDay(row);
  return 'r:' + (row && row.id);
}

// Day naming (FL-40): 'today' | 'yesterday' | 'other'.
function dayWord(dayISO, todayISO) {
  if (!dayISO || !todayISO) return 'other';
  if (dayISO === todayISO) return 'today';
  if (dayISO === entryDateFor(todayISO, 1)) return 'yesterday';
  return 'other';
}

// The open follow-up (FL-38): the latest item with an unanswered, un-skipped ask.
// Returns { rowId, entry_date, index, count, item, kind, options } or null.
function openFollowup(rows) {
  let best = null;
  for (const r of foodOnly(rows)) {
    if (r.sync_status === 'deleted') continue;
    const items = safeItems(r.parsed_items);
    items.forEach((it, index) => {
      if (!it || !it.ask || it.ask_skipped || it.ask_pending || it.ask_done) return;
      const at = typedAt(r);
      if (!best || at >= best.at) {
        best = { at, rowId: r.id, entry_date: r.entry_date, index, count: items.length, item: it, kind: it.ask.kind, options: Array.isArray(it.ask.options) ? it.ask.options.slice(0, 4) : [] };
      }
    });
  }
  if (!best) return null;
  const { at, ...rest } = best;
  return rest;
}

// Answers typed while offline, stored on the item (durable, synced): retried on focus.
function pendingAnswers(rows) {
  const out = [];
  for (const r of foodOnly(rows)) {
    const items = safeItems(r.parsed_items);
    items.forEach((it, index) => {
      if (it && it.ask_pending && typeof it.ask_pending === 'string') {
        out.push({ rowId: r.id, entry_date: r.entry_date, index, count: items.length, item: it, kind: (it.ask && it.ask.kind) || 'identity', answer: it.ask_pending });
      }
    });
  }
  return out;
}

// Build the thread, oldest first (the view renders it inverted so it opens at the
// latest message, FL-39). opts: { todayISO, sinceISO (first typed day shown),
// question: { id, tense } | null, evening: dayISO | null }.
// Item types: divider · user · refused · entry · echo · asked · answer_pending ·
// closed · not_recorded · followup · question · evening.
function buildThread(rows, opts) {
  const o = opts || {};
  const today = o.todayISO;
  const since = o.sinceISO || today;
  const events = [];
  const groups = new Map();
  for (const r of foodOnly(rows)) {
    const d = typedDay(r);
    if (!d || (since && d < since)) continue;
    const k = messageKey(r);
    if (!groups.has(k)) groups.set(k, { key: k, rows: [], at: Infinity });
    const g = groups.get(k);
    g.rows.push(r);
    g.at = Math.min(g.at, typedAt(r) || Infinity);
  }
  for (const g of groups.values()) events.push({ kind: 'msg', at: g.at === Infinity ? 0 : g.at, g });
  for (const r of rows || []) {
    if (!r || (r.source !== 'day_closed' && r.source !== 'not_recorded')) continue;
    const d = typedDay(r);
    if (!d || (since && d < since)) continue;
    events.push({ kind: r.source, at: typedAt(r), r });
  }
  events.sort((a, b) => a.at - b.at);

  const out = [];
  let lastDay = null;
  const divider = (day) => { if (day && day !== lastDay) { out.push({ type: 'divider', key: 'd:' + day, day }); lastDay = day; } };
  const open = openFollowup(rows);

  for (const ev of events) {
    divider(ev.at ? ymdLocal(new Date(ev.at)) : today);
    if (ev.kind === 'day_closed') { out.push({ type: 'closed', key: 'c:' + ev.r.id, day: ev.r.entry_date }); continue; }
    if (ev.kind === 'not_recorded') { out.push({ type: 'not_recorded', key: 'n:' + ev.r.id, day: ev.r.entry_date }); continue; }
    const g = ev.g;
    const sorted = g.rows.slice().sort((a, b) => (typedAt(a) - typedAt(b)) || ((a.id || 0) - (b.id || 0)));
    const primary = sorted.find((r) => r.raw_text) || sorted[0];
    const refused = sorted.find((r) => r.parse_status === 'refused');
    const status = primary.parse_status === 'pending' ? 'pending' : primary.parse_status === 'unparsed' ? 'unparsed' : 'done';
    out.push({ type: 'user', key: 'u:' + g.key, text: primary.raw_text || '', status, rowId: primary.id });
    if (refused) { out.push({ type: 'refused', key: 'x:' + refused.id, rowId: refused.id, text: refused.raw_text || '' }); continue; }
    const done = sorted.filter((r) => r.parse_status === 'done').sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0));
    if (!done.length) continue;
    const all = [];
    for (const r of done) {
      const items = safeItems(r.parsed_items);
      all.push(...items);
      out.push({ type: 'entry', key: 'e:' + r.id, rowId: r.id, entry_date: r.entry_date, items, kcal: r.kcal, carb_g: r.carb_g, protein_g: r.protein_g });
    }
    out.push({ type: 'echo', key: 'h:' + g.key, items: all });
    for (const r of done) {
      safeItems(r.parsed_items).forEach((it, i) => {
        if (it && it.ask_done) out.push({ type: 'asked', key: 'a:' + r.id + ':' + i, kind: it.ask_done.kind, food: it.ask_done.food || it.food, answer: it.ask_done.answer || '', item: it });
        else if (it && it.ask_pending) out.push({ type: 'answer_pending', key: 'p:' + r.id + ':' + i, kind: (it.ask && it.ask.kind) || 'identity', food: it.food, answer: it.ask_pending });
      });
    }
  }
  // Midnight passed while the chat is open (or since the last message): a divider.
  if (today && lastDay && today > lastDay) divider(today);
  if (!out.length && today) divider(today);
  if (open) out.push({ type: 'followup', key: 'f:' + open.rowId + ':' + open.index, ...open });
  else if (o.question) out.push({ type: 'question', key: 'q:' + (today || '') + ':' + o.question.id, ...o.question });
  if (o.evening) out.push({ type: 'evening', key: 'v:' + o.evening, day: o.evening });
  return out;
}

// The day question for the thread end (FL-4): only while the latest message is
// from today and nothing else is open.
function threadQuestion(rows, todayISO, askedIds, now) {
  return pickDayQuestion(rows, todayISO, askedIds, now, closedDays(rows).has(todayISO));
}

// ── Auto-close (FL-32 / FL-36) ─────────────────────────────────────
// The chat closes itself after ~30 s idle with the keyboard down, or when the app
// goes to the background — but NEVER while text is in the box, a send or a
// follow-up answer is in flight, the fix screen / consent / any alert is open, or
// a screen reader is on. A swipe-down is the user's own choice (the draft is kept).
const AUTO_CLOSE_MS = 30000;
function autoCloseBlocked(s) {
  const x = s || {};
  return !!((x.text && String(x.text).trim()) || x.sending || x.followupBusy || x.modalOpen || x.alertOpen || x.screenReader);
}
function shouldAutoClose(s, reason) {
  const x = s || {};
  if (autoCloseBlocked(x)) return false;
  if (reason === 'background') return true;
  if (reason === 'idle') return !x.keyboardVisible && (x.idleMs || 0) >= AUTO_CLOSE_MS;
  return false;
}

// ── Today hero (FL-33) ─────────────────────────────────────────────
// PENDING FOUNDER DECISION (2026-09-27): (a) the Today hero shows from the day the
// reality check starts until the weigh-in is completed or the check is stopped
// (i.e. while an open check exists), and (b) free users past the free days see it
// LOCKED (same as the Journey upsell). Both rules live ONLY here.
function todayFoodHeroPolicy({ rcStart, todayISO, premium, trialDaysUsed, freeDays = 3, checkDays = 21 }) {
  if (!rcStart || !rcStart.date || !todayISO) return { show: false };
  const start = new Date(String(rcStart.date).slice(0, 10) + 'T12:00:00');
  const now = new Date(todayISO + 'T12:00:00');
  if (isNaN(start) || isNaN(now)) return { show: false };
  const day = Math.max(1, Math.round((now - start) / 86400000) + 1);
  return { show: true, locked: !premium && (trialDaysUsed || 0) >= freeDays, day, of: checkDays, weighInDue: day > checkDays };
}

// Hero line: today's entries (items, ~kcal) or "day closed".
function todaySummary(rows, todayISO) {
  const food = foodOnly(rows).filter((e) => e.entry_date === todayISO && e.parse_status === 'done');
  const items = food.reduce((n, e) => n + safeItems(e.parsed_items).length, 0);
  return { items, kcal: dayTotals(food).kcal, closed: closedDays(rows).has(todayISO) };
}

// A message id for the rows one message produces (FL-38).
function newMessageId(nowMs, rand) {
  return (nowMs || Date.now()).toString(36) + (rand != null ? rand : Math.random()).toString(36).slice(2, 8);
}

module.exports = {
  safeItems, typedAt, typedDay, messageKey, dayWord, openFollowup, pendingAnswers, buildThread, threadQuestion,
  AUTO_CLOSE_MS, autoCloseBlocked, shouldAutoClose, todayFoodHeroPolicy, todaySummary, newMessageId,
};
