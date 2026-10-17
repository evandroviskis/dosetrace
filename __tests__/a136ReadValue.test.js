'use strict';
// A-136 (4) — guided device session 2026-10-17 (Fold7 unfolded, pt): the oral serving
// calculator's "Restam" column read "58 cápsula" and then "s" alone on the next line. The value
// and its unit are glued with a no-break space (A-134 (2)), so "58 cápsulas" is one unbreakable
// run; in a column of ~95 dp (a third of the card) at 17 pt mono it is wider than the column,
// and Android (and iOS) then break INSIDE the word.
// Fix: lib/readPieces splits a reading at its ordinary spaces only (the value stays glued to the
// first unit word); ProtocolsScreen ReadValue lays the pieces out in a wrapping row, so a
// multi-word unit ("cápsulas em gel", "capsules molles") wraps at a space, and each piece stays
// on one line and shrinks to fit (adjustsFontSizeToFit, down to 0.55) instead of breaking.
// Width estimate: Geist Mono advance 0.6 em less the -0.3 letter spacing, generous to the text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { readPieces } = require('../lib/readPieces');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const UNITS = ['oral_unit_capsule', 'oral_unit_tablet', 'oral_unit_softgel', 'oral_unit_gummy', 'oral_unit_scoop', 'oral_unit_ml'];
const NB = ' ';
const MIN_SCALE = 0.55;
const SIZE = 17;
const est = (s) => String(s).length * (0.6 * SIZE - 0.3);
// The narrowest column: a 360 dp Android phone (card 328, padding 2 x 18, two 8 gaps → ~92).
const COLUMN = 92;

test('A-136 (4): a reading splits only at ordinary spaces; the value keeps its first unit word', () => {
  assert.deepEqual(readPieces(`58${NB}cápsulas`), [`58${NB}cápsulas`]);
  assert.deepEqual(readPieces(`120${NB}cápsulas em gel`), [`120${NB}cápsulas`, 'em', 'gel']);
  assert.deepEqual(readPieces('25 mg'.replace(' ', NB)), [`25${NB}mg`]);
  assert.deepEqual(readPieces('58'), ['58']);
  assert.deepEqual(readPieces(''), []);
  assert.deepEqual(readPieces(null), []);
});

test('A-136 (4): every serving word, in every language, fits the column at the shrink floor', () => {
  for (const l of LANGS) {
    for (const k of UNITS) {
      // a half only where the form can be split (tablet, powder scoop, liquid ml: lib/oralMath)
      const counts = ['oral_unit_tablet', 'oral_unit_scoop', 'oral_unit_ml'].includes(k) ? ['1', '58', '120', '12,5'] : ['1', '58', '120'];
      for (const n of counts) {
        // the singular word for 1 (A-136 (7)), the plural otherwise
        const word = n === '1' ? tr[l][`${k}_one`] : tr[l][k];
        assert.ok(word, `${l} ${k} ${n}`);
        for (const piece of readPieces(`${n}${NB}${word}`)) {
          assert.ok(est(piece) * MIN_SCALE <= COLUMN, `${l} ${k} "${piece}" ${Math.round(est(piece) * MIN_SCALE)}`);
        }
      }
    }
  }
});

test('A-136 (4): the serving and syringe readings use ReadValue (one line per piece, shrink, wrap at spaces)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(src, /import \{ readPieces(, readScale, READ)? \} from '\.\.\/lib\/readPieces'/);
  const fn = src.slice(src.indexOf('function ReadValue('), src.indexOf('function ReadValue(') + 900);
  assert.match(fn, /const pieces = readPieces\(text\);/);
  assert.match(fn, /pieces\.map/);
  assert.match(fn, /<Text key=\{i\} style=\{\[s\.readVal, s\.readPiece, size\]\} numberOfLines=\{1\}>/); // one scale for every piece, floor 0.55 (A-135 council (5), lib/readPieces readScale)
  assert.match(src, /\n\s+readValWrap: \{ flexDirection: 'row', flexWrap: 'wrap'/);
  assert.match(src, /\n\s+readPiece: \{ maxWidth: '100%' \}/);
  assert.doesNotMatch(src, /<Text style=\{s\.readVal\}>/, 'no reading renders as one breakable Text');
  assert.match(src, /\{rd \? <ReadValue s=\{s\} text=\{rd\.value\} \/> : null\}/);
});
