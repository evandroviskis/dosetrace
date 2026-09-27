// Pure nutrition-logger math — no React Native / Expo imports, so it runs under
// plain Node's test runner (CommonJS, like lib/schedule.js). All deterministic
// given their args. See docs/nutrition-logger-conversation-spec.md.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Sum a set of food_logs entries into a day total (Cal / Carbs / Protein — the
// three surfaced per the founder's decision; fat is stored but not totaled here).
function dayTotals(entries) {
  const t = { kcal: 0, protein_g: 0, carb_g: 0 };
  for (const e of entries || []) {
    t.kcal += num(e.kcal);
    t.protein_g += num(e.protein_g);
    t.carb_g += num(e.carb_g);
  }
  return { kcal: Math.round(t.kcal), protein_g: Math.round(t.protein_g), carb_g: Math.round(t.carb_g) };
}

// Average daily calories over the last `days` calendar days, counting only days
// that were actually logged (an unlogged day is unknown, not zero — counting it
// as 0 would understate intake and poison the reality-check). Returns null if no
// day in the window was logged. This is the value that feeds realityCheckTDEE's
// avgDailyCalories input, replacing the "recall 3 weeks from memory" field.
function rollingAvgKcal(entries, endDateISO, days = 7) {
  const end = new Date(endDateISO + 'T00:00:00');
  if (isNaN(end)) return null;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const byDay = {};
  for (const e of entries || []) {
    if (!e.entry_date) continue;
    const d = new Date(e.entry_date + 'T00:00:00');
    if (isNaN(d) || d < start || d > end) continue;
    byDay[e.entry_date] = (byDay[e.entry_date] || 0) + num(e.kcal);
  }
  const keys = Object.keys(byDay);
  if (!keys.length) return null;
  const sum = keys.reduce((a, k) => a + byDay[k], 0);
  return { avgKcal: Math.round(sum / keys.length), loggedDays: keys.length };
}

// Marker rows (FL-3, FL-29): durable, synced food_logs rows that carry no food.
//  • 'not_recorded' — the user said a past day was not recorded: it leaves the
//    intake average (out of the total AND the day count);
//  • 'day_closed'   — "Nothing else today": the day's questions and the 20:00
//    reminder stop for that local day.
// They sync through the normal engine, so they survive updates and re-installs.
const SOURCE_NOT_RECORDED = 'not_recorded';
const SOURCE_DAY_CLOSED = 'day_closed';
const isMarker = (e) => !!e && (e.source === SOURCE_NOT_RECORDED || e.source === SOURCE_DAY_CLOSED);
// Real food entries only (markers removed).
const foodOnly = (entries) => (entries || []).filter((e) => e && !isMarker(e));
const daysWith = (entries, source) => new Set((entries || []).filter((e) => e && e.source === source && e.entry_date).map((e) => String(e.entry_date).slice(0, 10)));
// Local days the user closed ("Nothing else today" / "that's it").
const closedDays = (entries) => daysWith(entries, SOURCE_DAY_CLOSED);
// Days with any real food entry (whatever its parse state).
const foodDays = (entries) => new Set(foodOnly(entries).filter((e) => e.entry_date).map((e) => e.entry_date));
// Days marked "not recorded" that have no food logged. A catch-up later logged
// on a marked day wins: the day then counts as recorded again.
function notRecordedDays(entries) {
  const withFood = foodDays(entries);
  const out = new Set();
  for (const d of daysWith(entries, SOURCE_NOT_RECORDED)) if (!withFood.has(d)) out.add(d);
  return out;
}

// Intake across a reality check (founder 2026-09-24: "what matters is the food
// intake during the time needed for the reality check — we won't track day by
// day"). Sums every entry dated from the check's start through today and divides
// by the days RECORDED in that window, so a catch-up ("an ice cream 3 days ago")
// or three days logged in one go all land in the total. A day the user marked
// "not recorded" leaves the total and the day count (FL-3); an unlogged, unmarked
// day counts as zero — the UI says so and shows its working. Returns null until
// the check has run minDays and has something logged.
// The window is the check's COMPLETED days — start through yesterday — the same
// span daysBetween(start, today) counts for the TDEE (today's weigh-in follows
// yesterday's food). includeToday: the logger's running view, which also shows
// today's food; its day count then includes today (pass elapsedDays + 1).
// Returns { totalKcal, days (= recordedDays, the divisor), avgKcal, entries,
// loggedDays, recordedDays, windowDays, notRecordedDays }.
function checkIntake(entries, startISO, todayISO, elapsedDays, minDays = 5, includeToday = false) {
  if (!startISO || !todayISO || !(elapsedDays >= minDays)) return null;
  const inWindow = (d) => d && d >= startISO && d <= todayISO && (includeToday || d !== todayISO);
  const food = foodOnly(entries).filter((e) => inWindow(e.entry_date));
  let total = 0;
  for (const e of food) total += num(e.kcal);
  const count = food.length;
  if (!count || total <= 0) return null;
  let notRec = 0;
  for (const d of notRecordedDays(entries)) if (inWindow(d)) notRec++;
  const recordedDays = Math.max(0, elapsedDays - notRec);
  if (!recordedDays) return null;
  // Coverage: how many of the window's days have any food logged — so a gap (a
  // day that silently counts as zero) is visible, never hidden in the average.
  const loggedDays = new Set(food.filter((e) => num(e.kcal) > 0).map((e) => e.entry_date)).size;
  return { totalKcal: Math.round(total), days: recordedDays, avgKcal: Math.round(total / recordedDays), entries: count, loggedDays, recordedDays, windowDays: elapsedDays, notRecordedDays: notRec };
}

// Past days of the check (start … yesterday) with no food logged — the days the
// user may mark / unmark as "not recorded" (FL-3). Newest first:
// [{ date, notRecorded: bool, markerIds: [row ids] }].
function unloggedCheckDays(entries, startISO, todayISO) {
  if (!startISO || !todayISO || startISO >= todayISO) return [];
  const withFood = foodDays(entries);
  const markers = {};
  for (const e of entries || []) {
    if (e && e.source === SOURCE_NOT_RECORDED && e.entry_date) (markers[e.entry_date] = markers[e.entry_date] || []).push(e.id);
  }
  const out = [];
  let d = entryDateFor(todayISO, 1);
  let guard = 0;
  while (d >= startISO && guard++ < 400) {
    if (!withFood.has(d)) out.push({ date: d, notRecorded: !!markers[d], markerIds: markers[d] || [] });
    d = entryDateFor(d, 1);
  }
  return out;
}

// Day key an entry belongs to: the day it was typed, moved back when the user
// said when they ate it ("3 days ago" → days_ago 3). Clamped to 0…365.
function entryDateFor(typedISO, daysAgo) {
  const n = Math.max(0, Math.min(365, Math.round(Number(daysAgo) || 0)));
  if (!n) return typedISO;
  const d = new Date(typedISO + 'T12:00:00');
  if (isNaN(d)) return typedISO;
  d.setDate(d.getDate() - n);
  const p = (v) => (v < 10 ? '0' + v : '' + v);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// One message can cover several days ("Monday pizza, Tuesday a salad"): split
// the parsed items into one entry per day eaten. An item's own days_ago wins,
// then the message-level one, else the day typed. Returns [{ entry_date, items,
// totals }] — totals include fat (stored, not shown).
function splitByDay(items, typedISO, topDaysAgo) {
  const groups = {};
  for (const it of items || []) {
    const d = entryDateFor(typedISO, it && it.days_ago != null ? it.days_ago : topDaysAgo);
    (groups[d] = groups[d] || []).push(it);
  }
  return Object.keys(groups).sort().map((entry_date) => {
    const its = groups[entry_date];
    const sum = (k) => Math.round(its.reduce((a, it) => a + num(it[k]), 0));
    return { entry_date, items: its, totals: { kcal: sum('kcal'), protein_g: sum('protein_g'), carb_g: sum('carb_g'), fat_g: sum('fat_g') } };
  });
}

// ── "Anything else today?" (FL-4/5/6/25) ──────────────────────────
// After each entry the app asks ONE friendly question about the rest of TODAY,
// based on which categories are still absent from today's items — never a
// breakfast/lunch/dinner checklist (the goal is total intake). One question per
// gap, never repeated; a last open "anything else?" once every gap was covered;
// then silence. Nothing once the day is closed.
const CATEGORIES = ['meal', 'snack', 'drink', 'supplement'];
const QUESTION_ORDER = ['meal', 'snack', 'drink', 'supplement', 'more'];
// Categories eaten TODAY. Only entries dated today count — a catch-up for an
// earlier day ("pizza on Monday", typed today) never fills a gap today (FL-25).
// Items saved before categories existed count as a meal.
function todayCategories(entries, todayISO) {
  const cats = new Set();
  for (const e of foodOnly(entries)) {
    if (e.entry_date !== todayISO) continue;
    let items = e.parsed_items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    for (const it of Array.isArray(items) ? items : []) {
      cats.add(it && CATEGORIES.includes(it.category) ? it.category : 'meal');
    }
  }
  return cats;
}
// Time-aware tense (FL-5): before 19:00 more meals may still be ahead ("so far,
// or still to come?"); from 19:00 the day is asked about in the past tense.
function questionTense(date) {
  const hour = (date instanceof Date ? date : new Date(date)).getHours();
  return hour >= 19 ? 'past' : 'forward';
}
// Next question: { id, tense } or null (nothing left to ask / day closed).
function pickDayQuestion(entries, todayISO, askedIds, date, closed) {
  if (closed) return null;
  const cats = todayCategories(entries, todayISO);
  if (!cats.size) return null; // asked only after something was logged today
  const asked = new Set(askedIds || []);
  const tense = questionTense(date);
  for (const id of QUESTION_ORDER) {
    if (asked.has(id)) continue;
    if (id !== 'more' && cats.has(id)) continue;
    return { id, tense: id === 'meal' || id === 'more' ? tense : 'neutral' };
  }
  return null;
}

// "That's it" / "nothing else" typed in the composer (FL-29) — closes the day
// with no AI read, no entry and no fix hint. All 6 languages. Matched on the
// WHOLE message (optionally "no, …", "… for today", "… thanks"), so a real meal
// is never swallowed.
const DONE_PHRASES = new Set([
  // en
  "that's it", 'thats it', "that's all", 'thats all', 'that is all', 'that is it', 'nothing else', 'nothing more', 'no more',
  'done', "i'm done", 'im done', 'all done', 'finished', "that's everything", 'thats everything', 'nope', 'no', 'nothing',
  // es
  'eso es todo', 'es todo', 'nada mas', 'ya esta', 'listo', 'ya', 'nada', 'eso fue todo', 'ya termine', 'nada mas hoy',
  // pt
  'e isso', 'so isso', 'e so isso', 'nada mais', 'mais nada', 'pronto', 'acabou', 'nao', 'terminei', 'e tudo', 'so',
  // fr
  "c'est tout", 'cest tout', "rien d'autre", 'rien dautre', 'plus rien', 'fini', "j'ai fini", 'jai fini', 'non', 'rien', "c'est fini", 'cest fini',
  // de
  "das war's", 'das wars', 'das war es', 'das ist alles', 'nichts mehr', 'sonst nichts', 'fertig', 'nein', 'nichts', 'ich bin fertig', 'das wars schon',
  // it
  'e tutto', 'niente altro', "nient'altro", 'nientaltro', 'basta', 'finito', 'ho finito', 'niente', 'basta cosi', 'nientaltro oggi',
]);
const DONE_SUFFIX = /\s*(for today|today|por hoy|hoy|por hoje|hoje|pour aujourd'hui|pour aujourdhui|aujourd'hui|aujourdhui|fur heute|heute|per oggi|oggi)$/;
const THANKS = /\s*(thanks|thank you|thx|gracias|obrigado|obrigada|merci|danke|grazie)$/;
function normPhrase(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc\u00b4`]/g, "'").replace(/[.!?¡¿;:"()\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function isDoneText(text) {
  const raw = normPhrase(text);
  if (!raw || raw.length > 60) return false;
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => {
    let p = part.replace(THANKS, '').trim();
    p = p.replace(DONE_SUFFIX, '').trim();
    p = p.replace(THANKS, '').trim();
    return !p || DONE_PHRASES.has(p);
  }) && parts.some((part) => DONE_PHRASES.has(part.replace(THANKS, '').trim().replace(DONE_SUFFIX, '').trim().replace(THANKS, '').trim()));
}

// ── Quantity display (FL-8) ───────────────────────────────────────
// "2 × BUILT Puff", "150 g rice", "1 cup coffee". A count unit (bar, piece…,
// or none) reads as "N × food"; a measure reads "N unit food". No qty → name.
const COUNT_UNITS = new Set(['', 'x', 'bar', 'bars', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'item', 'items', 'serving', 'servings',
  'unidad', 'unidades', 'unidade', 'barra', 'barras', 'pieza', 'piezas', 'pedaço', 'pedaços', 'pièce', 'pièces', 'barre', 'barres',
  'stück', 'stk', 'riegel', 'portion', 'portionen', 'porción', 'porciones', 'porção', 'porções', 'pezzo', 'pezzi', 'barretta', 'barrette', 'porzione', 'porzioni']);
function fmtQty(q) {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 100) / 100);
}
function itemLabel(it) {
  const food = String((it && it.food) || '').trim();
  const q = fmtQty(it && it.qty);
  if (!q) return food;
  const unit = String((it && it.unit) || '').trim();
  const u = unit.toLowerCase();
  if (COUNT_UNITS.has(u) || (u && food.toLowerCase().includes(u.replace(/s$/, '')))) return q + ' × ' + food;
  return q + ' ' + unit + ' ' + food;
}
// A vague amount estimated anyway (FL-9): shown as an estimate, tap to fix.
const isLowConfidence = (it) => !!it && it.confidence === 'low';

// Today's earlier items, oldest first, as context for "another one" / "same as
// breakfast" (FL-14). Only entries dated today; max 12 (the server's cap).
function recentForParse(entries, todayISO) {
  const out = [];
  for (const e of foodOnly(entries)) {
    if (e.entry_date !== todayISO || e.parse_status !== 'done') continue;
    let items = e.parsed_items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    for (const it of Array.isArray(items) ? items : []) {
      if (it && it.food) out.push({ food: it.food, qty: it.qty ?? null, unit: it.unit || '', kcal: it.kcal ?? null });
    }
  }
  return out.slice(-12);
}

// Totals of an item list (fat stored, not shown).
function itemTotals(items) {
  const sum = (k) => Math.round((items || []).reduce((a, it) => a + num(it && it[k]), 0));
  return { kcal: sum('kcal'), protein_g: sum('protein_g'), carb_g: sum('carb_g'), fat_g: sum('fat_g') };
}

// A follow-up answer (FL-10/26/28) replaces ONLY the asked item in the same entry
// and recomputes that entry's totals. The corrected item keeps the original's
// days_ago (the entry keeps its date) and category unless the answer set one.
function applyFollowup(items, index, corrected) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!(index >= 0 && index < list.length) || !corrected || !corrected.food) return null;
  const orig = list[index] || {};
  list[index] = { ...corrected, days_ago: orig.days_ago ?? null, category: CATEGORIES.includes(corrected.category) ? corrected.category : orig.category };
  return { items: list, totals: itemTotals(list) };
}

// A pending follow-up still applies only if the entry is unchanged since the
// question was asked — same day, same item count, same asked item. Edited or
// deleted meanwhile → the answer is dropped (FL-28). (Content, not updated_at:
// a sync re-stamps updated_at with the cloud's time without changing anything.)
function followupStillValid(row, pending) {
  if (!row || row.sync_status === 'deleted' || !pending) return false;
  if (row.entry_date !== pending.entry_date) return false;
  let items = row.parsed_items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return false; } }
  if (!Array.isArray(items) || items.length !== pending.count) return false;
  const a = items[pending.index], b = pending.item || {};
  return !!a && a.food === b.food && num(a.kcal) === num(b.kcal) && (a.qty ?? null) === (b.qty ?? null) && (a.unit || '') === (b.unit || '');
}

// Group food_logs entries into days, newest first, each with its own totals — for
// the day-grouped, collapse-by-day list.
function groupByDay(entries) {
  const map = {};
  for (const e of entries || []) {
    if (!e.entry_date) continue;
    (map[e.entry_date] = map[e.entry_date] || []).push(e);
  }
  return Object.keys(map)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => ({ date, entries: map[date], totals: dayTotals(map[date]) }));
}

module.exports = {
  dayTotals, rollingAvgKcal, checkIntake, unloggedCheckDays, entryDateFor, splitByDay, groupByDay,
  SOURCE_NOT_RECORDED, SOURCE_DAY_CLOSED, isMarker, foodOnly, closedDays, notRecordedDays,
  CATEGORIES, todayCategories, questionTense, pickDayQuestion, isDoneText,
  itemLabel, isLowConfidence, recentForParse, itemTotals, applyFollowup, followupStillValid,
};
