'use strict';
// A-162 (founder 2026-10-22 on the Fold; picture docs/design/a162-google-button.html approved
// 2026-10-25 "Aprovado, pode fazer a correção"): on Android the "Continue with Google" text sat
// 4 dp above the centre of the button and of the G (measured on the Fold, light and dark: 10 px).
// Cause: Android's default includeFontPadding sizes the text box by the font's tallest and deepest
// glyphs (head yMax/yMin), which for Google Sans Medium leaves far more room above the letters than
// below. Without that padding the box uses the hhea ascent/descent and the capitals sit centred.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const AUTH = fs.readFileSync(path.join(root, 'screens', 'AuthScreen.js'), 'utf8');

function fontMetrics(file) {
  const b = fs.readFileSync(file);
  const tables = {};
  for (let i = 0; i < b.readUInt16BE(4); i++) {
    const o = 12 + i * 16;
    tables[b.toString('ascii', o, o + 4)] = b.readUInt32BE(o + 8);
  }
  const head = tables.head, hhea = tables.hhea, os2 = tables['OS/2'];
  return {
    upm: b.readUInt16BE(head + 18),
    yMin: b.readInt16BE(head + 38),
    yMax: b.readInt16BE(head + 42),
    ascent: b.readInt16BE(hhea + 4),
    descent: b.readInt16BE(hhea + 6),
    capHeight: b.readInt16BE(os2 + 88),
  };
}

// How far (dp) the middle of the capitals sits above the middle of the text box.
const capOffsetDp = (m, top, bottom, fontSize) =>
  ((m.capHeight / 2) - (top + bottom) / 2) * (fontSize / m.upm);

const M = fontMetrics(path.join(root, 'assets', 'fonts', 'GoogleSans_500Medium.ttf'));

test('A-162: with the default font padding the capitals sit ~4 dp high (the defect, as measured)', () => {
  const off = capOffsetDp(M, M.yMax, M.yMin, 17);
  assert.ok(off > 3.5 && off < 4.5, `expected ~4 dp, got ${off.toFixed(2)}`);
});

test('A-162: without the font padding the capitals sit within 0.5 dp of the centre', () => {
  const off = capOffsetDp(M, M.ascent, M.descent, 17);
  assert.ok(Math.abs(off) < 0.5, `expected < 0.5 dp, got ${off.toFixed(2)}`);
});

test('A-162: the Google button text turns the font padding off (Android; iOS ignores it)', () => {
  assert.match(AUTH, /googleBtnText: \{ fontSize: 17, includeFontPadding: false \}/);
  // the Google rules stay as they were: font, size, colours, border, the G
  assert.match(AUTH, /googleBtnFont: \{ fontFamily: GOOGLE_SANS_MEDIUM \}/);
  assert.match(AUTH, /<GoogleMark \/>/);
});
