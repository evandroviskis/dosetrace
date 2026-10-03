'use strict';
// Founder 2026-10-02: every user-visible date and decimal follows the APP language.
// Portuguese showed "Pese-se em Out 19" (English order) and "86.0 kg" (a point). One test
// per formatter per language, plus the round trip of every prefilled number through
// parseDecimal (a formatted display string is never parsed back; inputNumber never groups).
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate, formatNumber, formatInt, decimalText, inputNumber } = require('../lib/localeFormat');
const { parseDecimal } = require('../lib/doseMath');

const OCT19 = new Date(2026, 9, 19, 9, 30); // a Monday
const SEP30 = '2026-09-30';                  // a Wednesday
const NOW = new Date(2026, 9, 2);

test('dayMonth: Oct 19 in each language', () => {
  const want = { en: 'Oct 19', pt: '19 de out.', es: '19 oct.', fr: '19 oct.', de: '19. Okt.', it: '19 ott' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'dayMonth'), s, l);
});

test('dayMonth: the longest short months (Sep 30, Feb 28, Mar 30, Jul 30)', () => {
  assert.equal(formatDate(SEP30, 'pt'), '30 de set.');
  assert.equal(formatDate(SEP30, 'es'), '30 sept.');
  assert.equal(formatDate(SEP30, 'fr'), '30 sept.');
  assert.equal(formatDate(SEP30, 'de'), '30. Sept.');
  assert.equal(formatDate(SEP30, 'it'), '30 set');
  assert.equal(formatDate(SEP30, 'en'), 'Sep 30');
  assert.equal(formatDate('2026-02-28', 'fr'), '28 févr.');
  assert.equal(formatDate('2026-03-30', 'de'), '30. März');
  assert.equal(formatDate('2026-07-30', 'fr'), '30 juil.');
});

test('a bare ISO day never moves to the day before', () => {
  assert.equal(formatDate('2026-01-01', 'en'), 'Jan 1');
  assert.equal(formatDate('2026-12-31', 'pt'), '31 de dez.');
});

test('dayMonthAuto adds the year only when it is not this year', () => {
  assert.equal(formatDate('2026-10-19', 'pt', 'dayMonthAuto', NOW), '19 de out.');
  const want = { en: 'Dec 30, 2025', pt: '30 de dez. de 2025', es: '30 dic. 2025', fr: '30 déc. 2025', de: '30. Dez. 2025', it: '30 dic 2025' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate('2025-12-30', l, 'dayMonthAuto', NOW), s, l);
});

test('dayMonthYear in each language', () => {
  const want = { en: 'Oct 19, 2026', pt: '19 de out. de 2026', es: '19 oct. 2026', fr: '19 oct. 2026', de: '19. Okt. 2026', it: '19 ott 2026' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'dayMonthYear'), s, l);
});

test('weekdayDayMonth in each language', () => {
  const want = { en: 'Mon, Oct 19', pt: 'seg., 19 de out.', es: 'lun, 19 oct.', fr: 'lun. 19 oct.', de: 'Mo., 19. Okt.', it: 'lun 19 ott' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'weekdayDayMonth'), s, l);
});

test('weekdayDayMonthYear in each language', () => {
  const want = { en: 'Mon, Oct 19, 2026', pt: 'seg., 19 de out. de 2026', es: 'lun, 19 oct. 2026', fr: 'lun. 19 oct. 2026', de: 'Mo., 19. Okt. 2026', it: 'lun 19 ott 2026' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'weekdayDayMonthYear'), s, l);
});

test('long date in each language', () => {
  const want = { en: 'October 19, 2026', pt: '19 de outubro de 2026', es: '19 de octubre de 2026', fr: '19 octobre 2026', de: '19. Oktober 2026', it: '19 ottobre 2026' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'long'), s, l);
});

test('weekdayLong (the Today header) in each language', () => {
  const want = { en: 'Monday, October 19', pt: 'segunda-feira, 19 de outubro', es: 'lunes, 19 de octubre', fr: 'lundi 19 octobre', de: 'Montag, 19. Oktober', it: 'lunedì 19 ottobre' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'weekdayLong'), s, l);
});

test('weekdayLongDayMonthAuto (the Dose log day headers) in each language', () => {
  const want = { en: 'Monday, Oct 19', pt: 'segunda-feira, 19 de out.', es: 'lunes, 19 oct.', fr: 'lundi 19 oct.', de: 'Montag, 19. Okt.', it: 'lunedì 19 ott' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatDate(OCT19, l, 'weekdayLongDayMonthAuto', NOW), s, l);
  assert.equal(formatDate('2025-12-30', 'en', 'weekdayLongDayMonthAuto', NOW), 'Tuesday, Dec 30, 2025');
  assert.equal(formatDate('2025-12-30', 'pt', 'weekdayLongDayMonthAuto', NOW), 'terça-feira, 30 de dez. de 2025');
});

test('weekday and monthYear in each language', () => {
  const wd = { en: 'Mon', pt: 'seg.', es: 'lun', fr: 'lun.', de: 'Mo.', it: 'lun' };
  for (const [l, s] of Object.entries(wd)) assert.equal(formatDate(OCT19, l, 'weekday'), s, l);
  const my = { en: 'Oct 2026', pt: 'out. de 2026', es: 'oct. 2026', fr: 'oct. 2026', de: 'Okt. 2026', it: 'ott 2026' };
  for (const [l, s] of Object.entries(my)) assert.equal(formatDate(OCT19, l, 'monthYear'), s, l);
});

test('an unknown language falls back to English; an invalid date is empty', () => {
  assert.equal(formatDate(OCT19, 'xx'), 'Oct 19');
  assert.equal(formatDate('not a date', 'pt'), '');
  assert.equal(formatDate(null, 'pt'), '');
});

test('formatNumber: one decimal (86.0 kg) in each language', () => {
  const want = { en: '86.0', pt: '86,0', es: '86,0', fr: '86,0', de: '86,0', it: '86,0' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatNumber(86, l, { digits: 1 }), s, l);
  assert.equal(formatNumber('86.0', 'pt'), '86,0'); // a "86.0" string as stored/derived
  assert.equal(formatNumber(-1.25, 'de', { digits: 1 }), '-1,3');
  assert.equal(formatNumber(-0.04, 'pt', { digits: 1 }), '0,0'); // never "-0,0"
});

test('formatNumber: trim drops trailing zeros and keeps the separator', () => {
  assert.equal(formatNumber('0.50', 'pt', { trim: true }), '0,5');
  assert.equal(formatNumber('1.00', 'fr', { trim: true }), '1');
  assert.equal(formatNumber(2.5, 'it', { digits: 2, trim: true }), '2,5');
  assert.equal(formatNumber('0.50', 'en', { trim: true }), '0.5');
});

test('formatNumber leaves what is not a plain number alone', () => {
  assert.equal(formatNumber('5,000', 'pt'), '5,000'); // typed grouped thousands stay as typed
  assert.equal(formatNumber('0,5', 'en'), '0,5');
  assert.equal(formatNumber('—', 'pt'), '—');
  assert.equal(formatNumber(null, 'pt'), '');
  assert.equal(formatNumber(NaN, 'pt'), 'NaN');
});

test('formatInt: thousands grouping per language (2,480 kcal is wrong in Portuguese)', () => {
  const want = { en: '2,480', pt: '2.480', es: '2480', fr: '2 480', de: '2.480', it: '2.480' };
  for (const [l, s] of Object.entries(want)) assert.equal(formatInt(2480.4, l), s, l);
  assert.equal(formatInt(24800, 'es'), '24.800');
  assert.equal(formatInt(980, 'pt'), '980');
  assert.equal(formatInt(1234567, 'en'), '1,234,567');
  assert.equal(formatInt(-1500, 'de'), '-1.500');
});

test('decimalText: a typed or stored number keeps its digits, only the separator follows the language', () => {
  const want = { en: '0.5', pt: '0,5', es: '0,5', fr: '0,5', de: '0,5', it: '0,5' };
  for (const [l, s] of Object.entries(want)) assert.equal(decimalText('0.5', l), s, l);
  assert.equal(decimalText('50.0', 'pt'), '50,0');
  assert.equal(decimalText('5000', 'pt'), '5000', 'never grouped: the digits read as before');
  assert.equal(decimalText('5000', 'en'), '5000');
  assert.equal(decimalText('250', 'de'), '250');
  assert.equal(decimalText('5,000', 'pt'), '5,000', 'a typed comma stays as typed');
  assert.equal(decimalText(undefined, 'pt'), '');
});

test('inputNumber: a prefilled number shows the language separator and never groups', () => {
  assert.equal(inputNumber(86, 'pt', 1), '86,0');
  assert.equal(inputNumber(86, 'en', 1), '86.0');
  assert.equal(inputNumber(2480, 'de'), '2480');
  assert.equal(inputNumber(1234.5, 'fr', 1), '1234,5');
  assert.equal(inputNumber(null, 'pt', 1), '');
  assert.equal(inputNumber('', 'pt'), '');
});

test('inputNumber round-trips through parseDecimal in every language', () => {
  const values = [86, 86.4, 0.5, 0.25, 0.125, 1.25, 1.125, 12.345, 189.6, 2480, 1234.5, 20, 3.0, 99.99];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const v of values) {
      for (const digits of [undefined, 1, 2, 3]) {
        const shown = inputNumber(v, l, digits);
        const expect = digits == null ? v : Number(v.toFixed(digits));
        assert.equal(parseDecimal(shown), expect, `${l} ${v} digits=${digits} -> "${shown}"`);
      }
    }
  }
});

test('inputNumber: "1,250" would read as one thousand, so it becomes "1,2500"', () => {
  assert.equal(inputNumber(1.25, 'pt', 3), '1,2500');
  assert.equal(parseDecimal(inputNumber(1.25, 'pt', 3)), 1.25);
  assert.equal(inputNumber(0.125, 'pt'), '0,125'); // a leading zero is never thousands
});

// Review 2026-10-02 (LOW): a value stored as TEXT that is not a plain number comes back
// exactly as stored — "5,000" (five thousand IU typed in English) never becomes "5,0000",
// which would read back as 5.
test('inputNumber returns a stored text that is not a plain number unchanged', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.equal(inputNumber('5,000', l), '5,000', l);
    assert.equal(inputNumber('1,250', l), '1,250', l);
    assert.equal(inputNumber('0,5', l), '0,5', l);
    assert.equal(inputNumber('abc', l), 'abc', l);
  }
  assert.equal(parseDecimal(inputNumber('5,000', 'pt')), 5000);
});
