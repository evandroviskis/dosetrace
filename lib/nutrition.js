// Pure nutrition-logger math — no React Native / Expo imports, so it runs under
// plain Node's test runner (CommonJS, like lib/schedule.js). All deterministic
// given their args. See docs/nutrition-logger-conversation-spec.md.

const { formatNumber } = require('./localeFormat');
const { parseDecimal } = require('./doseMath');

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
// 'free_start' — the durable anchor of a free user's 7 days (FL-41): no food.
const SOURCE_FREE_START = 'free_start';
// 'ate_nothing' — the user confirmed "I ate nothing" for a day closed with no food
// (FL-47): only then does that empty day count, as a 0-kcal day, toward the 7-day run.
const SOURCE_ATE_NOTHING = 'ate_nothing';
const isMarker = (e) => !!e && (e.source === SOURCE_NOT_RECORDED || e.source === SOURCE_DAY_CLOSED || e.source === SOURCE_FREE_START || e.source === SOURCE_ATE_NOTHING);
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

// Intake for the reality check (FL-3, founder 2026-09-27: "We need 7 days straight
// of calories … otherwise it will be inaccurate"). Only a run of at least 7
// CONSECUTIVE complete days inside the check counts. A day is complete when it has
// food logged (a parsed entry) or was closed with "That's all for today"; a day
// with nothing, or one the user marked "not recorded", breaks the run. Only
// completed days count — start … yesterday — plus today once it is closed.
// The MOST RECENT run of ≥ 7 days is used (all of it). Returns either
//   { ok: true,  totalKcal, days, avgKcal, fromISO, toISO, entries, current, needed }
//   { ok: false, current, needed }   — current = days in a row so far (progress)
// current is the run ending at the latest eligible day (0 if that day is incomplete).
const MIN_RUN_DAYS = 7;
function intakeRun(entries, startISO, todayISO, needed = MIN_RUN_DAYS) {
  if (!startISO || !todayISO || startISO > todayISO) return { ok: false, current: 0, needed };
  const food = foodOnly(entries).filter((e) => e.entry_date && e.parse_status === 'done');
  const fed = new Set(food.map((e) => e.entry_date));
  const closed = closedDays(entries);
  const notRec = notRecordedDays(entries); // a mark on a day later logged no longer applies
  // FL-47: a closed day with NO food counts only when "I ate nothing" was confirmed.
  const ateNothing = daysWith(entries, SOURCE_ATE_NOTHING);
  const complete = (d) => !notRec.has(d) && (fed.has(d) || (closed.has(d) && ateNothing.has(d)));
  // Eligible days, oldest first: start … yesterday, + today when closed.
  const days = [];
  for (let d = startISO, g = 0; d < todayISO && g < 400; d = nextDay(d), g++) days.push(d);
  if (closed.has(todayISO)) days.push(todayISO);
  let best = null, runStart = -1;
  for (let i = 0; i <= days.length; i++) {
    const ok = i < days.length && complete(days[i]);
    if (ok && runStart < 0) runStart = i;
    if (!ok && runStart >= 0) {
      if (i - runStart >= needed) best = { from: runStart, to: i - 1 }; // later runs overwrite → most recent
      runStart = -1;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0 && complete(days[i]); i--) current++;
  if (!best) return { ok: false, current, needed };
  const inRun = new Set(days.slice(best.from, best.to + 1));
  const runFood = food.filter((e) => inRun.has(e.entry_date));
  const total = runFood.reduce((a, e) => a + num(e.kcal), 0);
  const n = best.to - best.from + 1;
  return { ok: true, totalKcal: Math.round(total), days: n, avgKcal: Math.round(total / n), fromISO: days[best.from], toISO: days[best.to], entries: runFood.length, current, needed };
}
function nextDay(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  const p = (v) => (v < 10 ? '0' + v : '' + v);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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

// Catch-ups reach back at most 7 days (FL-2/45, founder 2026-09-27): older food is
// too hard to remember exactly and is NOT logged. An item's own days_ago wins,
// then the message-level one. Returns { keep, dropped } (same item objects).
const MAX_CATCHUP_DAYS = 7;
function withinCatchUp(items, topDaysAgo, maxDays = MAX_CATCHUP_DAYS) {
  const keep = [], dropped = [];
  for (const it of items || []) {
    const d = Math.round(Number(it && it.days_ago != null ? it.days_ago : topDaysAgo) || 0);
    (d > maxDays ? dropped : keep).push(it);
  }
  return { keep, dropped };
}

// What to do with a parsed message under the 7-day rule (FL-45): save the items
// from the last 7 days; if anything was too old, NOTHING of it is lost — the full
// typed text goes back in the composer with the explanation ('too_old' = nothing
// saved, 'too_old_some' = the recent part was saved, the rest is back in the box).
function catchUpOutcome(items, topDaysAgo, raw) {
  const { keep, dropped } = withinCatchUp(items, topDaysAgo);
  if (!dropped.length) return { save: keep, dropped, putBack: null, notice: null };
  return { save: keep, dropped, putBack: raw || '', notice: keep.length ? 'too_old_some' : 'too_old' };
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

// "That's it" / "nothing else today" typed in the composer (FL-29) — closes the
// day with no AI read, no entry and no fix hint. All 6 languages. ONLY explicit
// day-closing phrases: a bare "no" / "nope" / "nada" answers the one question on
// screen (isNoText) and never closes the day. Matched on the WHOLE message
// (optionally "no, …", "… for today", "… thanks"), so a real meal is never swallowed.
const DONE_PHRASES = new Set([
  // en
  "that's it", 'thats it', "that's all", 'thats all', 'that is all', 'that is it', 'nothing else', 'nothing more',
  "i'm done", 'im done', 'all done', "that's everything", 'thats everything', "that's all i had", 'thats all i had',
  // es
  'eso es todo', 'es todo', 'nada mas', 'ya esta', 'eso fue todo', 'ya termine', 'nada mas por hoy',
  // pt
  'e isso', 'so isso', 'e so isso', 'nada mais', 'mais nada', 'terminei', 'e tudo', 'foi so isso',
  // fr
  "c'est tout", 'cest tout', "rien d'autre", 'rien dautre', 'plus rien', "j'ai fini", 'jai fini', "c'est fini", 'cest fini',
  // de
  "das war's", 'das wars', 'das war es', 'das ist alles', 'nichts mehr', 'sonst nichts', 'ich bin fertig', 'das wars schon',
  // it
  'e tutto', 'niente altro', "nient'altro", 'nientaltro', 'ho finito', 'basta cosi', 'nientaltro oggi',
]);
// Words that close the day only WITH a day word: "done for today", "fertig für heute".
const DONE_WITH_DAY = new Set(['done', 'finished', 'listo', 'terminado', 'pronto', 'acabou', 'fini', 'termine', 'fertig', 'finito']);
// A bare "no" — answers the question on screen, never closes the day.
const NO_PHRASES = new Set([
  'no', 'nope', 'nah', 'no thanks', 'no thank you', 'not yet', 'nothing', 'none', 'not really',
  'nada', 'no gracias', 'todavia no', 'aun no', 'ninguno', 'ninguna',
  'nao', 'nao obrigado', 'nao obrigada', 'ainda nao', 'nenhum', 'nenhuma',
  'non', 'non merci', 'pas encore', 'rien', 'aucun', 'aucune',
  'nein', 'nein danke', 'noch nicht', 'nichts', 'keins', 'keine',
  'no grazie', 'non ancora', 'niente', 'nessuno', 'nessuna',
]);
const DONE_SUFFIX = /\s*(for today|today|por hoy|hoy|por hoje|hoje|pour aujourd'hui|pour aujourdhui|aujourd'hui|aujourdhui|fur heute|heute|per oggi|oggi)$/;
const THANKS = /\s*(thanks|thank you|thx|gracias|obrigado|obrigada|merci|danke|grazie)$/;
function normPhrase(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02bc\u00b4`]/g, "'").replace(/[.!?¡¿;:"()\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// 'close' | 'no' | null for one comma-separated part.
function partKind(part) {
  const p0 = part.replace(THANKS, '').trim();
  const hasDay = DONE_SUFFIX.test(p0);
  const p = p0.replace(DONE_SUFFIX, '').trim().replace(THANKS, '').trim();
  if (!p) return 'filler';
  if (DONE_PHRASES.has(p)) return 'close';
  if (hasDay && DONE_WITH_DAY.has(p)) return 'close';
  if (hasDay && NO_PHRASES.has(p)) return 'close'; // "nothing today" / "nada hoy"
  if (NO_PHRASES.has(p)) return 'no';
  return null;
}
function phraseParts(text) {
  const raw = normPhrase(text);
  if (!raw || raw.length > 60) return null;
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts.map(partKind) : null;
}
// Explicit "I'm done for today" (closes the day).
function isDoneText(text) {
  const k = phraseParts(text);
  return !!k && k.every((x) => x === 'close' || x === 'no' || x === 'filler') && k.includes('close');
}
// A bare "no" (dismisses the question on screen; the day stays open).
function isNoText(text) {
  const k = phraseParts(text);
  return !!k && k.every((x) => x === 'no' || x === 'filler') && k.includes('no');
}

// "Another one" / "same as breakfast" with no food named (FL-14). When nothing
// is logged today the APP asks what it was instead of letting the parser guess.
// All 6 languages; whole-message match, so "another coffee" (food named) passes.
const EARLIER_REF = [
  /^(i had |had |i ate |ate |and )?(another( one)?|one more( one)?|same again|again|the same( again| thing)?|same( thing)?( again)?|(the )?same( thing)? as .+)$/,
  /^(y )?(otro|otra|otro mas|otra mas|uno mas|una mas|otra vez|lo mismo( que .+| de .+)?|igual( que .+)?|otro igual|otra igual)$/,
  /^(e )?(outro|outra|mais um|mais uma|de novo|o mesmo( que .+| de .+| do .+| da .+)?|a mesma coisa( que .+| de .+| do .+| da .+)?|a mesma( que .+| do .+| da .+)?|igual( ao .+| a .+)?|outro igual|outra igual)$/,
  /^(et )?(un autre|une autre|encore un|encore une|encore|la meme chose( que .+)?|pareil( que .+)?|le meme( que .+)?|la meme( que .+)?)$/,
  /^(und )?(noch (ein|eine|einer|eins|einen)|nochmal|noch mal|das gleiche( wie .+)?|dasselbe( wie .+)?|dieselbe( wie .+)?|dasgleiche( wie .+)?|gleiche wie .+)$/,
  /^(e )?(un altro|un'altra|unaltra|un altra|ancora uno|ancora una|di nuovo|lo stesso( di .+| che .+)?|la stessa( cosa)?( di .+| che .+)?|uguale( a .+)?)$/,
];
function refersToEarlier(text) {
  const t = normPhrase(text).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 60) return false;
  return EARLIER_REF.some((re) => re.test(t));
}
// Ask instead of guessing: an "another one" with nothing logged today.
const mustAskWhichEarlier = (text, todayItems) => refersToEarlier(text) && !(todayItems && todayItems.length);

// ── Quantity display (FL-8) ───────────────────────────────────────
// "2 × BUILT Puff", "150 g rice", "1 cup coffee". A count unit (bar, piece…,
// or none) reads as "N × food"; a measure reads "N unit food". No qty → name.
const COUNT_UNITS = new Set(['', 'x', 'bar', 'bars', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'item', 'items', 'serving', 'servings',
  'unidad', 'unidades', 'unidade', 'barra', 'barras', 'pieza', 'piezas', 'pedaço', 'pedaços', 'pièce', 'pièces', 'barre', 'barres',
  'stück', 'stk', 'riegel', 'portion', 'portionen', 'porción', 'porciones', 'porção', 'porções', 'pezzo', 'pezzi', 'barretta', 'barrette', 'porzione', 'porzioni']);
// The quantity in the app language's decimal ("0,5 xícara" in Portuguese, founder 2026-10-02).
function fmtQty(q, language = 'en') {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatNumber(Math.round(n * 100) / 100, language, { grouping: false });
}
// Measures never name the food itself (A-100: unit "g" matched the "g" in "grilled chicken").
const MEASURE_UNITS = new Set(['g', 'gr', 'kg', 'mg', 'mcg', 'µg', 'ml', 'l', 'dl', 'cl', 'oz', 'fl oz', 'lb', 'lbs',
  'cup', 'cups', 'tbsp', 'tsp', 'xícara', 'xícaras', 'taza', 'tazas', 'tasse', 'tasses', 'tazza', 'tazze', 'el', 'tl']);
// The unit is the food itself ("3 egg" of "eggs", "2 bars" of "BUILT Puff bar") when a word of
// the food starts with it.
function unitIsFood(u, food) {
  const stem = u.replace(/s$/, '');
  if (stem.length < 3 || MEASURE_UNITS.has(u)) return false;
  return food.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(stem));
}
function itemLabel(it, language = 'en') {
  const food = String((it && it.food) || '').trim();
  const q = fmtQty(it && it.qty, language);
  if (!q) return food;
  const unit = String((it && it.unit) || '').trim();
  const u = unit.toLowerCase();
  if (COUNT_UNITS.has(u) || (u && unitIsFood(u, food))) return q + ' × ' + food;
  return q + ' ' + unit + ' ' + food;
}
// A vague amount estimated anyway (FL-9): shown as an estimate, tap to fix.
const isLowConfidence = (it) => !!it && it.confidence === 'low';

// Shown as an estimate (FL-9/27): a vague amount, or an item the parser asked
// about that never got an answer (skipped, or a new meal typed instead). A value
// the user fixed ('user') or a follow-up answer clears it.
const needsEstimateFlag = (it) => !!it && it.confidence !== 'user' && (it.confidence === 'low' || it.asked === true);

// The echo (FL-7/8): up to `max` items, then how many more — nothing dropped silently.
function echoParts(items, max = 3) {
  const list = (items || []).filter((it) => it && it.food);
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

// Totals over local days fromISO…toISO inclusive (FL-24: per day, week, window).
// Days the user marked "not recorded" leave the divisor. Returns { kcal,
// protein_g, carb_g, days, loggedDays, avgKcal } — the working behind each line.
function periodTotals(entries, fromISO, toISO) {
  if (!fromISO || !toISO || fromISO > toISO) return null;
  const inRange = (d) => d && d >= fromISO && d <= toISO;
  const food = foodOnly(entries).filter((e) => inRange(e.entry_date));
  const t = dayTotals(food);
  let span = 0;
  for (let d = toISO, g = 0; d >= fromISO && g < 400; d = entryDateFor(d, 1), g++) span++;
  let nr = 0;
  for (const d of notRecordedDays(entries)) if (inRange(d)) nr++;
  const days = Math.max(0, span - nr);
  const loggedDays = new Set(food.filter((e) => num(e.kcal) > 0).map((e) => e.entry_date)).size;
  return { ...t, days, loggedDays, avgKcal: days ? Math.round(t.kcal / days) : 0 };
}

// Offline rows to (re)parse (FL-19). A row TYPED ON THIS DEVICE (its key is in
// localKeys) is parsed until it resolves, even after sync gave it a remote_id;
// a row never synced (no remote_id) is local by definition. A pending row pulled
// from another device is left to that device (no double AI call).
const localRowKey = (row) => (row ? row.id + '|' + (row.created_at || '') : '');
function rowsToReparse(rows, localKeys) {
  const keys = localKeys instanceof Set ? localKeys : new Set(localKeys || []);
  return (rows || []).filter((r) => r && r.parse_status === 'pending' && r.raw_text && !isMarker(r) && (!r.remote_id || keys.has(localRowKey(r))));
}

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

// "Your reality check so far" (Journey redesign part 8, founder 2026-10-02): one row per
// day of the open check, newest first — { date, kcal, items, state: 'food' | 'none' |
// 'not_recorded' } — and the current run of complete days with its average (the same
// days intakeRun counts: start … yesterday, plus today once closed).
function itemCount(e) {
  let items = e && e.parsed_items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  return Array.isArray(items) ? items.length : 0;
}
function checkSoFar(entries, startISO, todayISO) {
  const empty = { rows: [], run: { days: 0, avgKcal: 0 } };
  if (!startISO || !todayISO || startISO > todayISO) return empty;
  const food = foodOnly(entries).filter((e) => e.entry_date && e.parse_status === 'done');
  const notRec = notRecordedDays(entries);
  const rows = [];
  for (let d = todayISO, g = 0; d >= startISO && g < 400; d = entryDateFor(d, 1), g++) {
    const day = food.filter((e) => e.entry_date === d);
    const kcal = Math.round(day.reduce((a, e) => a + num(e.kcal), 0));
    const items = day.reduce((a, e) => a + itemCount(e), 0);
    rows.push({ date: d, kcal, items, state: day.length ? 'food' : notRec.has(d) ? 'not_recorded' : 'none' });
  }
  const r = intakeRun(entries, startISO, todayISO);
  const days = [];
  for (let d = startISO, g = 0; d < todayISO && g < 400; d = nextDay(d), g++) days.push(d);
  if (closedDays(entries).has(todayISO)) days.push(todayISO);
  const inRun = new Set(days.slice(days.length - r.current));
  const total = food.filter((e) => inRun.has(e.entry_date)).reduce((a, e) => a + num(e.kcal), 0);
  return { rows, run: { days: r.current, avgKcal: r.current ? Math.round(total / r.current) : 0 } };
}

// "Fix this entry" (Journey redesign part 23, founder 2026-10-02): the items as the user left
// them. Each edited copy carries `__orig` (its index in the stored items), so a renamed item
// still compares against its own original. A changed name or number makes the item the
// user's (confidence 'user', FL-9) and drops any open or offline follow-up on it (FL-28);
// an emptied name falls back to the original; the category and quantity are kept (FL-23).
function editedItems(orig, items) {
  const numOr = (v, d = 0) => { const n = parseDecimal(v); return Number.isFinite(n) ? n : d; }; // A-26: "1,200" kcal = 1200
  return (items || []).map((it) => {
    const { __orig, ...rest } = it || {};
    const o = (orig && Number.isInteger(__orig) && orig[__orig]) || {};
    const name = String(rest.food == null ? '' : rest.food).trim();
    const next = { ...rest, food: name || o.food || rest.food, kcal: numOr(rest.kcal), carb_g: numOr(rest.carb_g), protein_g: numOr(rest.protein_g) };
    const changed = (o.food || '') !== (next.food || '') || numOr(o.kcal) !== next.kcal || numOr(o.carb_g) !== next.carb_g
      || numOr(o.protein_g) !== next.protein_g || (o.category || null) !== (next.category || null);
    if (changed) {
      next.confidence = 'user';
      if (next.ask && !next.ask_done) next.ask_skipped = true;
      delete next.ask_pending;
    }
    return next;
  });
}

module.exports = {
  checkSoFar, editedItems,
  dayTotals, rollingAvgKcal, intakeRun, MIN_RUN_DAYS, unloggedCheckDays, entryDateFor, splitByDay, groupByDay, withinCatchUp, catchUpOutcome, MAX_CATCHUP_DAYS,
  SOURCE_NOT_RECORDED, SOURCE_DAY_CLOSED, SOURCE_FREE_START, isMarker, foodOnly, closedDays, notRecordedDays,
  CATEGORIES, todayCategories, questionTense, pickDayQuestion, isDoneText, isNoText, refersToEarlier, mustAskWhichEarlier,
  itemLabel, isLowConfidence, needsEstimateFlag, echoParts, periodTotals, localRowKey, rowsToReparse,
  recentForParse, itemTotals, applyFollowup, followupStillValid,
};
