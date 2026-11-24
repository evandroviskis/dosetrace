'use strict';
// Today on the open Fold (docs/specs/fold-today-layout.md, founder 2026-11-17 "A. Pode.", picture
// docs/design/today-fold-layout.html): left = Today title, alerts, rings and the Dose log; right =
// the reminder dose, the food card, Pending from yesterday, today's doses, taken, upcoming. A tapped
// dose opens its protocol page on the LEFT. One column keeps the exact old Today. Source tests, as
// the other book tests (no React Native renderer in plain Node).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TODAY = read('screens/TodayScreen.js');
const LOG = read('screens/LogScreen.js');
const PANES = read('components/BookPanes.js');

// The source of `const name = (` … up to the next top-level const of the render body.
function constBlock(src, name) {
  const i = src.indexOf(`  const ${name} = `);
  assert.ok(i > 0, `${name} exists`);
  const j = src.indexOf('\n  const ', i + 10);
  return src.slice(i, j > 0 ? j : undefined);
}
const order = (src, pieces) => {
  let at = -1;
  for (const p of pieces) {
    const k = src.indexOf(p, at + 1);
    assert.ok(k > at, `${p} comes after the previous piece`);
    at = k;
  }
};

test('FT-6: one column is exactly the old Today order', () => {
  const lp = constBlock(TODAY, 'leftPage');
  assert.match(lp, /<ScrollView ref=\{leftScrollRef\}/);
  order(lp, ['{headerEl}', '{focusEl}', '{alertsEl}', '{pendingEl}', '{trackerEl}', '{foodEl}', '{emptyEl}', '{dosesEl}', '{upcomingEl}', '{disclaimerEl}']);
  assert.match(TODAY, /\{book \? <BookPanes [^\n]*\/> : leftPage\}/, 'the phone renders leftPage alone');
  // Each piece still holds what it held (nothing dropped while splitting).
  assert.match(constBlock(TODAY, 'alertsEl'), /alerts\.length > 0/);
  assert.match(constBlock(TODAY, 'pendingEl'), /pendingYest\.length > 0/);
  assert.match(constBlock(TODAY, 'trackerEl'), /<TodayTracker/);
  assert.match(constBlock(TODAY, 'foodEl'), /<FoodLogHero variant="today"/);
  const doses = constBlock(TODAY, 'dosesEl');
  // Early dose (docs/specs/early-dose-guard.md, option B): the doses are Agora (cards) + Mais tarde hoje.
  assert.match(TODAY, /const doseSplit = splitTodayDoses\(\{ cards: todayCards\.filter\(p => !focusCard \|\| p\.id !== focusCard\.id\)/);
  assert.ok(doses.includes('{nowCards.map(p => renderDoseCard(p))}'));
  assert.ok(doses.includes('laterDoses.map((it, i) => renderLaterRow(it, i))'));
  assert.ok(doses.includes('takenNames.length > 0'));
  assert.match(constBlock(TODAY, 'upcomingEl'), /foldRow\('tom'[\s\S]*foldRow\('n5'/);
  assert.match(constBlock(TODAY, 'focusEl'), /focusCard/);
});

test('FT-1: the left page is the Today title, alerts and rings above the embedded Dose log', () => {
  const left = constBlock(TODAY, 'bookLeft');
  assert.match(left, /dosePage \|\| \(/, 'a tapped dose replaces it');
  assert.match(left, /<LogScreen embedded lead=\{<>\{headerEl\}\{alertsEl\}\{trackerEl\}<\/>\}/);
  assert.match(left, /refreshKey=\{logRev\} onChanged=\{afterLogChange\} popupGate=\{logPopupGate\} scrollRequest=\{logScroll\}/);
  // The Log draws the lead above its title, in the same list (one scroll). Review 2026-11-17: with a
  // lead the list is always mounted, so the lead never mounts twice (loading → loaded); while it
  // loads the list holds only the lead — no counts, no empty state (A-120).
  assert.match(LOG, /export default function LogScreen\(\{ embedded = false, refreshKey, onChanged, popupGate, lead = null, scrollRequest = null, openRequest = null \} = \{\}\)/);
  assert.match(LOG, /\{listState === 'loading' && !lead \? \(\s*<View style=\{s\.loadingBox\}>/);
  assert.match(LOG, /sections=\{listState === 'loading' \? \[\] : sections\}/);
  assert.match(LOG, /ListHeaderComponent=\{lead \? <>\{leadEl\}\{listState === 'loading' \? null : header\}<\/> : header\}/);
  assert.match(LOG, /ListEmptyComponent=\{listState === 'loading' \? null : \(/);
  // The only ScrollView is the dose sheet's own body (docs/specs/dose-observation.md DO-12), inside its Modal.
  const outsideSheet = LOG.slice(0, LOG.indexOf('{/* The dose sheet')) + LOG.slice(LOG.indexOf('<DoseEditSheet'));
  assert.equal(/<ScrollView/.test(outsideSheet), false, 'no second container for the lead');
  assert.match(LOG, /\{!lead && \(\s*<View style=\{\[s\.nav, embedded && s\.navEmbedded\]\}>/, 'with a lead the curve button rides in the title row');
  assert.match(LOG, /<View style=\{s\.leadTitleRow\}>\s*<Text style=\{\[s\.title, s\.titleLead\]\}>\{t\('log_title'\)\}<\/Text>\s*\{curveBtn\}/);
  assert.match(LOG, /\n\s*leadBleed: \{ marginHorizontal: -16 \}/, 'Today blocks keep their own side margins inside the list padding');
});

test('FT-2: the right page holds what to do now, in the approved order, and keeps its place', () => {
  const right = constBlock(TODAY, 'bookRight');
  // Review 2026-11-17: the doses page stays mounted (hidden) under an open search, so closing the
  // search keeps its scroll, its food card read and the offsets a search landing scrolls to.
  assert.match(TODAY, /const searchOpen = bookSel === SEARCH_PAGE;/);
  assert.match(right, /<ScrollView ref=\{rightScrollRef\} style=\{searchOpen \? s\.pageHidden : null\}/);
  assert.match(right, /\{searchOpen && <AppSearchScreen embedded tab="Today" \/>\}/);
  assert.match(TODAY, /\n\s*pageHidden: \{ display: 'none' \}/);
  order(right, ['{focusEl}', '{foodEl}', '{pendingEl}', '{emptyEl}', '{dosesEl}', '{upcomingEl}', '{disclaimerEl}']);
  assert.ok(!/headerEl|alertsEl|trackerEl/.test(right), 'title, alerts and rings stay left');
  // The right pane never remounts (a tapped dose, the search); the left one is the dose or the log,
  // with the search filter's nonce so a filtered log takes the screen reader (BK-21).
  assert.match(TODAY, /<BookPanes left=\{bookLeft\} right=\{bookRight\} leftKey=\{leftKey\} rightKey="today" \/>/);
  assert.match(TODAY, /const leftKey = dosePage \? bookSel : `log:\$\{\(bookParams && bookParams\.nonce\) \|\| ''\}`;/);
});

test('FT-3: a tapped dose opens its protocol page on the left with a way back to the Dose log', () => {
  assert.match(TODAY, /const dosePage = book \? renderDosePage\(\) : null;/);
  assert.equal(/function renderRightPage\(/.test(TODAY), false, 'the old right-page function is gone');
  const i = TODAY.indexOf('function renderDosePage(');
  const fn = TODAY.slice(i, TODAY.indexOf('\n  }\n', i));
  assert.match(fn, /if \(!p\) return null;/);
  assert.match(fn, /<ProtocolDetail/);
  assert.match(fn, /deleteProtocol=\{null\}/, 'no Delete there');
  assert.ok(!/markTaken|skipDose|undoTake/.test(fn), 'no Mark taken / Skip / Undo there');
  assert.match(fn, /onPress=\{\(\) => bookSelect\('log'\)\}[\s\S]*‹ \{t\('log_title'\)\}/);
  // BookPanes: the side whose key changed takes the screen reader.
  assert.match(PANES, /export default function BookPanes\(\{ left, right, rightKey, leftKey \}\)/);
  assert.match(PANES, /<View style=\{s\.pane\} key=\{leftKey\} ref=\{leftRef\}/);
  assert.match(PANES, /if \(leftKey !== keys\.current\.left\) focus\(leftRef\);/);
});

test('FT-4: the Undo bar and the take notice sit on the right page', () => {
  assert.match(TODAY, /const toastOnRightPage = book \? \{ left: paneWidths\(winW\)\.left \+ paneWidths\(winW\)\.gutter \+ 12 \} : null;/);
  assert.match(TODAY, /undoBar: \[s\.undoBar, toastOnRightPage\], takeNoticeBar: \[s\.takeNoticeBar, toastOnRightPage\]/);
  assert.equal(/toastOnLeftPage/.test(TODAY), false);
});

test('FT-5: app search lands on the page that holds the block', () => {
  const i = TODAY.indexOf('if (!searchLand');
  const eff = TODAY.slice(i, TODAY.indexOf('}, [searchLand]);', i));
  assert.match(eff, /if \(book && searchLand\.target === 'alerts'\) \{ bookSelect\('log'\); setLogScroll\(\{ to: 'top', n: Date\.now\(\) \}\); setSearchLand\(null\); return; \}/);
  assert.match(eff, /const ref = book \? rightScrollRef : leftScrollRef;/);
  assert.match(eff, /if \(book\) setTimeout\(go, 60\); else go\(\);/, 'the right page scrolls once it shows again');
  // The log applies a request once its list and the lead are laid out, and never replays an old one.
  assert.match(LOG, /if \(!scrollRequest \|\| Date\.now\(\) - scrollRequest\.n > 2000\) return;/);
  assert.match(LOG, /const y = req\.to === 'log' \? leadH\.current : 0;/);
  assert.match(LOG, /onLayout=\{\(e\) => \{ leadH\.current = e\.nativeEvent\.layout\.height; applyScroll\(\); \}\}/);
});

test('FT-1 (review 2026-11-17): the streak row on the Fold scrolls the left page to the Dose log', () => {
  assert.match(TODAY, /onHistory=\{\(\) => \(book \? \(bookSelect\('log'\), setLogScroll\(\{ to: 'log', n: Date\.now\(\) \}\)\) : navigation\.navigate\('Log'\)\)\}/);
});

test('FT-2 (review 2026-11-17): the opening skeleton draws the right page in its real order', () => {
  const sk = read('screens/components/TodaySkeleton.js');
  assert.match(sk, /export const BOOK_RIGHT_ORDER = \['food', 'pending', 'empty', 'doses'\];/);
  const right = constBlock(TODAY, 'bookRight');
  const R = ['{foodEl}', '{pendingEl}', '{emptyEl}', '{dosesEl}'];
  order(right, R); // the same order as the real page
  assert.match(sk, /const rightBlocks = BOOK_RIGHT_ORDER\.map\(\(k\) => plan\.find\(\(b\) => b\.key === k\)\)\.filter\(Boolean\)/);
});

test('FT-7: the layout adds no string and no raw colour', () => {
  for (const src of [constBlock(TODAY, 'bookLeft'), constBlock(TODAY, 'bookRight')]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/.test(src));
  }
  const m = LOG.match(/\n\s*titleLead: \{([^}]*)\}/);
  assert.ok(m && !/#|rgba|white|black/.test(m[1]));
});
