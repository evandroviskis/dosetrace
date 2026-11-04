// The time of day a person wrote, read on the phone (founder 2026-11-04, docs/decisions.md:
// "the assistant takes the reminder time from what the person writes … it never fills the time
// with the current clock"). Pure CommonJS, no model: the clock time is the person's own digits
// ("às 9", "9h", "21h30", "9 am", "21:00", "9 da manhã", "um 9 Uhr", "alle 21") or a fixed word
// (noon, midnight). A part of the day alone ("de manhã", "in the evening") is NOT a time: the
// app then asks the exact time (lib/protocolAssistant step 'time').
//
// What is never a time (review 2026-11-04): an interval ("a cada 12h", "12/12h", "every 8 hrs",
// "q12h"), a duration ("em jejum de 12h", "8h depois da refeição", "12h apart"), a count of pills
// or meals ("as 2 cápsulas", "about 2 pills", "around 2 a day", "às 3 refeições"), a date
// ("3/11", "3.11."), a time next to before / after / until ("antes do meio-dia", "after 8pm"), a
// range ("das 8 às 10", "between 8 and 9 am", "8-9am") and alternatives ("8 ou 9", "de manhã ou à
// noite"). "8 e 20" (pt / es / it) can be 8:20 or 8:00 + 20:00: it comes back as a `join` so the
// app asks which.
//
// readTimes(text, language, { bare, fallbackParts }) →
//   { times: [{ hhmm } | { ambiguous: { hour, minute } } | { conflict }], parts: [part], conflict,
//     range, alt, joins: [{ one: 'HH:MM' | null, two: ['HH:MM', 'HH:MM'] | null }] }
//   part = 'morning' | 'afternoon' | 'evening' | 'early'

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
  pt: ['às', 'as', 'à', 'pelas', 'por volta das', 'por volta da', 'lá pelas', 'la pelas', '@'],
  es: ['a las', 'a la', 'sobre las', 'hacia las', 'tipo', '@'],
  fr: ['à', 'a', 'vers', '@'],
  de: ['um', 'gegen', '@'],
  it: ['alle', "all'", 'verso le', 'verso', 'ore', 'le ore', '@'],
};
// In ANOTHER answer (the dose, the frequency, the first message) only these make a number a
// time, with nothing like a pill or a count after it; a clock form ("9h", "21:00", "9pm", "9
// Uhr") is a time by itself (second review 2026-11-04, N3).
const STRICT_MARKERS = {
  en: ['at', '@'], pt: ['às', 'as', 'à', 'pelas', 'por volta das', 'por volta da', 'lá pelas', 'la pelas', '@'],
  es: ['a las', 'a la', '@'], fr: ['à', '@'], de: ['um', '@'], it: ['alle', "all'", '@'],
};
// A number right after these is an interval or a span, never a clock time ("a cada 8 horas",
// "every 12h", "alle 12h" in German, "há 2 dias", "il y a 2 j").
const INTERVAL_WORDS = ['cada', 'every', 'each', 'toutes les', 'tous les', 'ogni', 'je', 'há', 'hace', 'il y a'];
// "por 12h", "for 12h", "durante 8h": a duration — but "for 9pm" is a time (N9).
const SPAN_BEFORE = /(?:^|[^\p{L}])(?:por|durante|for|pendant|für|während|per)\s*$/iu;
function intervalBefore(before, language) {
  const words = language === 'it' ? INTERVAL_WORDS : [...INTERVAL_WORDS, 'alle'];
  return new RegExp(`(?:^|[^\\p{L}])(?:${words.map(esc).join('|')})\\s*$`, 'iu').test(before);
}
// before / after / until a time is not the time ("antes das 9", "after midnight", "vor Mittag").
const ARTICLES = "(?:\\s+(?:de|do|da|das|dos|del|della|delle|dell'|dello|di|du|des|de la|the|of|o|a|as|à|às|la|las|le|les|el|il|dem|der|den|um|at|l'))*";
const RELATIVE_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:antes|depois|após|apos|before|after|vor|nach|avant|après|apres|prima|dopo|después|despues|bis|until|till|até|ate|hasta|jusqu'à|jusqu'a|jusque)${ARTICLES}\\s*$`, 'iu');
// A duration after the hours ("8h depois da refeição", "12h de jejum", "12h apart").
const DURATION_AFTER = /^\s*(?:de|of|di|des)?\s*(?:jejum|fasting|fast|ayuno|je[ûu]ne|digiuno|n[üu]chtern|intervalo|interval|apart|d'intervalle|d'écart|di distanza|abstand|depois|após|apos|antes|after|before|later|después|despues|avant|après|apres|nach|vor|dopo|prima|später|spater)(?![\p{L}])/iu;
const DURATION_BEFORE = /(?:jejum|fasting|ayuno|je[ûu]ne|digiuno|fast)\s+(?:de|of|di|du|von)?\s*$/iu; // "em jejum de 12h"
// A unit, a count, a pill or a meal right after the number: a dose or a frequency, never a time.
const NOT_TIME_AFTER = new RegExp(`^\\s*(?:mg|mcg|µg|ug|ui|iu|ie|g|gr|ml|x|×|%|vez|vezes|times?|veces|fois|mal|volte|dias?|days?|días?|jours?|j|tage?n?|giorni?|semanas?|weeks?|semaines?|wochen?|settimane?|mes(?:es)?|months?|mois|monate?|mesi|units?|unidades?|unités?|einheiten|unità|doses?|dosis|dosen?|stunden|std|ore|hours?`
  + `|c[áa]psulas?|comprimidos?|gotas?|pills?|capsules?|tabs?|tablets?|g[ée]lules?|compress[ae]|kapseln?|tabletten?|tablette|tropfen|pastillas?|pastilles?|gocce`
  + `|refei[çc][õo]es|refei[çc][ãa]o|meals?|comidas?|repas|pasti|mahlzeiten?|primeir[oa]s?|first|primer[oa]s?|premi[eè]res?|premiers?|prim[ei]|ersten?|[úu]ltim[oa]s?|last)${WORD_END}`
  + `|^\\s*(?:a|per|ao|por|al|par|am|pro|each|cada)\\s+(?:day|dia|día|jour|giorno|tag|week|semana|semaine|settimana|woche|month|m[êe]s|mois|mese|monat)${WORD_END}`, 'iu');
const DECIMAL_AFTER = /^[.,]\d/;
const DATE_AFTER = /^\s*\/\s*\d/; // "3/11", "12/12h"
// A range: "das 8 às 10", "between 8 and 9 am", "von 8 bis 9", "8-9am", "8 to 9". "das" alone does
// not open a range ("por volta das 8 e 20" is a time): it needs às / até / a / bis / to / - (N8).
const RANGE_FROM = /(?:^|[^\p{L}])(?:das|dos|de|from|von|dalle|desde|du|dès)\s*$/iu;
const RANGE_BETWEEN = /(?:^|[^\p{L}])(?:between|entre|zwischen|tra|fra)\s*$/iu;
const RANGE_FROM_TO = /^\s*(?:h|hs|horas?|heures?|uhr|am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|till|until|bis|às|as|até|ate|a|à|alle|al|hasta|ao|aux?|au)\s*(?:(?:as|às|a|à|las|le|les|the)\s+)?(\d{1,2})(?:\s?[:h.]\s?\d{2})?/iu;
const RANGE_BETWEEN_AND = /^\s*(?:h|hs|horas?|heures?|uhr|am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|a|à|e|y|and|et|und)\s*(\d{1,2})(?:\s?[:h.]\s?\d{2})?/iu;
// "8 às 20" at the start of an answer: a span, never the 20 alone (second review probe).
const RANGE_LEAD = /^\s*(?:h|hs)?\s*(?:às|as|à|a|até|ate|alle|al)\s*(\d{1,2})(?:\s?[:h.]\s?\d{2})?/iu;
const RANGE_PLAIN = /^\s*(?:h|hs|am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|till|until|bis|hasta)\s*(\d{1,2})(?:\s?[:h.]\s?\d{2})?/iu;
const RANGE_TAIL = /^\s*(?:h|hs|horas?|heures?|uhr|am|pm|a\.m\.|p\.m\.)?/iu;
// "8 e 20": only where people say minutes that way (pt / es / it).
const JOIN_WORD = { pt: 'e', es: 'y', it: 'e' };
// Alternatives: "8 ou 9", "de manhã ou à noite" — never one of them picked by the app.
const ALT_SRC = { pt: 'ou', fr: 'ou(?: bien)?', en: 'or', es: '[ou]', it: 'o|oppure', de: 'oder' };
const ALT_RE = Object.fromEntries(Object.entries(ALT_SRC).map(([l, w]) => [l, new RegExp(`(?<![\\p{L}])(?:${w})(?![\\p{L}])`, 'iu')]));
// …and an alternative next to a number ("às 8 ou 9", "9 or 10pm", "um 8 oder 9") (N2).
const ALT_NUM = Object.fromEntries(Object.entries(ALT_SRC).map(([l, w]) => [l, new RegExp(
  `\\d\\s*(?:h|hs|hrs|horas?|heures?|uhr|am|pm|a\\.m\\.|p\\.m\\.)?\\.?\\s*(?:${w})(?![\\p{L}])|(?<![\\p{L}])(?:${w})\\s+(?:(?:às|as|à|a|at|um|alle|a las|a la|las|le|ore)\\s+)?\\d`, 'iu')]));

const BARE_WORDS = /(?<![\p{L}])(?:e|y|et|und|and|às|as|à|a|las|la|um|alle|at|h|hs|hrs|uhr|horas?|heures?|o'?clock)(?![\p{L}])/giu;

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function markerBefore(before, language, table = MARKERS) {
  const list = [...new Set([...(table[language] || []), '@'])];
  return list.some((m) => new RegExp(`(?:^|[^\\p{L}])${esc(m)}\\s*$`, 'iu').test(before));
}

// A real clock time "HH:MM": 00–23 and 00–59 (N1, the save guard and the reminder plan).
// An older stored value ("8:00", "08:00:00") is read the way the scheduler reads it, so it never
// blocks an Edit save (third review 2026-11-04).
function normalizeClock(t) {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(String(t == null ? '' : t));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}
function isClockTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalizeClock(t)); }

// One number followed by what makes it a time (or not). Returns { raw, end } or null.
// raw = { hour, minute, meridiem, part, zero, plain } | { range } | { invalid } | { join }.
// mode: { step } at the time question (any marker, a part of the day, a bare answer count) or
// another answer (only a clock form or a strict marker); { bare } the whole answer is numbers;
// { cont } the number follows a time ("8h e 20h") — taken only with its own signal or at the end.
function readAt(t, i, language, mode) {
  const before = t.slice(0, i);
  if (RELATIVE_BEFORE.test(before) || intervalBefore(before, language) || DURATION_BEFORE.test(before)) return null;
  const marker = mode.step ? markerBefore(before, language) : markerBefore(before, language, STRICT_MARKERS);
  const head = /^(\d{1,2})(?:\s?([:hH.])\s?(\d{2}))?(?!\d)/u.exec(t.slice(i));
  if (!head) return null;
  let pos = i + head[0].length;
  const hourTxt = head[1];
  const sep = head[2] ? head[2].toLowerCase() : null;
  let minute = head[3] != null ? Number(head[3]) : null;
  let rest = t.slice(pos);
  if (DATE_AFTER.test(rest)) return null;
  if (!sep && (DECIMAL_AFTER.test(rest) || NOT_TIME_AFTER.test(rest))) return null;
  if (sep === '.' && (NOT_TIME_AFTER.test(rest) || (!marker && /^\.\s*(?:\d|$|\s)/.test(rest)))) return null; // "3.11." is a date
  // A range is never a time: the whole span is skipped and flagged.
  const rg = (RANGE_BETWEEN.test(before) ? RANGE_BETWEEN_AND : RANGE_FROM.test(before) ? RANGE_FROM_TO : RANGE_PLAIN).exec(rest) || (mode.lead && !marker ? RANGE_LEAD.exec(rest) : null);
  if (rg) {
    const after = rest.slice(rg[0].length);
    if (!NOT_TIME_AFTER.test(after) && !DECIMAL_AFTER.test(after)) {
      const tail = RANGE_TAIL.exec(after);
      return { raw: { range: true }, end: pos + rg[0].length + (tail ? tail[0].length : 0) };
    }
    if (!marker) return null; // "1-2 cápsulas": an amount, not a time
  }
  if (/^\s*(?:em|en|in)\s+\d/iu.test(rest) || /\d\s*(?:em|en)\s*$/iu.test(before)) return null; // "de 8 em 8 horas"
  let strong = sep === ':' || sep === 'h';
  let hourWord = false, meridiem = null, part = null;
  const take = (re) => { const m = re.exec(rest); if (!m) return null; pos += m[0].length; rest = t.slice(pos); return m; };
  // The hour word: h / hs / hrs / horas / heures / Uhr / o'clock (plus "9 h 30", "9 Uhr 30").
  const hw = take(new RegExp(`^\\s*(h|hs|hrs|horas?|heures?|uhr|o'?clock)${WORD_END}`, 'iu'));
  if (hw) {
    strong = true; hourWord = true;
    if (minute == null) { const mm = take(/^\s*(\d{2})(?!\d)/u); if (mm) minute = Number(mm[1]); }
  }
  if ((hw || sep === 'h') && !marker && DURATION_AFTER.test(rest)) return null; // "8h depois da refeição"
  if (minute == null) {
    const half = take(new RegExp(`^\\s*(?:e|y|et|und|and a)\\s+(meia|media|demie|mezza|mezzo|half|quinze|cuarto|quart|un quarto|quarto)${WORD_END}`, 'iu'));
    if (half) { minute = /meia|media|demie|mezza|mezzo|half/i.test(half[1]) ? 30 : 15; if (mode.step) strong = true; } // "2 e meia" in a dose is 2.5
  }
  // "8 e 20" (pt / es / it): 8:20, or 8:00 and 20:00 — the app asks which.
  let join = null;
  if (!sep && !hourWord && minute == null && JOIN_WORD[language]) {
    const j = new RegExp(`^\\s+${JOIN_WORD[language]}\\s+(\\d{2})(?!\\d)(?!\\s*(?:h|hs|horas?|:)(?![\\p{L}]))`, 'iu').exec(rest);
    if (j && Number(j[1]) >= 10 && Number(j[1]) <= 59 && !NOT_TIME_AFTER.test(rest.slice(j[0].length)) && (mode.step || marker)) {
      join = Number(j[1]); pos += j[0].length; rest = t.slice(pos); strong = true;
    }
  }
  // Right after the number: the end of the answer, or a count before another time ("e 2 às 20").
  const atEnd = /^[\s.!?,;]*$/.test(rest);
  const countBefore = /^\s*(?:às|as|à|a|at|um|alle|a las|a la)\s+\d/iu.test(rest);
  const mer = take(new RegExp(`^\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![\\p{L}])`, 'iu'));
  if (mer) { meridiem = /^a/i.test(mer[1]) ? 'am' : 'pm'; strong = true; }
  if (SPAN_BEFORE.test(before) && !meridiem && sep !== ':') return null; // "por 12h"; "for 9pm" is a time
  const pw = take(new RegExp(`^\\s*(?:(?:da|de|do|du|del|della|dello|di|in|the|at|la|el|na|no|à|a|pela|por|en|of|le|nel|nella|mittags)\\s+){0,3}(${ANY_PART}|${NOON_SRC})${WORD_END}`, 'iu'));
  if (pw) {
    const w = pw[1];
    part = new RegExp(`^(?:${NOON_SRC})$`, 'iu').test(w) ? 'afternoon' : PARTS.find((p) => new RegExp(`^(?:${PART_SRC[p]})$`, 'iu').test(w));
    // A part of the day makes a time only at the time question: in another answer "tomo 2 de
    // manhã" is two pills in the morning (N3).
    // At the time question "9 da manhã" is a time when it leads the answer (a part is not a
    // clock signal for a continuation; "tomo 1 à noite" is a count in the evening, asked, N3).
    if (mode.step && mode.lead) strong = true;
  }
  if (sep === '.' && !strong && !marker) return null;
  if (!strong && !marker && (countBefore || !(mode.bare || (mode.cont && atEnd)))) return null;
  const hour = Number(hourTxt);
  if (hour > 23 || (minute != null && minute > 59)) return { raw: { invalid: true }, end: pos };
  const zero = hourTxt.length === 2 && hourTxt[0] === '0';
  if (join != null) return { raw: { join: true, hour, minute: join, meridiem, part: part || null, zero }, end: pos };
  return { raw: { hour, minute: minute || 0, meridiem, part: part || null, zero, plain: !sep && !hourWord && !meridiem }, end: pos };
}

function extractTimes(text, language, opts) {
  const t = String(text || '').toLowerCase().normalize('NFC');
  // At the time question, an answer of only numbers ("9", "8h e 20h", "9, 21") is the times.
  const step = !!(opts && opts.bare);
  const bare = step && /\d/.test(t) && !/\p{L}/u.test(t.replace(BARE_WORDS, ' ')) && !/\d\s*\/\s*\d/.test(t);
  const times = [];
  const used = [];
  let conflict = false, range = false, lastEnd = null;
  const re = /(?<![\p{L}\d.,:/])\d{1,2}(?=\D|$)/gu;
  let m;
  while ((m = re.exec(t))) {
    // "at 8 and 20", "um 8 und 20 Uhr": a number joined to the time before it is a time too.
    const cont = lastEnd != null && /^\s*(?:,|and|e|y|et|und|&)\s*$/iu.test(t.slice(lastEnd, m.index));
    const lead = /^[\s\p{P}]*$/u.test(t.slice(0, m.index));
    const r = readAt(t, m.index, language, { step, bare, cont, lead });
    if (!r) continue;
    lastEnd = r.raw.range || r.raw.invalid ? null : r.end;
    used.push([m.index, r.end]);
    re.lastIndex = r.end;
    if (r.raw.invalid) { conflict = true; continue; }
    if (r.raw.range) { range = true; continue; }
    times.push(r.raw);
  }
  const free = (a, b) => !used.some(([x, y]) => a < y && b > x);
  // Noon / midnight as words: exact times (12:00 / 00:00), with "e meia" etc.; never after
  // before / after / until ("antes do meio-dia", "after midnight", "vor Mittag").
  for (const [src, hour] of [[NOON_SRC, 12], [MIDNIGHT_SRC, 0]]) {
    const wr = new RegExp(`${WORD_START}(?:${src})${WORD_END}(?:\\s*(?:e|y|et|und)\\s+(meia|media|demie|mezza|mezzo|quinze|cuarto|quart))?`, 'giu');
    let w;
    while ((w = wr.exec(t))) {
      if (!free(w.index, w.index + w[0].length)) continue;
      const pre = t.slice(0, w.index);
      used.push([w.index, w.index + w[0].length]);
      if (/^(?:mittag|mittags)$/i.test(w[0]) && /nach$/i.test(pre)) continue;
      if (RELATIVE_BEFORE.test(pre)) continue;
      const minute = w[1] ? (/meia|media|demie|mezza|mezzo/i.test(w[1]) ? 30 : 15) : 0;
      times.push({ hour, minute, meridiem: null, part: null, zero: true, word: true, at: w.index });
    }
  }
  const parts = [];
  for (const [p, rx] of PART_RE) {
    rx.lastIndex = 0;
    let w;
    while ((w = rx.exec(t))) if (free(w.index, w.index + w[0].length)) parts.push({ p, at: w.index });
  }
  parts.sort((a, b) => a.at - b.at);
  const alt = !!(ALT_RE[language] && ((times.length + parts.length >= 2 && ALT_RE[language].test(t)) || ALT_NUM[language].test(t)));
  return { times, parts: parts.map((x) => x.p), conflict, range, alt };
}

// The 24-hour time for one raw time: the person's hour, read with their am/pm or part of day.
// "1 da manhã" / "at 1 in the morning" is 01:00 (review 2026-11-04).
const WINDOWS = {
  morning: (h) => h <= 11,
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
  // Never an hour above 23 or a minute above 59 (N1: "8 e 30" is never 8:00 and 30:00).
  if (!(Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 && Number.isInteger(raw.minute) && raw.minute >= 0 && raw.minute <= 59)) return { conflict: true };
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
  if (x.alt) return { times: [], parts: [], joins: [], conflict: false, range: false, alt: true };
  const fallback = (opts && opts.fallbackParts) || [];
  const single = x.times.length === 1 && x.parts.length === 1 ? x.parts[0] : null;
  // "de manhã às 8 e à noite às 9": one part written next to each time, in order.
  const paired = x.times.length > 1 && x.parts.length === x.times.length ? x.parts : null;
  const joins = [];
  const out = [];
  x.times.forEach((raw, i) => {
    const fb = raw.part || raw.meridiem ? null : (single || (paired && paired[i]) || fallback[i] || null);
    if (raw.join) {
      // 8:20, or 8:00 and 20:00 — both read from the person's own numbers.
      const one = resolveTime({ ...raw }, language, fb);
      const a = resolveTime({ hour: raw.hour, minute: 0, meridiem: null, part: raw.part, zero: raw.zero }, language, fb);
      const b = resolveTime({ hour: raw.minute, minute: 0, meridiem: raw.meridiem, part: raw.part, zero: false }, language, fb);
      const two = a.hhmm && b.hhmm && a.hhmm !== b.hhmm ? [a.hhmm, b.hhmm] : null;
      joins.push({ one: one.hhmm || null, two });
      return;
    }
    out.push(resolveTime(raw, language, fb));
  });
  return {
    times: out,
    parts: x.times.length ? (single || paired ? [] : x.parts) : x.parts,
    joins,
    conflict: x.conflict || out.some((r) => r.conflict),
    range: x.range,
    alt: false,
  };
}

module.exports = { extractTimes, resolveTime, readTimes, isClockTime, normalizeClock, PARTS, hhmm };
