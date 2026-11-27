// Pure nutrition-logger math — no React Native / Expo imports, so it runs under
// plain Node's test runner (CommonJS, like lib/schedule.js). All deterministic
// given their args. See docs/nutrition-logger-conversation-spec.md.

const { formatNumber, inputNumber } = require('./localeFormat');
const { parseDecimal } = require('./doseMath');
const { localISO } = require('./localDate');

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
  return localISO(d);
}

// Day key an entry belongs to: the day it was typed, moved back when the user
// said when they ate it ("3 days ago" → days_ago 3). Clamped to 0…365.
function entryDateFor(typedISO, daysAgo) {
  const n = Math.max(0, Math.min(365, Math.round(Number(daysAgo) || 0)));
  if (!n) return typedISO;
  const d = new Date(typedISO + 'T12:00:00');
  if (isNaN(d)) return typedISO;
  d.setDate(d.getDate() - n);
  return localISO(d);
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

// The item categories the parser returns. Still stored on every item (the per-item tag is no
// longer shown, FR-8); the day question that used them after each entry (FL-4/5) was replaced
// by the goodbye (docs/specs/food-log-recent-receipt.md FR-12, founder 2026-11-26).
const CATEGORIES = ['meal', 'snack', 'drink', 'supplement'];

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
  'stück', 'stk', 'riegel', 'portion', 'portionen', 'porción', 'porciones', 'porção', 'porções', 'pezzo', 'pezzi', 'barretta', 'barrette', 'porzione', 'porzioni',
  // A-141: the short generic count words the model also writes ("6 un", "3 uds", "2 Stk.", "4 pz").
  'un', 'u', 'ud', 'uds', 'und', 'unds', 'unid', 'unids', 'unité', 'unités', 'unità', 'st', 'pz', 'pzs', 'pza', 'pzas', 'ea', 'each']);
// The quantity in the app language's decimal ("0,5 xícara" in Portuguese, founder 2026-10-02).
function fmtQty(q, language = 'en') {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatNumber(Math.round(n * 100) / 100, language, { grouping: false });
}
// Measures never name the food itself (A-100: unit "g" matched the "g" in "grilled chicken").
const MEASURE_UNITS = new Set(['g', 'gr', 'kg', 'mg', 'mcg', 'µg', 'ml', 'l', 'dl', 'cl', 'oz', 'fl oz', 'lb', 'lbs',
  'cup', 'cups', 'tbsp', 'tsp', 'xícara', 'xícaras', 'taza', 'tazas', 'tasse', 'tasses', 'tazza', 'tazze', 'el', 'tl']);
// The unit is the food itself ("3 egg" of "eggs", "2 bars" of "BUILT Puff bar", "Shake" of
// "Proteinshake") when a word of the food is the unit (a plural ending allowed) or a compound
// that ends with it (A-133) — never a unit inside another word ("pot" of "potato salad").
// How-to recording 2026-11-26: œ/æ written as oe/ae count as the same letters ("œuf" of "oeufs"), and
// an Italian-style singular/plural that changes only the last vowel counts ("uovo" of "uova", "mela"
// of "mele"); the vowel-swap stem must keep 3 letters, so "pot" of "potato" stays a measure.
const foldLig = (s) => s.replace(/œ/g, 'oe').replace(/æ/g, 'ae');
function unitIsFood(u, food) {
  if (MEASURE_UNITS.has(u)) return false;
  const uu = foldLig(u.toLowerCase());
  const stem = uu.replace(/s$/, '');
  if (stem.length < 3) return false;
  const vstem = /[aeiou]$/.test(stem) && stem.length >= 4 ? stem.slice(0, -1) : null;
  return foldLig(food.toLowerCase()).split(/[^\p{L}\p{N}]+/u).some((w) =>
    (w.startsWith(stem) && /^(s|es|n|en|e)?$/.test(w.slice(stem.length))) || (w.length >= stem.length + 3 && w.endsWith(stem))
    || (vstem && w.length === vstem.length + 1 && w.startsWith(vstem) && /[aeiou]$/.test(w)));
}
// A measure joins the food with the language's "of" (A-133): fr/es/pt "de" (fr d’ before a vowel
// or a mute h), it "di"; en and de put the food right after ("150 g rice", "150 g Reis").
const OF_WORD = { fr: 'de', es: 'de', pt: 'de', it: 'di' };
const H_ASPIRE = /^(haricot|hamburger|hachis|homard|hareng|hot[- ]?dog|houblon)/i;
function measureOf(unitPart, food, language) {
  const w = OF_WORD[language];
  if (!w || /^(de|di|d['’])(\s|$)/i.test(food) || /^d['’]/i.test(food)) return unitPart + ' ' + food;
  if (language === 'fr' && /^[aeiouyàâäéèêëîïôöùûüœæh]/i.test(food) && !/^y/i.test(food) && !H_ASPIRE.test(food)) return unitPart + ' d’' + food;
  return unitPart + ' ' + w + ' ' + food;
}
// A unit stored cut inside a parenthesis (A-133: the server capped "porção pequena (300 ml)" at
// "porção pequena (") drops the open fragment; trailing punctuation goes. A whole "(15 ml)" stays.
function cleanUnit(u) {
  let s = String(u == null ? '' : u).trim();
  const open = Math.max(s.lastIndexOf('('), s.lastIndexOf('['));
  if (open >= 0 && s.indexOf(s[open] === '(' ? ')' : ']', open) < 0) s = s.slice(0, open);
  return s.replace(/[\s([{,;:\-–—\/·.]+$/u, '').trim();
}
// A-151: German nouns are capitalised, units too ("1 Tasse Milchkaffee", never "1 tasse"). In German
// only, a unit word that is all lowercase and is (or is a compound ending in) a known unit noun gets
// its capital; "el" / "tl" / "stk" are the usual "EL" / "TL" / "Stk". Adjectives ("großes Glas"),
// measures (g, ml) and words with capitals of their own are left alone; the other five languages are
// never touched (fr "tasse", pt "xícara" stay lowercase). Display only: the stored row is unchanged.
// The server (parse-food unitCase) keeps the same list.
const DE_UNIT_NOUNS = new Set(['tasse', 'tassen', 'glas', 'gläser', 'scheibe', 'scheiben', 'becher', 'stück', 'stücke', 'portion', 'portionen',
  'löffel', 'schüssel', 'schüsseln', 'teller', 'flasche', 'flaschen', 'dose', 'dosen', 'riegel', 'packung', 'packungen', 'päckchen', 'handvoll',
  'prise', 'prisen', 'kugel', 'kugeln', 'schale', 'schalen', 'stange', 'stangen', 'tüte', 'tüten', 'beutel', 'schluck', 'kanne', 'kannen',
  'liter', 'scoop', 'scoops', 'shake', 'shakes', 'kapsel', 'kapseln', 'tablette', 'tabletten', 'tafel', 'tafeln', 'würfel', 'streifen', 'laib']);
const DE_UNIT_ABBR = { el: 'EL', tl: 'TL', stk: 'Stk' };
function unitCase(unit, language) {
  const s = unit == null ? '' : String(unit);
  if (language !== 'de' || !s) return s;
  return s.replace(/\p{L}+/gu, (w) => {
    if (w !== w.toLowerCase()) return w;
    if (DE_UNIT_ABBR[w]) return DE_UNIT_ABBR[w];
    const noun = DE_UNIT_NOUNS.has(w) || [...DE_UNIT_NOUNS].some((n) => n.length >= 4 && w.length > n.length && w.endsWith(n));
    return noun ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  });
}
// A generic food name the model capitalized ("Frango grelhado") reads the way the user typed it
// mid-sentence (A-133). It can never touch a brand: only the FIRST letter is lowered, and only when
// the name has 2+ words, that first letter is its only capital ("BUILT Puff", "Muscle Milk",
// "Red Bull" never qualify), the user's own raw_text holds the same phrase starting lowercase,
// and the language is not German (nouns are capitalized). A single word ("Isopure") is never changed.
function foodCase(food, rawText, language = 'en') {
  const f = String(food == null ? '' : food);
  if (!f || !rawText || language === 'de') return f;
  const first = f.charAt(0);
  const rest = f.slice(1);
  if (first === first.toLowerCase() || rest !== rest.toLowerCase() || !/\s/.test(f.trim())) return f;
  const lower = first.toLowerCase() + rest;
  return String(rawText).replace(/\s+/g, ' ').includes(lower) ? lower : f;
}
// A-141: a name that repeats the item's own amount. The follow-up sends "6 un ravioli com molho"
// and the model may write all of it back into "food" ("6 un ravioli com molho de tomate", qty 6,
// unit "un"), or fold the unit into the name ("bol pâtes au poulet", unit "bol"). Dropped here:
// a leading number equal to qty (with "×" / "x", then the unit or a count word, then of / de / di /
// d'), or a leading measure / container word equal to the unit. A name whose first number is not
// the qty ("7 grain bread") or whose unit is the food itself ("batido de proteína") is kept.
const CONTAINER_UNITS = new Set(['bowl', 'bowls', 'bol', 'bols', 'tigela', 'tigelas', 'cuenco', 'cuencos', 'tazón', 'tazones', 'schüssel', 'schüsseln',
  'ciotola', 'ciotole', 'plate', 'plates', 'prato', 'pratos', 'plato', 'platos', 'assiette', 'assiettes', 'teller', 'piatto', 'piatti',
  'glass', 'glasses', 'copo', 'copos', 'vaso', 'vasos', 'verre', 'verres', 'glas', 'gläser', 'bicchiere', 'bicchieri']);
const OF_LEAD = /^(?:(?:of|de|di)\s+|d['’]\s*)/i;
const LEAD_QTY = /^(\d+(?:[.,]\d+)?)(?:\s*[×x]\s+|\s+)/i;
function leadWord(text, word) {
  const w = String(word || '').toLowerCase();
  if (!w || text.slice(0, w.length).toLowerCase() !== w) return null;
  const rest = text.slice(w.length);
  return /^\s+/.test(rest) ? rest.replace(/^\s+/, '') : null;
}
function dropRepeatedAmount(food, qty, unit) {
  const f = String(food || '').trim();
  const u = String(unit || '').toLowerCase();
  const m = f.match(LEAD_QTY);
  let rest = null;
  if (m && Math.abs(Number(m[1].replace(',', '.')) - Number(qty)) < 1e-9) {
    rest = f.slice(m[0].length);
    let r = u && !COUNT_UNITS.has(u) ? leadWord(rest, unit) : null;
    if (r == null) {
      const first = (rest.match(/^\S+/) || [''])[0];
      const w = cleanUnit(first).toLowerCase();
      if (w && (COUNT_UNITS.has(w) || w === u)) r = leadWord(rest, first);
    }
    if (r != null) rest = r.replace(OF_LEAD, '');
  } else if (u && (MEASURE_UNITS.has(u) || CONTAINER_UNITS.has(u))) {
    const r = leadWord(f, unit);
    if (r != null) rest = r.replace(OF_LEAD, '');
  }
  return rest && rest.trim() ? rest.trim() : f;
}
// The model writes count units in the singular ("3 fatia de bacon", Fold 2026-11-26): the label makes the
// first word of a known unit agree with a quantity above 1 (French from 2). Display only; a unit the app
// does not know, or one already in the plural, is left as written. German keeps its capital.
const UNIT_PLURALS = {
  pt: { fatia: "fatias", colher: "colheres", "xícara": "xícaras", copo: "copos", pote: "potes", unidade: "unidades", "porção": "porções", "pedaço": "pedaços", lata: "latas", garrafa: "garrafas", scoop: "scoops", concha: "conchas", prato: "pratos", tigela: "tigelas", barra: "barras", punhado: "punhados", "filé": "filés", bife: "bifes", taça: "taças", sachê: "sachês", "cápsula": "cápsulas", comprimido: "comprimidos", dose: "doses", folha: "folhas", ramo: "ramos", cubo: "cubos", "rodela": "rodelas", "bola": "bolas" },
  es: { rebanada: "rebanadas", cucharada: "cucharadas", cucharadita: "cucharaditas", taza: "tazas", vaso: "vasos", unidad: "unidades", "porción": "porciones", pedazo: "pedazos", lata: "latas", botella: "botellas", scoop: "scoops", plato: "platos", "tazón": "tazones", barra: "barras", "puñado": "puñados", "filete": "filetes", "loncha": "lonchas", "cápsula": "cápsulas" },
  en: { slice: "slices", cup: "cups", tablespoon: "tablespoons", teaspoon: "teaspoons", scoop: "scoops", piece: "pieces", serving: "servings", can: "cans", bottle: "bottles", glass: "glasses", bowl: "bowls", bar: "bars", handful: "handfuls", plate: "plates", strip: "strips", fillet: "fillets", capsule: "capsules", packet: "packets" },
  fr: { tranche: "tranches", "cuillère": "cuillères", tasse: "tasses", verre: "verres", pot: "pots", portion: "portions", morceau: "morceaux", canette: "canettes", bouteille: "bouteilles", bol: "bols", barre: "barres", "poignée": "poignées", assiette: "assiettes", "gélule": "gélules", scoop: "scoops" },
  it: { fetta: "fette", cucchiaio: "cucchiai", cucchiaino: "cucchiaini", tazza: "tazze", bicchiere: "bicchieri", vasetto: "vasetti", porzione: "porzioni", pezzo: "pezzi", lattina: "lattine", bottiglia: "bottiglie", ciotola: "ciotole", barretta: "barrette", manciata: "manciate", piatto: "piatti", scoop: "scoop", capsula: "capsule" },
  de: { scheibe: "Scheiben", tasse: "Tassen", glas: "Gläser", portion: "Portionen", dose: "Dosen", flasche: "Flaschen", "schüssel": "Schüsseln", schale: "Schalen", kapsel: "Kapseln", packung: "Packungen", scoop: "Scoops" },
};
function unitForQty(unit, qty, language) {
  const n = Number(qty);
  const table = UNIT_PLURALS[language];
  if (!unit || !table || !Number.isFinite(n) || n <= 1 || (language === "fr" && n < 2)) return unit;
  const m = String(unit).match(/^(\p{L}+)(.*)$/u);
  if (!m) return unit;
  const plural = table[m[1].toLowerCase()];
  if (!plural) return unit;
  const word = m[1][0] === m[1][0].toUpperCase() && language !== "de" ? plural[0].toUpperCase() + plural.slice(1) : plural;
  return word + m[2];
}
function itemLabel(it, language = 'en', rawText) {
  const food = foodCase(dropRepeatedAmount((it && it.food) || '', it && it.qty, cleanUnit(it && it.unit)), rawText, language);
  const q = fmtQty(it && it.qty, language);
  if (!q) return food;
  const unit = unitCase(cleanUnit(it && it.unit), language);
  const u = unit.toLowerCase();
  if (COUNT_UNITS.has(u) || (u && unitIsFood(u, food))) return q + ' × ' + food;
  return measureOf(q + ' ' + unitForQty(unit, it && it.qty, language), food, language);
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

// Offline rows to (re)parse (FL-19): every pending entry of the account, until it resolves. A-213: FL-19
// left an uploaded pending row "to the device that typed it"; under one device at a time (AD-77 / A-119)
// that device is this one or is gone, so after a sign-out / sign-in or on a new phone the entry was never
// read anywhere. localKeys (this phone's typed rows) is kept for callers; it no longer filters.
const localRowKey = (row) => (row ? row.id + '|' + (row.created_at || '') : '');
// DV-066 (DL-28): todayISO (the local day) also brings back the rows the daily read limit refused
// ('quota_wait:<day>'), once that day has passed — never on the day they were refused.
function rowsToReparse(rows, localKeys, todayISO) { // eslint-disable-line no-unused-vars
  return (rows || []).filter((r) => {
    if (!r || !r.raw_text || isMarker(r)) return false;
    if (r.parse_status === 'pending') return true;
    const day = quotaWaitDay(r.parse_status);
    return !!(day && todayISO && day < todayISO);
  });
}
// DV-066: an offline row the daily read limit refused keeps its text and waits for a later local day; the
// day it was refused is part of its status (parse_status is free text, synced as is).
const QUOTA_WAIT = 'quota_wait';
const quotaWaitStatus = (dayISO) => `${QUOTA_WAIT}:${String(dayISO).slice(0, 10)}`;
function quotaWaitDay(status) {
  const m = /^quota_wait:(\d{4}-\d{2}-\d{2})$/.exec(String(status || ''));
  return m ? m[1] : null;
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

// Fiber (founder 2026-11-08/09, docs/specs/food-fiber-week.md): a number only, never a target. It lives
// in each item's fiber_g inside parsed_items (synced with the row, no new column). Items read before the
// AI returned fiber have none: the sum counts only items that have it, and is null when none does, so an
// old entry never shows a false "0 g".
const fiberOf = (it) => (it && typeof it.fiber_g === 'number' && Number.isFinite(it.fiber_g) && it.fiber_g >= 0 ? it.fiber_g : null);
function itemsFiber(items) {
  let known = false, g = 0;
  for (const it of items || []) { const f = fiberOf(it); if (f != null) { known = true; g += f; } }
  return known ? Math.round(g * 10) / 10 : null;
}
// The fix screen's fiber field (founder 2026-11-24, docs/design/comida-fibra-corrigir.html option A): the
// stored number with one decimal in the app language ("7,5" pt, "7.5" en); no fiber → '' (the faded "—"
// placeholder shows, never a made-up 0); text being typed stays as typed.
function fiberFieldText(v, language) {
  if (typeof v === 'string') return v;
  const f = fiberOf({ fiber_g: v });
  return f == null ? '' : inputNumber(Math.round(f * 10) / 10, language);
}
// The fiber the person left in that field: untouched → the stored number as it is; erased → null (no
// fiber, never 0); typed → read in the app language, one decimal; unreadable → the stored number.
function editedFiber(v, stored, language) {
  if (typeof v !== 'string') return v;
  if (!v.trim()) return null;
  const n = parseDecimal(v, language);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : stored;
}

// Totals of an item list (fat stored, not shown).
function itemTotals(items) {
  const sum = (k) => Math.round((items || []).reduce((a, it) => a + num(it && it[k]), 0));
  return { kcal: sum('kcal'), protein_g: sum('protein_g'), carb_g: sum('carb_g'), fat_g: sum('fat_g') };
}

// A follow-up answer (FL-10/26/28) replaces ONLY the asked item in the same entry
// and recomputes that entry's totals. The corrected item keeps the original's
// days_ago (the entry keeps its date) and category unless the answer set one.
// A-133: the answer's numbers never silently zero a known value. A missing or non-numeric
// number keeps the stored one (scaled by the new/old kcal ratio when the kcal changed); a 0
// replaces a known non-zero value only when the answer is a real re-estimate — all four
// numbers given and the macros explain its kcal (4/4/9 kcal per g, within 30% or 20 kcal).
const MACROS = ['protein_g', 'carb_g', 'fat_g'];
const given = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function isReEstimate(it) {
  if (!['kcal', ...MACROS].every((k) => given(it[k]))) return false;
  const energy = 4 * it.protein_g + 4 * it.carb_g + 9 * it.fat_g;
  return Math.abs(energy - it.kcal) <= Math.max(20, 0.3 * it.kcal);
}
function mergeNumbers(orig, corrected) {
  const whole = isReEstimate(corrected);
  const known = (k) => given(orig[k]) && orig[k] > 0;
  const take = (k) => given(corrected[k]) && (corrected[k] > 0 || whole || !known(k));
  const out = {};
  out.kcal = take('kcal') ? corrected.kcal : (orig.kcal ?? null);
  const ratio = given(orig.kcal) && orig.kcal > 0 && given(out.kcal) && out.kcal > 0 ? out.kcal / orig.kcal : 1;
  for (const k of MACROS) {
    if (take(k)) out[k] = corrected[k];
    else out[k] = given(orig[k]) ? Math.round(orig[k] * ratio * 10) / 10 : (orig[k] ?? null);
  }
  return out;
}

function applyFollowup(items, index, corrected) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!(index >= 0 && index < list.length) || !corrected || !corrected.food) return null;
  const orig = list[index] || {};
  const merged = mergeNumbers(orig, corrected);
  // Fiber: the answer's own number, else the stored one scaled like the macros (never dropped).
  const ratio = given(orig.kcal) && orig.kcal > 0 && given(merged.kcal) && merged.kcal > 0 ? merged.kcal / orig.kcal : 1;
  const fiber = fiberOf(corrected) != null ? fiberOf(corrected) : fiberOf(orig) != null ? Math.round(fiberOf(orig) * ratio * 10) / 10 : null;
  list[index] = { ...corrected, ...merged, fiber_g: fiber, days_ago: orig.days_ago ?? null, category: CATEGORIES.includes(corrected.category) ? corrected.category : orig.category };
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
// still compares against its own original. A changed name or number (fiber included) makes the item the
// user's (confidence 'user', FL-9) and drops any open or offline follow-up on it (FL-28);
// an emptied name falls back to the original; the category is kept (FL-23).
// FR-16 (founder 2026-11-26, docs/design/quantidade-refeicao.html): the quantity can be changed too
// (withQty below). It is saved as the last readable number (> 0) the person left; empty, 0 or
// unreadable keeps the quantity the numbers belong to. The editor shows the name without the amount
// (editorItems); an untouched name with the same quantity keeps its stored text exactly, and a new
// quantity saves the plain name, so the label (itemLabel) never reads "200 g de 150 g de frango".
function editedItems(orig, items, language) {
  const numOr = (v, d = 0) => { const n = parseDecimal(v, language); return Number.isFinite(n) ? n : d; }; // A-26: "1,200" kcal = 1200
  return (items || []).map((it) => {
    const { __orig, __base, __qn, ...rest } = it || {};
    const o = (orig && Number.isInteger(__orig) && orig[__orig]) || {};
    const name = String(rest.food == null ? '' : rest.food).trim();
    const next = { ...rest, kcal: numOr(rest.kcal), carb_g: numOr(rest.carb_g), protein_g: numOr(rest.protein_g) };
    if ('qty' in rest || __qn != null) {
      const typed = validQty(rest.qty, language);
      const q = typed != null ? typed : __qn != null ? __qn : o.qty;
      if (q === undefined) delete next.qty; else next.qty = q;
    }
    const qtyChanged = validQty(o.qty, language) !== validQty(next.qty, language);
    const plain = nameWithoutAmount(o);
    next.food = name && o.food && name === plain && !qtyChanged ? o.food : name || (qtyChanged && plain) || o.food || rest.food;
    // Fiber (FW-12..FW-15): only what the person typed in its own field (or a quantity change, FR-16);
    // kcal / carbs / protein typed never rescale it.
    if ('fiber_g' in rest) next.fiber_g = editedFiber(rest.fiber_g, fiberOf(o), language);
    const changed = (o.food || '') !== (next.food || '') || numOr(o.kcal) !== next.kcal || numOr(o.carb_g) !== next.carb_g
      || numOr(o.protein_g) !== next.protein_g || fiberOf(o) !== fiberOf(next) || (o.category || null) !== (next.category || null)
      || qtyChanged || num(o.fat_g) !== num(next.fat_g);
    if (changed) {
      next.confidence = 'user';
      if (next.ask && !next.ask_done) next.ask_skipped = true;
      delete next.ask_pending;
    }
    return next;
  });
}

// ── FR-16: the quantity on "Corrigir este registro" (founder 2026-11-26, decision 2dfc02ff, picture
// docs/design/quantidade-refeicao.html). Changing the quantity multiplies kcal, carbs, protein, fat and
// fiber by new / old, on the phone (no AI, no parse-food, works offline). The ratio is always taken from
// a base (the numbers and the quantity they belong to): the stored values when the sheet opens, re-taken
// whenever the person types a number (the typed number wins, and a later quantity change scales from
// it). No quantity = the current numbers are 1 portion. kcal / carbs / protein whole (as their fields),
// fat and fiber one decimal; a number that is unknown stays unknown (fiber is never made up).
const SCALED = { kcal: 0, carb_g: 0, protein_g: 0, fat_g: 1, fiber_g: 1 };
const STEP_10 = new Set(['g', 'gr', 'ml']);
// A readable quantity above 0, in the app language ("0,5" pt, "1.250" pt = 1250), else null.
function validQty(v, language) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = parseDecimal(v, language);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}
// The name without a leading copy of its own amount ("150 g de frango grelhado" -> "frango grelhado").
function nameWithoutAmount(it) {
  if (!it || it.food == null) return '';
  return dropRepeatedAmount(String(it.food), it.qty, cleanUnit(it.unit));
}
function snapNumbers(it, language) {
  const out = {};
  for (const k of Object.keys(SCALED)) {
    const v = it ? it[k] : null;
    let n = null;
    if (typeof v === 'number') n = Number.isFinite(v) ? v : null;
    else if (typeof v === 'string' && v.trim()) { const p = parseDecimal(v, language); n = Number.isFinite(p) ? p : null; }
    out[k] = n;
  }
  return out;
}
// The quantity the current numbers belong to.
const numbersQty = (it, language) => (it && it.__qn !== undefined ? it.__qn : validQty(it && it.qty, language));
// The sheet's copies of the stored items: each knows its place (__orig), its base and the quantity of its
// numbers (__qn); the name field shows the food without the amount. No quantity key is added.
function editorItems(stored) {
  return (stored || []).map((it, i) => {
    const qn = validQty(it && it.qty);
    const c = { ...it, __orig: i, __qn: qn, __base: { ...snapNumbers(it), qty: qn } };
    if (it && it.food != null) c.food = nameWithoutAmount(it) || it.food;
    return c;
  });
}
// The quantity field changed (typed text or a stepped number): a readable quantity scales the numbers
// from the base; empty, 0 or unreadable leaves them as they are.
function withQty(it, value, language) {
  const next = { ...it, qty: value };
  const n = validQty(value, language);
  if (n == null) return next;
  const base = (it && it.__base) || { ...snapNumbers(it, language), qty: numbersQty(it, language) };
  const ratio = n / (base.qty > 0 ? base.qty : 1);
  for (const [k, d] of Object.entries(SCALED)) {
    if (base[k] == null) continue;
    const f = 10 ** d;
    next[k] = Math.round(base[k] * ratio * f) / f;
  }
  next.__base = base;
  next.__qn = n;
  return next;
}
// Any other field typed. A typed number wins and becomes the new base (at the quantity of the numbers).
function withField(it, field, value, language) {
  const next = { ...it, [field]: value };
  if (field in SCALED) next.__base = { ...snapNumbers(next, language), qty: numbersQty(it, language) };
  return next;
}
// g and ml step by 10, everything else (counted units, slices, cups) by 1.
const qtyStep = (unit) => (STEP_10.has(cleanUnit(unit).toLowerCase()) ? 10 : 1);
// The quantity after − (dir -1) or + (dir 1), or null when the button does nothing (never 0 or below;
// an empty field starts at one step on +).
function stepQty(it, dir, language) {
  const step = qtyStep(it && it.unit);
  const cur = validQty(it && it.qty, language);
  if (cur == null) return dir > 0 ? step : null;
  const n = Math.round((cur + dir * step) * 1000) / 1000;
  return n > 0 ? n : null;
}
// The field's text: what is being typed stays as typed; a number in the app language, never grouped.
function qtyFieldText(v, language) {
  if (typeof v === 'string') return v;
  const n = validQty(v, language);
  return n == null ? '' : inputNumber(n, language);
}
// The unit beside the number: none for a counted item ("2" eggs) or an item without unit; agrees with
// the number ("3 fatias"); German capitals (unitCase).
function qtyUnitText(it, language = 'en') {
  const unit = unitCase(cleanUnit(it && it.unit), language);
  const u = unit.toLowerCase();
  if (!u || COUNT_UNITS.has(u) || unitIsFood(u, String((it && it.food) || ''))) return '';
  return unitForQty(unit, validQty(it && it.qty, language), language);
}
// "Antes: 150 g." — the stored amount when the sheet opened, or null when there was none.
function qtyBefore(o, language = 'en') {
  const q = fmtQty(o && o.qty, language);
  if (!q) return null;
  const unit = qtyUnitText(o, language);
  return unit ? q + ' ' + unit : q;
}
// A number that now differs from the stored one (shown in the data colour, as in the picture).
function fieldMoved(o, it, k, language) {
  const p = (v) => { if (v == null || v === '') return null; const n = parseDecimal(v, language); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };
  return p(o && o[k]) !== p(it && it[k]);
}

module.exports = {
  checkSoFar, editedItems, editorItems, withQty, withField, stepQty, qtyStep, qtyFieldText, qtyUnitText, qtyBefore, fieldMoved,
  dayTotals, intakeRun, MIN_RUN_DAYS, entryDateFor, splitByDay, groupByDay, withinCatchUp, catchUpOutcome, MAX_CATCHUP_DAYS,
  SOURCE_NOT_RECORDED, SOURCE_DAY_CLOSED, SOURCE_FREE_START, isMarker, foodOnly, closedDays, notRecordedDays,
  CATEGORIES, isDoneText, isNoText, refersToEarlier, mustAskWhichEarlier,
  itemLabel, cleanUnit, unitCase, foodCase, isLowConfidence, needsEstimateFlag, echoParts, periodTotals, localRowKey, rowsToReparse,
  quotaWaitStatus, quotaWaitDay,
  recentForParse, itemTotals, applyFollowup, followupStillValid, itemsFiber, fiberOf, fiberFieldText,
};
