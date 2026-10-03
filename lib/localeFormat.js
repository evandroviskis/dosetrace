'use strict';
// Locale-aware dates and numbers for every user-visible value (founder 2026-10-02:
// "Pese-se em Out 19" and "86.0 kg" in Portuguese). Keyed by the APP language (the
// Settings choice, LanguageContext), never the device locale.
//
// Deliberately deterministic — fixed CLDR-style tables, no Intl — so the output is the
// same in Hermes and in node tests, never throws, and never carries the narrow no-break
// space iOS puts into Intl output (timeFormat normalizes the same thing for times).
//
// DISPLAY ONLY. Stored values never change, and a formatted string is never fed back to
// parseDecimal: "2.480" (Portuguese grouping) would parse as 2.48. Prefilled inputs use
// inputNumber(), which never groups thousands, so "86,0" / "0,25" round-trip.

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const lang = (l) => (LANGS.includes(l) ? l : 'en');

// Short (abbreviated) and long month names, CLDR format context.
const MONTHS_SHORT = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'], // CLDR/ICU: no dot
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
};
const MONTHS_LONG = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
};
// Sunday first (Date#getDay order).
const WEEKDAYS_SHORT = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  pt: ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  de: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
  it: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
};
// A weekday shown alone (CLDR stand-alone): German drops the dot ("Mo"); the rest are the same.
const WEEKDAYS_STANDALONE = { de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] };
const WEEKDAYS_LONG = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  pt: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  it: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'],
};

// A Date from a Date, a timestamp, or an ISO string. A bare "YYYY-MM-DD" is a local
// calendar day (noon, so no time zone can move it to the day before).
function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  const s = String(v == null ? '' : v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
  return new Date(s);
}

// "19 Oct" style parts per language: day + month, optional year, optional weekday.
function dayMonth(l, d, m, months) {
  switch (l) {
    case 'en': return `${months[m]} ${d}`;
    case 'pt': return `${d} de ${months[m]}`;
    case 'es': return months === MONTHS_LONG.es ? `${d} de ${months[m]}` : `${d} ${months[m]}`;
    case 'de': return `${d}. ${months[m]}`;
    default: return `${d} ${months[m]}`; // fr, it
  }
}
function withYear(l, dm, y, longMonth) {
  if (l === 'en') return `${dm}, ${y}`;
  if (l === 'pt' || (l === 'es' && longMonth)) return `${dm} de ${y}`;
  return `${dm} ${y}`;
}
function withWeekday(l, wd, rest) {
  if (l === 'fr' || l === 'it') return `${wd} ${rest}`;
  return `${wd}, ${rest}`;
}

// style:
//   'dayMonth'         Oct 19          | 19 de out.        | 19 oct.   | 19. Okt.  | 19 ott
//   'dayMonthAuto'     dayMonth, plus the year when it is not the current year
//   'dayMonthYear'     Oct 19, 2026    | 19 de out. de 2026 | 19 oct. 2026 | 19. Okt. 2026
//   'weekdayDayMonth'  Fri, Oct 19     | sex., 19 de out.  | ven. 19 oct. | Fr., 19. Okt.
//   'weekdayDayMonthYear'  the same with the year
//   'long'             October 19, 2026 | 19 de outubro de 2026 | 19. Oktober 2026
//   'weekdayLong'      Friday, October 19 | sexta-feira, 19 de outubro | vendredi 19 octobre
//   'weekdayLongDayMonthAuto'  Friday, Oct 19 | sexta-feira, 19 de out. (+ the year when not this year)
//   'weekday'          Fri             | sex.
//   'monthYear'        Oct 2026        | out. de 2026      | oct. 2026 | Okt. 2026
// Returns '' for an invalid date.
function formatDate(value, language, style = 'dayMonth', now = new Date()) {
  const date = toDate(value);
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const l = lang(language);
  const d = date.getDate(), m = date.getMonth(), y = date.getFullYear(), w = date.getDay();
  const short = MONTHS_SHORT[l], long = MONTHS_LONG[l];
  switch (style) {
    case 'weekday': return (WEEKDAYS_STANDALONE[l] || WEEKDAYS_SHORT[l])[w]; // alone: German "Mo" (ICU)
    case 'monthYear': return l === 'pt' ? `${short[m]} de ${y}` : `${short[m]} ${y}`;
    case 'dayMonthYear': return withYear(l, dayMonth(l, d, m, short), y, false);
    case 'dayMonthAuto': {
      const dm = dayMonth(l, d, m, short);
      return y === now.getFullYear() ? dm : withYear(l, dm, y, false);
    }
    case 'weekdayDayMonth': return withWeekday(l, WEEKDAYS_SHORT[l][w], dayMonth(l, d, m, short));
    case 'weekdayDayMonthYear': return withWeekday(l, WEEKDAYS_SHORT[l][w], withYear(l, dayMonth(l, d, m, short), y, false));
    case 'long': return withYear(l, dayMonth(l, d, m, long), y, true);
    case 'weekdayLong': return withWeekday(l, WEEKDAYS_LONG[l][w], dayMonth(l, d, m, long));
    case 'weekdayLongDayMonthAuto': { // the Dose log day headers: "Friday, Oct 2"
      const dm = dayMonth(l, d, m, short);
      return withWeekday(l, WEEKDAYS_LONG[l][w], y === now.getFullYear() ? dm : withYear(l, dm, y, false));
    }
    case 'dayMonth':
    default: return dayMonth(l, d, m, short);
  }
}

// ── Numbers ──
const DECIMAL = { en: '.', es: ',', pt: ',', fr: ',', de: ',', it: ',' };
// Thousands: no-break space in French (never wraps "2 480" across lines).
const GROUP = { en: ',', es: '.', pt: '.', fr: ' ', de: '.', it: '.' };
// Spanish and Italian (CLDR minimumGroupingDigits 2) leave four-digit numbers ungrouped: 2480, 24.800.
const MIN_GROUPED = { es: 10000, it: 10000 }; // CLDR/ICU: Spanish and Italian leave 2480 ungrouped

function group(intDigits, l) {
  const n = intDigits.length;
  const min = MIN_GROUPED[l] || 1000;
  if (Number(intDigits) < min || n < 4) return intDigits;
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[l]);
}

// A plain number from a number or a "86.0" / "-1.5" string; null otherwise. Never reads
// a comma (a comma may be a thousands separator: "5,000").
function plain(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

// formatNumber(86, 'pt', { digits: 1 }) -> "86,0"; (2480, 'pt') -> "2.480";
// { trim: true } drops trailing zeros ("0,50" -> "0,5"); { grouping: false } never groups.
// digits undefined keeps the number as it is ("0.125" -> "0,125"). A value that is not a
// plain number (null, "—", "5,000" as typed) comes back unchanged as a string.
function formatNumber(value, language, opts = {}) {
  const n = plain(value);
  if (n == null) return value == null ? '' : String(value);
  const l = lang(language);
  const { digits, trim = false, grouping = true } = opts;
  let s;
  if (digits != null) s = n.toFixed(digits);
  else if (typeof value === 'string') s = value.trim().replace(/^\+/, '');
  else s = String(n);
  if (/e/i.test(s)) return s; // exponent notation: leave alone
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  let [int, frac = ''] = s.split('.');
  if (trim) frac = frac.replace(/0+$/, '');
  if (neg && /^0*$/.test(int + frac)) neg = false; // never "-0,0"
  const intOut = grouping ? group(int, l) : int;
  return (neg ? '-' : '') + intOut + (frac ? DECIMAL[l] + frac : '');
}

// A rounded whole number with the language's grouping: 2480 -> "2.480" (pt), "2,480" (en).
function formatInt(value, language) {
  const n = plain(value);
  if (n == null) return value == null ? '' : String(value);
  return formatNumber(Math.round(n), language, { digits: 0 });
}

// A number as typed or stored ("0.5" mg, "50.0" u, "1250" IU) with only the decimal
// separator localized — never grouped, so the digits read exactly as before.
function decimalText(value, language) {
  return formatNumber(value, language, { grouping: false });
}

// A value to PREFILL an editable field: the language's decimal separator, never a
// thousands separator ("86,5", "1,125", "12500"). The field is read back with
// parseDecimal(text, language), which reads a comma as the decimal in pt/es/fr/de/it.
// A stored text that is not a plain number ("5,000", "0,5", "abc") comes back unchanged.
function inputNumber(value, language, digits) {
  if (value == null || value === '') return '';
  if (plain(value) == null) return String(value);
  return formatNumber(value, language, { digits, grouping: false });
}

module.exports = {
  LANGS, MONTHS_SHORT, MONTHS_LONG, WEEKDAYS_SHORT, WEEKDAYS_LONG,
  formatDate, formatNumber, formatInt, decimalText, inputNumber, toDate,
};
