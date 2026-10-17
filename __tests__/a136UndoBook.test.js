'use strict';
// A-136 (8) — guided device session 2026-10-17 (Fold7 unfolded): Today › Complexo de Vitamina B ›
// Concluir showed "Dose registrada · Desfazer" on the left page; tapping Desfazer (twice) left
// the dose Taken (count "1 de 6", row still there). Folded, the same Undo worked.
// Investigation: the book and the cover screen share ONE toast, ONE handler (undoTake →
// applyUndo with the live record) and ONE write path; nothing in the undo code depends on the
// posture (pinned below). What differs is WHERE the toast sat: the captures (b5_done / b5_undone)
// show it entirely inside the empty band under the left page (toast y 760–815 of 1000, the page
// ending at 762, tab bar at 838) — the bottom padding the Samsung taskbar inset added to Today's
// root SafeAreaView (A-136 (1)). The toast is absolute from the root's border edge, so in the
// book it sat in that padding, over no page; on the cover screen (small gesture-bar inset) it sat
// over the page content, where Undo worked. Today's root now takes no bottom edge
// (TAB_SCREEN_EDGES, fixed in A-136 (1)), so in the book the toast sits over the page exactly as
// on the cover screen. Proof: this test is red on f902a2d (the build-49 source: default edges)
// and green now; the tap itself must be re-checked on the Fold (device step in the registry).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = process.env.A136_TODAY_SRC
  ? fs.readFileSync(process.env.A136_TODAY_SRC, 'utf8')
  : fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');

test('A-136 (8): Today root has no bottom padding, so the Undo toast never sits in an inset band', () => {
  const root = SRC.match(/<SafeAreaView style=\{s\.container\}[^>]*ref=\{rootRef\}[^>]*>/);
  assert.ok(root, 'the root');
  assert.match(root[0], /edges=\{TAB_SCREEN_EDGES\}/, root[0]);
});

test('A-136 (8): one toast and one Undo handler for both postures, drawn after the pages', () => {
  const ret = SRC.slice(SRC.indexOf('<SafeAreaView style={s.container}'));
  const panes = ret.indexOf('{book ? <BookPanes left={leftPage} right={renderRightPage()} rightKey={bookSel} /> : leftPage}');
  const toast = ret.indexOf('<View style={toast.undoBar}>');
  assert.ok(panes > 0 && toast > panes, 'the toast follows the pages (on top of them)');
  assert.equal((SRC.match(/onPress=\{undoTake\}/g) || []).length, 1, 'one Undo control');
  assert.match(SRC, /function undoTake\(\) \{ applyUndo\(undoData\); \}/, 'it undoes the live record');
});
