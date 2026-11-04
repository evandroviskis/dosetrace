// The time of day a person wrote, read on the phone (founder 2026-11-04, docs/decisions.md:
// "the assistant takes the reminder time from what the person writes … it never fills the time
// with the current clock"). Pure CommonJS, no model: the clock time is the person's own digits
// ("às 9", "9h", "21h30", "9 am", "21:00", "9 da manhã", "um 9 Uhr", "alle 21") or a fixed word
// (noon, midnight). A part of the day alone ("de manhã", "in the evening") is NOT a time: the
// app then asks the exact time (lib/protocolAssistant step 'time').
//
// extractTimes(text, language, { bare }) → { times: [raw], parts: [part], conflict }
//   raw = { hour, minute, meridiem: 'am'|'pm'|null, part: part|null, zero: bool }
//   part = 'morning' | 'afternoon' | 'evening' | 'early'
// resolveTime(raw, language, fallbackPart) → { hhmm } | { ambiguous: { hour, minute } } | { conflict: true }

const WORD_END = '(?![\\p{L}])';
const WORD_START = '(?<![\\p{L}])';

// Parts of the day in the 6 languages. Spanish "mañana" alone is "tomorrow" and German "morgen"
// alone too, so those need their article; "tarde" (pt/es) and "sera" (it) need a preposition.
const PART_SRC = {
  morning: "mornings?|manh[ãa]s?|(?:la|las|en la|por la|de la) ma[ñn]anas?|matin(?:ée|ee|s)?|morgens|am morgen|vormittags?|mattin[oae]|stamattina",
  afternoon: "afternoons?|(?:à|a|de|da|das|pela|pelas|la|las|na|nas|por la|en la) tardes?|apr[èe]s-?midi|aprem|nachmittags?|pomeriggi?o?",
  evening: "evenings?|tonight|nights?|noites?|noches?|soir(?:s|ée|ee)?|abends|am abend|heute abend|(?:di|la|alla|in|della|questa) sera|stasera|serata|notte|nachts|in der nacht",
  early: "madrugadas?|early hours|wee hours|small hours",
};
const PARTS = Object.keys(PART_SRC);
const PART_RE = PARTS.map((p) => [p, new RegExp(`${WORD_START}(?:${PART_SRC[p]})${WORD_END}`, 'giu')]);
const ANY_PART = PARTS.map((p) => PART_SRC[p]).join('|');

// Fixed clock words (an exact time, not a part of the day).
const NOON_SRC = "noon|midday|meio[- ]dia|mediod[íi]a|midi|mezzogiorno|mittag|mittags";
const MIDNIGHT_SRC = "midnight|meia[- ]noite|medianoche|minuit|mezzanotte|mitternacht";

// Words that make the number a time when they come right before it ("às 9", "at 9", "um 9").
const MARKERS = {
  en: ['at', 'around', 'about', '@'],
  pt: ['às', 'as', 'à', 'pelas', 'por volta das', 'por volta da', 'lá pelas', 'la pelas', 'até as', 'até às', '@'],
  es: ['a las', 'a la', 'sobre las', 'hacia las', 'tipo', '@'],
  fr: ['à', 'a', 'vers', '@'],
  de: ['um', 'gegen', '@'],
  it: ['alle', "all'", 'verso le', 'verso', 'ore', 'le ore', '@'],
};
// A number after these is an interval, never a clock time ("a cada 8 horas", "every 8 hours").
const INTERVAL_BEFORE = /(?:^|[^\p{L}])(?:cada|every|each|toutes les|tous les|ogni|je)\s*$/iu;
// A unit or a count right after the number: a dose or a frequency, never a time.
const NOT_TIME_AFTER = new RegExp(`^\\s*(?:mg|mcg|µg|ug|ui|iu|ie|g|gr|ml|x|×|%|vez|vezes|times?|veces|fois|mal|volte|dias?|days?|días?|jours?|tage?n?|giorni?|semanas?|weeks?|semaines?|wochen?|settimane?|mes(?:es)?|months?|mois|monate?|mesi|units?|unidades?|unités?|einheiten|unità|doses?|dosis|dosen?|stunden|ore|hours?)${WORD_END}`, 'iu');
const DECIMAL_AFTER = /^[.,]\d/;

const BARE_WORDS = /(?<![\p{L}])(?:e|y|et|und|and|às|as|à|a|las|la|um|alle|at|h|hs|hrs|uhr|horas?|heures?|o'?clock)(?![\p{L}])/giu;

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function markerBefore(before, language) {
  const list = [...new Set([...(MARKERS[language] || []), ...MARKERS.en.filter((m) => m === '@')])];
  return list.some((m) => new RegExp(`(?:^|[^\\p{L}])${esc(m)}\\s*$`, 'iu').test(before));
}

// One number followed by what makes it a time (or not). Returns { raw, end } or null.
function readAt(t, i, len, language, bare) {
  const before = t.slice(0, i);
  const head = /^(\d{1,2})(?:\s?([:hH.])\s?(\d{2}))?(?!\d)/u.exec(t.slice(i));
  if (!head) return null;
  let pos = i + head[0].length;
  const hourTxt = head[1];
  const sep = head[2] ? head[2].toLowerCase() : null;
  let minute = head[3] != null ? Number(head[3]) : null;
  let rest = t.slice(pos);
  if (!sep && (DECIMAL_AFTER.test(rest) || NOT_TIME_AFTER.test(rest))) return null;
  if (sep === '.' && NOT_TIME_AFTER.test(rest)) return null;
  if (/^\s*(?:em|en|in|a)\s+\d/iu.test(rest) || /\d\s*(?:em|en)\s*$/iu.test(before)) return null; // "de 8 em 8 horas"
  let strong = sep === ':' || sep === 'h';
  let meridiem = null, part = null;
  const take = (re) => { const m = re.exec(rest); if (!m) return null; pos += m[0].length; rest = t.slice(pos); return m; };
  // The hour word: h / hs / hrs / horas / heures / Uhr / o'clock (plus "9 h 30", "9 Uhr 30").
  const hw = take(new RegExp(`^\\s*(h|hs|hrs|horas?|heures?|uhr|o'?clock)${WORD_END}`, 'iu'));
  if (hw) {
    const w = hw[1].toLowerCase();
    if (/^(horas?|heures?)$/.test(w) && INTERVAL_BEFORE.test(before)) return null;
    strong = true;
    if (minute == null) { const mm = take(/^\s*(\d{2})(?!\d)/u); if (mm) minute = Number(mm[1]); }
  }
  if (minute == null) {
    const half = take(new RegExp(`^\\s*(?:e|y|et|und|and a)\\s+(meia|media|demie|mezza|mezzo|half|quinze|cuarto|quart|un quarto|quarto)${WORD_END}`, 'iu'));
    if (half) { minute = /meia|media|demie|mezza|mezzo|half/i.test(half[1]) ? 30 : 15; strong = true; }
  }
  const mer = take(new RegExp(`^\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![\\p{L}])`, 'iu'));
  if (mer) { meridiem = /^a/i.test(mer[1]) ? 'am' : 'pm'; strong = true; }
  const pw = take(new RegExp(`^\\s*(?:(?:da|de|do|du|del|della|dello|di|in|the|at|la|el|na|no|à|a|pela|por|en|of|le|nel|nella|mittags)\\s+){0,3}(${ANY_PART}|${NOON_SRC})${WORD_END}`, 'iu'));
  if (pw) {
    const w = pw[1];
    part = new RegExp(`^(?:${NOON_SRC})$`, 'iu').test(w) ? 'afternoon' : PARTS.find((p) => new RegExp(`^(?:${PART_SRC[p]})$`, 'iu').test(w));
    strong = true;
  }
  if (sep === '.' && !strong && !markerBefore(before, language)) return null;
  if (!strong && !markerBefore(before, language) && !bare) return null;
  if (!strong && INTERVAL_BEFORE.test(before) && !markerBefore(before, language)) return null;
  const hour = Number(hourTxt);
  if (hour > 23 || (minute != null && minute > 59)) return { raw: { invalid: true }, end: pos };
  return { raw: { hour, minute: minute || 0, meridiem, part: part || null, zero: hourTxt.length === 2 && hourTxt[0] === '0' }, end: pos };
}

function extractTimes(text, language, opts) {
  const t = String(text || '').toLowerCase().normalize('NFC');
  // At the time question, an answer of only numbers ("9", "8 e 20", "9, 21") is the times.
  const bare = !!(opts && opts.bare) && /\d/.test(t) && !/\p{L}/u.test(t.replace(BARE_WORDS, ' '));
  const times = [];
  const used = [];
  let conflict = false;
  const re = /(?<![\d.,:])\d{1,2}(?=\D|$)/gu;
  let m;
  while ((m = re.exec(t))) {
    const r = readAt(t, m.index, t.length, language, bare);
    if (!r) continue;
    if (r.raw.invalid) { conflict = true; re.lastIndex = r.end; continue; }
    times.push(r.raw);
    used.push([m.index, r.end]);
    re.lastIndex = r.end;
  }
  const free = (a, b) => !used.some(([x, y]) => a < y && b > x);
  // Noon / midnight as words: exact times (12:00 / 00:00), with "e meia" etc.
  for (const [src, hour] of [[NOON_SRC, 12], [MIDNIGHT_SRC, 0]]) {
    const wr = new RegExp(`${WORD_START}(?:${src})${WORD_END}(?:\\s*(?:e|y|et|und)\\s+(meia|media|demie|mezza|mezzo|quinze|cuarto|quart))?`, 'giu');
    let w;
    while ((w = wr.exec(t))) {
      if (!free(w.index, w.index + w[0].length)) continue;
      if (/^(?:mittag|mittags)$/i.test(w[0]) && /nach$/i.test(t.slice(0, w.index))) continue;
      const minute = w[1] ? (/meia|media|demie|mezza|mezzo/i.test(w[1]) ? 30 : 15) : 0;
      times.push({ hour, minute, meridiem: null, part: null, zero: true, word: true, at: w.index });
      used.push([w.index, w.index + w[0].length]);
    }
  }
  const parts = [];
  for (const [p, rx] of PART_RE) {
    rx.lastIndex = 0;
    let w;
    while ((w = rx.exec(t))) if (free(w.index, w.index + w[0].length)) parts.push({ p, at: w.index });
  }
  parts.sort((a, b) => a.at - b.at);
  return { times, parts: parts.map((x) => x.p), conflict };
}

// The 24-hour time for one raw time: the person's hour, read with their am/pm or part of day.
const WINDOWS = {
  morning: (h) => h >= 4 && h <= 11,
  afternoon: (h) => h >= 12 && h <= 19,
  evening: (h) => h >= 17 || h <= 4,
  early: (h) => h <= 6 || h >= 22,
};
function fromPart(h, part) {
  if (h === 0 || h >= 13) return h;
  switch (part) {
    case 'morning': return h === 12 ? null : h;
    case 'afternoon': return h === 12 ? 12 : h <= 7 ? h + 12 : null;
    case 'evening': return h === 12 ? 0 : h >= 5 ? h + 12 : h;
    case 'early': return h === 12 ? 0 : h <= 6 ? h : h >= 10 ? h + 12 : null;
    default: return h;
  }
}
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function resolveTime(raw, language, fallbackPart) {
  if (!raw || raw.invalid) return { conflict: true };
  const { minute } = raw;
  let h = raw.hour;
  const part = raw.part || fallbackPart || null;
  if (raw.word) return part && !WINDOWS[part](h) ? { conflict: true } : { hhmm: hhmm(h, minute) };
  if (raw.meridiem) {
    if (h < 1 || h > 12) return { conflict: true };
    h = raw.meridiem === 'pm' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    if (part && !WINDOWS[part](h)) return { conflict: true };
    return { hhmm: hhmm(h, minute) };
  }
  if (part) {
    const v = fromPart(h, part);
    if (v == null || !WINDOWS[part](v)) return { conflict: true };
    return { hhmm: hhmm(v, minute) };
  }
  // No am/pm and no part of the day. The other 5 languages write the 24-hour clock ("9h" is
  // 09:00, "21h" is 21:00); in English an hour from 1 to 11 can be either, so the app asks.
  if (language === 'en' && h >= 1 && h <= 11 && !raw.zero) return { ambiguous: { hour: h, minute } };
  return { hhmm: hhmm(h, minute) };
}

// Every time in the text, resolved. A single part of the day written apart from a single time
// belongs to it ("de manhã, às 9"). fallbackParts[i] = the part said earlier for that dose.
function readTimes(text, language, opts) {
  const x = extractTimes(text, language, opts);
  const fallback = (opts && opts.fallbackParts) || [];
  const shared = x.times.length === 1 && x.parts.length === 1 ? x.parts[0] : null;
  const out = x.times.map((raw, i) => resolveTime(raw, language, raw.part ? null : (shared || fallback[i] || null)));
  return {
    times: out,
    parts: x.times.length ? (shared ? [] : x.parts) : x.parts,
    conflict: x.conflict || out.some((r) => r.conflict),
  };
}

module.exports = { extractTimes, resolveTime, readTimes, PARTS, hhmm };
