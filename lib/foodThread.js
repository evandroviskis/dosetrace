'use strict';
// Pure logic for the food-log chat (FL-31..40). No React Native / Expo imports,
// so it runs under plain `node --test`. The chat view is REBUILT from stored
// food_logs rows every time (FL-35): the user's messages (raw_text), the entries
// each produced, day markers (closed / not recorded) and the follow-up state kept
// on the items themselves (ask / ask_skipped / ask_pending / ask_done). Nothing
// exists only in the chat view.

const { foodOnly, closedDays, dayTotals, pickDayQuestion, entryDateFor, quotaWaitDay, itemsFiber } = require('./nutrition');
const { localISO } = require('./localDate');

const ymdLocal = (d) => localISO(d);

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
// bubble. Rows saved before message ids return null here and are grouped by
// legacyGroups (same text AND typed within LEGACY_GAP_MS of each other).
function messageKey(row) {
  const items = safeItems(row && row.parsed_items);
  const m = items.find((it) => it && it.msg);
  return m ? 'm:' + m.msg : null;
}
// Legacy rows (no message id): the rows one message produced were written within
// seconds of each other with the same text. Same text typed again later is a NEW
// message — never merge by text + day alone (sim 2026-09-27: two "2 built puff
// bars" hours apart showed as one bubble). Returns Map rowId → group key.
const LEGACY_GAP_MS = 2 * 60 * 1000;
function legacyGroups(rows) {
  const out = new Map();
  const legacy = (rows || []).filter((r) => r && !messageKey(r)).sort((a, b) => (typedAt(a) - typedAt(b)) || ((a.id || 0) - (b.id || 0)));
  const open = []; // { text, lastAt, key }
  for (const r of legacy) {
    const at = typedAt(r);
    const text = r.raw_text || '';
    const g = text ? open.find((x) => x.text === text && at && x.lastAt && at - x.lastAt <= LEGACY_GAP_MS) : null;
    if (g) { g.lastAt = at; out.set(r.id, g.key); continue; }
    const key = 'l:' + r.id;
    open.push({ text, lastAt: at, key });
    out.set(r.id, key);
  }
  return out;
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
  const legacy = legacyGroups(foodOnly(rows));
  for (const r of foodOnly(rows)) {
    const d = typedDay(r);
    if (!d || (since && d < since)) continue;
    const k = messageKey(r) || legacy.get(r.id) || 'r:' + r.id;
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
  const rawOf = new Map(); // rowId → the user text of its message (A-133: foodCase reads the user's own words)
  const quotaToldDays = new Set(); // DV-066: the days whose read limit the chat already explained

  for (const ev of events) {
    divider(ev.at ? ymdLocal(new Date(ev.at)) : today);
    if (ev.kind === 'day_closed') { out.push({ type: 'closed', key: 'c:' + ev.r.id, day: ev.r.entry_date }); continue; }
    if (ev.kind === 'not_recorded') { out.push({ type: 'not_recorded', key: 'n:' + ev.r.id, day: ev.r.entry_date }); continue; }
    const g = ev.g;
    const sorted = g.rows.slice().sort((a, b) => (typedAt(a) - typedAt(b)) || ((a.id || 0) - (b.id || 0)));
    const primary = sorted.find((r) => r.raw_text) || sorted[0];
    const refused = sorted.find((r) => r.parse_status === 'refused');
    const waitDay = quotaWaitDay(primary.parse_status);
    const status = waitDay ? 'quota_wait' : ['pending', 'unparsed', 'too_old'].includes(primary.parse_status) ? primary.parse_status : 'done';
    out.push({ type: 'user', key: 'u:' + g.key, text: primary.raw_text || '', status, rowId: primary.id });
    // DV-066 (DL-28): the day's reads were used up — the item keeps its note; the chat explains once per day.
    if (waitDay) {
      if (!quotaToldDays.has(waitDay)) { quotaToldDays.add(waitDay); out.push({ type: 'quota_wait', key: 'w:' + waitDay, rowId: primary.id }); }
      continue;
    }
    // Everything in it was more than 7 days back: kept, explained, removable (FL-45).
    if (status === 'too_old') { out.push({ type: 'too_old', key: 'o:' + primary.id, rowId: primary.id }); continue; }
    if (refused) { out.push({ type: 'refused', key: 'x:' + refused.id, rowId: refused.id, text: refused.raw_text || '' }); continue; }
    const done = sorted.filter((r) => r.parse_status === 'done').sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0));
    if (!done.length) continue;
    const raw = primary.raw_text || '';
    for (const r of sorted) rawOf.set(r.id, raw);
    const all = [];
    for (const r of done) {
      const items = safeItems(r.parsed_items);
      all.push(...items);
      out.push({ type: 'entry', key: 'e:' + r.id, rowId: r.id, entry_date: r.entry_date, items, kcal: r.kcal, carb_g: r.carb_g, protein_g: r.protein_g, fiber_g: itemsFiber(items), raw });
    }
    out.push({ type: 'echo', key: 'h:' + g.key, items: all, raw });
    for (const r of done) {
      safeItems(r.parsed_items).forEach((it, i) => {
        if (it && it.ask_done) out.push({ type: 'asked', key: 'a:' + r.id + ':' + i, kind: it.ask_done.kind, food: it.ask_done.food || it.food, answer: it.ask_done.answer || '', item: it, raw });
        else if (it && it.ask_pending) out.push({ type: 'answer_pending', key: 'p:' + r.id + ':' + i, kind: (it.ask && it.ask.kind) || 'identity', food: it.food, answer: it.ask_pending });
      });
    }
  }
  // Midnight passed while the chat is open (or since the last message): a divider.
  if (today && lastDay && today > lastDay) divider(today);
  if (!out.length && today) divider(today);
  if (open) {
    const own = (rows || []).find((r) => r && r.id === open.rowId);
    out.push({ type: 'followup', key: 'f:' + open.rowId + ':' + open.index, ...open, raw: rawOf.get(open.rowId) || (own && own.raw_text) || '' });
  }
  else if (o.question) out.push({ type: 'question', key: 'q:' + (today || '') + ':' + o.question.id, ...o.question });
  if (o.evening) out.push({ type: 'evening', key: 'v:' + o.evening, day: o.evening });
  return out;
}

// A-133: a transient notice ("Updated — …", deflect, fix, offline…) answers what the user just
// did, so it sits right before the app's next prompt (follow-up / question / evening), which
// buildThread always puts last — never below it. Returns a new array; no notice → the thread.
const PROMPTS = new Set(['followup', 'question', 'evening']);
function withNotice(thread, notice) {
  const th = (thread || []).slice();
  if (!notice) return th;
  let i = th.length;
  while (i > 0 && th[i - 1] && PROMPTS.has(th[i - 1].type)) i--;
  th.splice(i, 0, notice.type ? notice : { type: 'notice', key: 'notice', ...notice });
  return th;
}

// A-133: an "Updated — …" notice reports rows (rowIds). Once any of them is gone (removed with
// "Fix this entry → Remove entry", deleted, or removed on another device) it is stale: null.
// A notice without rows (deflect, fix, offline…) is kept as it is.
function liveNotice(notice, rows) {
  if (!notice) return null;
  const ids = Array.isArray(notice.rowIds) ? notice.rowIds : [];
  if (!ids.length) return notice;
  const liveRows = (rows || []).filter((r) => r && r.sync_status !== 'deleted');
  const live = new Set(liveRows.map((r) => r.id));
  if (!ids.every((id) => live.has(id))) return null;
  // A catch-up "Updated" (offline rows read when the connection came back) repeats the echo when the rows
  // it reports are the newest in the chat: their "Logged: …" sits right above it (S25, 2026-11-11).
  if (notice.kind === 'updated' && notice.catchUp) {
    const set = new Set(ids);
    const oldest = Math.min(...liveRows.filter((r) => set.has(r.id)).map(typedAt));
    const newerOther = liveRows.some((r) => !set.has(r.id) && typedAt(r) > oldest);
    if (!newerOther) return null;
  }
  return notice;
}

// The day question for the thread end (FL-4): only while the latest message is
// from today and nothing else is open.
function threadQuestion(rows, todayISO, askedIds, now) {
  return pickDayQuestion(rows, todayISO, askedIds, now, closedDays(rows).has(todayISO));
}

// The question kept from the last visit (FL-32), only while it still applies: something
// logged today calls for it and a later log did not answer it (prototype: questions follow a
// log, never shown on open by themselves — founder 2026-10-02). askedIds: asked today.
function resumableQuestion(cur, rows, todayISO, askedIds, now) {
  if (!cur || !cur.id) return null;
  const others = (askedIds || []).filter((id) => id !== cur.id);
  const q = pickDayQuestion(rows, todayISO, others, now, closedDays(rows).has(todayISO));
  return q && q.id === cur.id ? cur : null;
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

// ── Access: Premium, free days, and the grace week (FL-41) ────────────────
// Whole local days from a to b (b − a).
function daysFrom(aISO, bISO) {
  const x = new Date(String(aISO).slice(0, 10) + 'T12:00:00');
  const y = new Date(String(bISO).slice(0, 10) + 'T12:00:00');
  return isNaN(x) || isNaN(y) ? NaN : Math.round((y - x) / 86400000);
}
// A local day shifted by n days (either direction).
function shiftDay(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}
// Last day of the check week (days 1–7 / 8–14 / 15–21 / …) that dayISO falls in.
function checkWeekEnd(startISO, dayISO) {
  const d = daysFrom(startISO, dayISO);
  if (!Number.isFinite(d) || d < 0) return null;
  return shiftDay(startISO, Math.floor(d / 7) * 7 + 6);
}
// Who may log food today (FL-41, founder 2026-09-27: "We can't give users 3 days
// free if a reality check requires 7 days"). Free users get 7 DAYS of food log +
// reality check — enough for one 7-day run (FL-3). The 7 days count from firstUse:
// the REAL day the user first used the food log or tapped "start" on a reality
// check (a durable, synced anchor — lib/foodLogActions ensureFreeStart). A
// backdated check start (FL-44) never moves it, and deleting entries or starting a
// new check never resets or extends it.
// A user who has paid (premiumEndedOn set) always gets the Premium wording; if
// their Premium ended during an open check, logging stays open to the end of that
// check week ('grace'), or to the end of their free days if that is later.
// reason: 'free_days_ending' (last 2 free days — explain + offer Premium),
// 'free_days_ended' or 'premium_ended'. Store unreachable is handled once, by the
// entitlement helper (lib/entitlement.js, S-06). until = last day logging stays open.
// Returns { canLog, mode: 'premium'|'free_days'|'grace'|'locked', until, graceUntil, lapsedOn, reason, freeDaysLeft, freeFrom }.
const FREE_DAYS = 7;
function foodLogAccess({ premium, firstUse, premiumEndedOn, rcStart, todayISO, freeDays = FREE_DAYS }) {
  const base = { until: null, graceUntil: null, lapsedOn: null, reason: null, freeDaysLeft: null, freeFrom: firstUse || null };
  if (premium) return { ...base, canLog: true, mode: 'premium' };
  const start = rcStart && rcStart.date ? String(rcStart.date).slice(0, 10) : null;
  const freeEnd = firstUse ? shiftDay(firstUse, freeDays - 1) : null;
  const inFree = !firstUse || todayISO <= freeEnd;
  const freeDaysLeft = inFree ? (freeEnd ? daysFrom(todayISO, freeEnd) + 1 : freeDays) : 0;
  if (premiumEndedOn) {
    // A lapsed payer: never "free days" wording.
    const graceUntil = start && premiumEndedOn >= start ? checkWeekEnd(start, premiumEndedOn) : null;
    const inGrace = !!(graceUntil && todayISO <= graceUntil);
    if (inGrace || inFree) {
      const until = [inGrace ? graceUntil : null, inFree ? freeEnd : null].filter(Boolean).sort().pop() || null;
      return { ...base, canLog: true, mode: inGrace ? 'grace' : 'free_days', until, graceUntil: inGrace ? graceUntil : null, lapsedOn: premiumEndedOn, reason: 'premium_ended', freeDaysLeft };
    }
    return { ...base, canLog: false, mode: 'locked', lapsedOn: premiumEndedOn, reason: 'premium_ended', freeDaysLeft: 0 };
  }
  if (inFree) return { ...base, canLog: true, mode: 'free_days', until: freeEnd, reason: freeEnd && freeDaysLeft <= 2 ? 'free_days_ending' : null, freeDaysLeft };
  return { ...base, canLog: false, mode: 'locked', lapsedOn: shiftDay(freeEnd, 1), reason: 'free_days_ended', freeDaysLeft: 0 };
}

// The free-days anchor (FL-41): the earliest stored 'free_start' marker day. With
// no marker yet (users from before the anchor existed), the earliest day the log
// was used becomes it — and must then be STORED (persist). Returns
// { firstUse, persist } — persist = the day to write as the marker, or null.
function freeStartDay({ markerDays, typedDays }) {
  const m = (markerDays || []).filter(Boolean).slice().sort();
  if (m.length) return { firstUse: m[0], persist: null };
  const t = (typedDays || []).filter(Boolean).slice().sort();
  return t.length ? { firstUse: t[0], persist: t[0] } : { firstUse: null, persist: null };
}

// Which failure notice a send gets (FL-46): "saved, I'll estimate when you're back
// online" ONLY when the device is actually offline; any other failure while online
// says it's saved and will be tried again — never the offline wording.
// DV-213 (AD-105): the 24-hour ceiling has its own notice (with the time a call frees up); the day's
// parse limit, and an older server's plain 429, read as quota.
function sendFailureNotice(res, isOnline) {
  if (!res || res.ok) return null;
  if (res.code === 'ceiling_24h') return 'ceiling';
  if (res.code === 'quota_exceeded' || res.status === 429) return 'quota';
  if (isOnline === false || (res.code === 'network' && isOnline !== true)) return 'offline';
  return 'retry';
}

// A pending row shows its own note ("saved, I'll estimate it when you're back online" / "saved, tried
// again later") unless the app's bubble right now says exactly that about this row (found on the S25,
// 2026-11-11: the same sentence twice in a row). Once the bubble is gone the note explains again.
function pendingNoteShown(item, notice) {
  if (!item || item.status !== 'pending') return false;
  if (notice && (notice.kind === 'offline' || notice.kind === 'retry') && notice.rowId != null && notice.rowId === item.rowId) return false;
  return true;
}

// DV-213 (AD-105): what a refused follow-up answer is — 'retry' (offline / server down: kept and
// retried, FL-28), 'ceiling' (60 calls in 24 h), 'limit' (the day's follow-up answers; an older
// server's 429), else 'dropped' (the item stays an estimate). The chat says the first three.
function followupFailure(res) {
  if (!res || res.ok) return null;
  if (res.code === 'network' || res.status == null || res.status >= 500 || res.status === 401) return 'retry';
  if (res.code === 'ceiling_24h') return 'ceiling';
  if (res.code === 'followup_limit' || res.code === 'quota_exceeded' || res.status === 429) return 'limit';
  return 'dropped';
}

// ── Today hero (FL-33 / FL-41 / FL-42 / FL-43) ─────────────────────
// Founder decisions 2026-09-27: the Today hero shows ONLY while a reality check is
// open (FL-43) — from its start until the weigh-in is done or the check is stopped;
// after day 21 without a weigh-in it stays and says it's time to weigh in (FL-42);
// access (Premium / free days / grace week / locked) comes from foodLogAccess (FL-41).
function todayFoodHeroPolicy({ rcStart, todayISO, access, checkDays = require('./realityCheckRules').REALITY_CHECK_DAYS }) {
  if (!rcStart || !rcStart.date || !todayISO) return { show: false };
  const d = daysFrom(rcStart.date, todayISO);
  if (!Number.isFinite(d)) return { show: false };
  const day = Math.max(1, d + 1);
  const mode = (access && access.mode) || 'premium';
  return { show: true, locked: mode === 'locked', grace: mode === 'grace', graceUntil: (access && access.graceUntil) || null, day, of: checkDays, weighInDue: day > checkDays };
}

// The weigh-in day of a check (start + 21), for the grace note.
const weighInDay = (startISO, checkDays = require('./realityCheckRules').REALITY_CHECK_DAYS) => shiftDay(startISO, checkDays);

// Hero line: today's entries (items, ~kcal) or "day closed".
function todaySummary(rows, todayISO) {
  const food = foodOnly(rows).filter((e) => e.entry_date === todayISO && e.parse_status === 'done');
  const items = food.reduce((n, e) => n + safeItems(e.parsed_items).length, 0);
  return { items, kcal: dayTotals(food).kcal, closed: closedDays(rows).has(todayISO) };
}

// DV-232 (AD-107, option A): the food card's week line — the last 7 local days (today and the 6 before),
// the food read so far ('done'). avgKcal is over the days that have food: a day with nothing logged does
// not pull the average down. → { kcal, foodDays, avgKcal, avgProtein, avgCarb, fiberDays, avgFiber }.
// Food week (founder 2026-11-08, docs/specs/food-fiber-week.md): the daily averages of protein and carbs over
// the same days with food; fiber over the days whose food has a fiber number (items read before the AI
// returned fiber have none), so old entries never pull it to a false low. avgFiber is null with no such day.
function weekSummary(rows, todayISO, days = 7) {
  const from = shiftDay(todayISO, -(days - 1));
  if (!from) return { kcal: 0, foodDays: 0, avgKcal: 0, avgProtein: 0, avgCarb: 0, fiberDays: 0, avgFiber: null };
  const food = foodOnly(rows).filter((e) => e.entry_date && e.entry_date >= from && e.entry_date <= todayISO && e.parse_status === 'done');
  const t = dayTotals(food);
  const kcal = t.kcal;
  const foodDays = new Set(food.filter((e) => Number(e.kcal) > 0).map((e) => e.entry_date)).size;
  const fiberByDay = new Map();
  for (const e of food) {
    const g = itemsFiber(safeItems(e.parsed_items));
    if (g != null) fiberByDay.set(e.entry_date, (fiberByDay.get(e.entry_date) || 0) + g);
  }
  const fiberDays = fiberByDay.size;
  const fiberSum = [...fiberByDay.values()].reduce((a, g) => a + g, 0);
  const avg = (v) => (foodDays ? Math.round(v / foodDays) : 0);
  return { kcal, foodDays, avgKcal: avg(kcal), avgProtein: avg(t.protein_g), avgCarb: avg(t.carb_g), fiberDays, avgFiber: fiberDays ? Math.round(fiberSum / fiberDays) : null };
}

// FW-9 (founder 2026-11-08, picture docs/design/food-week-fiber-pace.html column 4): a day's total in the
// food chat — kcal, carbs, protein and, when any item has it, fiber. Null when the day has no food read.
function dayFoodTotal(rows, dayISO) {
  const food = foodOnly(rows).filter((e) => e.entry_date === dayISO && e.parse_status === 'done');
  if (!food.length) return null;
  const t = dayTotals(food);
  if (!(t.kcal > 0)) return null;
  let fiber = null;
  for (const e of food) { const g = itemsFiber(safeItems(e.parsed_items)); if (g != null) fiber = (fiber || 0) + g; }
  return { kcal: t.kcal, carb_g: t.carb_g, protein_g: t.protein_g, fiber_g: fiber == null ? null : Math.round(fiber * 10) / 10 };
}
// The day total goes after today's messages, before the app's next prompt (as withNotice). No total → the thread.
function withDayTotal(thread, total, todayISO) {
  const th = (thread || []).slice();
  if (!total) return th;
  let i = th.length;
  while (i > 0 && th[i - 1] && PROMPTS.has(th[i - 1].type)) i--;
  th.splice(i, 0, { type: 'day_total', key: 't:' + todayISO, day: todayISO, ...total });
  return th;
}

// A message id for the rows one message produces (FL-38).
function newMessageId(nowMs, rand) {
  return (nowMs || Date.now()).toString(36) + (rand != null ? rand : Math.random()).toString(36).slice(2, 8);
}

module.exports = {
  pendingNoteShown,
  followupFailure,
  resumableQuestion,
  safeItems, typedAt, typedDay, messageKey, legacyGroups, LEGACY_GAP_MS, dayWord, openFollowup, pendingAnswers, buildThread, withNotice, liveNotice, threadQuestion,
  AUTO_CLOSE_MS, autoCloseBlocked, shouldAutoClose, todayFoodHeroPolicy, todaySummary, weekSummary, dayFoodTotal, withDayTotal, newMessageId,
  foodLogAccess, freeStartDay, FREE_DAYS, sendFailureNotice, checkWeekEnd, weighInDay, shiftDay,
};
