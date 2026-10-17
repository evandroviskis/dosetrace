'use strict';
// A-136 (9) — guided device session 2026-10-17 (Fold7 unfolded): Today › a dose › the right
// page (the protocol's page) › Notas near the bottom: focusing the field raised the keyboard over
// it (field y ≈ 1475–1664 px of 2184, keyboard top ≈ 1190) and the page did not scroll, so the
// user could not see what they typed. The app draws edge to edge on Android, so the window is not
// resized for the keyboard; nothing moved the page. The same note field (ProtocolDetail) sits on
// My Protocols' detail (phone and the book's right page).
// Fix: lib/keyboardLift (pure) + components/useKeyboardLift: while the keyboard is up the page's
// content gets room below it (a spacer as tall as the keyboard), and the focused note is scrolled
// just above the keyboard (its measured bottom vs the keyboard's top, 16 dp margin) — on focus
// and again when the keyboard has opened. Every page that shows ProtocolDetail uses it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { liftScrollY } = require('../lib/keyboardLift');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-136 (9): the Fold case — the note under the keyboard scrolls to just above it', () => {
  // dp on the unfolded Fold (px / 2.625): field 562–634, keyboard top 453, page scrolled 300
  const y = liftScrollY({ fieldTop: 562, fieldBottom: 634, kbTop: 453, viewTop: 60, scrollY: 300 });
  assert.equal(y, 300 + (634 + 16 - 453), 'the field bottom lands 16 above the keyboard');
});

test('A-136 (9): a field already above the keyboard does not move', () => {
  assert.equal(liftScrollY({ fieldTop: 200, fieldBottom: 260, kbTop: 453, viewTop: 60, scrollY: 120 }), null);
  assert.equal(liftScrollY({ fieldTop: 200, fieldBottom: 260, kbTop: null, viewTop: 60, scrollY: 0 }), null, 'no keyboard');
});

test('A-136 (9): a field taller than the room shows its top, never scrolls it off the top', () => {
  // room between the page top (60) and the keyboard (453) is 393; a 500-tall field
  const y = liftScrollY({ fieldTop: 600, fieldBottom: 1100, kbTop: 453, viewTop: 60, scrollY: 0 });
  assert.equal(y, 600 - 60 - 16, 'its top sits 16 under the page top');
});

test('A-136 (9): the note field asks to be lifted; every page with ProtocolDetail lifts it', () => {
  const pro = read('screens/ProtocolsScreen.js');
  const detail = pro.slice(pro.indexOf('export function ProtocolDetail('));
  assert.match(detail, /export function ProtocolDetail\(\{[^}]*onNoteFocus[^}]*\}\)/);
  assert.match(detail, /onFocus=\{\(\) => \{ setNoteFocus\(true\); if \(onNoteFocus\) onNoteFocus\(noteRef\); \}\}/);
  assert.match(detail, /ref=\{noteRef\}/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /const pageLift = useKeyboardLift\(\);/);
  assert.match(today, /<ScrollView \{\.\.\.pageLift\.scrollProps\} showsVerticalScrollIndicator=\{false\} contentContainerStyle=\{s\.pageScroll\}>/);
  assert.match(today, /onNoteFocus=\{pageLift\.liftField\}/);
  assert.match(today, /\{pageLift\.spacer\}/);
  assert.match(pro, /const detailLift = useKeyboardLift\(scrollRef\);/); // keeps the views' scroll-to-top ref
  assert.equal((pro.match(/onNoteFocus=\{detailLift\.liftField\}/g) || []).length, 1, 'renderDetail passes it (book and phone)');
  assert.equal((pro.match(/\{\.\.\.detailLift\.scrollProps\}/g) || []).length, 2, 'the book right page and the phone detail scroll');
  assert.equal((pro.match(/\{detailLift\.spacer\}/g) || []).length, 2);
  const hook = read('components/useKeyboardLift.js');
  assert.match(hook, /keyboardDidShow/);
  assert.match(hook, /measureInWindow/);
  assert.match(hook, /liftScrollY\(/);
});
