'use strict';
// DT Council 2026-10-17 on f902a2d..8c880f4 (A-135 skeleton + A-136 Fold fixes): the fixes asked
// before the next test build, each test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// (1) Privacy: the layout memory (which blocks Today showed, keyed by the user id) is cleared with
// everything else on an intentional sign-out and on account deletion — not only later, when the
// app notices it has no session.
test('council (1): the wipe steps forget Today\'s layout memory', () => {
  const S = require('../lib/signedOut');
  const calls = [];
  const d = { stopSyncEngine: () => {} };
  for (const k of ['clearLocalDatabase', 'cancelAllNotifications', 'dismissAllNotifications', 'logOutPurchases', 'clearOnboarding', 'removeRcStart', 'clearRealityDeviceFlags', 'clearSeenOnboarding', 'removeQuestions', 'resetAllSelections', 'clearAllDrafts', 'forgetTodayLayout']) d[k] = () => { calls.push(k); };
  S.registerWipe(() => d);
  S.runRegisteredWipe();
  assert.ok(calls.includes('forgetTodayLayout'), 'forgetTodayLayout is a wipe step');
  assert.ok(calls.includes('clearAllDrafts'), 'the other steps still run');
});

test('council (1): App passes forgetTodayLayout in wipeDeps; onAuthStateChange is untouched', () => {
  const app = read('App.js');
  const i = app.indexOf('const wipeDeps = () => ({');
  assert.ok(i > 0);
  const block = app.slice(i, app.indexOf('});', i));
  assert.match(block, /\bforgetTodayLayout,/);
  const cbStart = app.indexOf('onAuthStateChange(');
  const cb = app.slice(cbStart, cbStart + 6000);
  assert.ok(!cb.includes('forgetTodayLayout'), 'nothing new inside onAuthStateChange');
});

// (2) UX: during the opening the tab bar is real but the app is not up yet, so a tap cannot
// navigate. The last tapped tab is remembered and the real app opens on it when the start ends.
test('council (2): the opening remembers the last tapped tab and the app opens on it', () => {
  const { bootTabTarget } = require('../lib/todaySkeleton');
  const tabs = ['Today', 'Protocols', 'Journey', 'Body', 'Settings'];
  const main = ['Main'];
  assert.deepEqual(bootTabTarget({ tapped: 'Settings', routeNames: main, tabNames: tabs }), { screen: 'MainTabs', params: { screen: 'Settings' } });
  assert.deepEqual(bootTabTarget({ tapped: 'Body', routeNames: main, tabNames: tabs }), { screen: 'MainTabs', params: { screen: 'Body' } });
  assert.equal(bootTabTarget({ tapped: null, routeNames: main, tabNames: tabs }), null, 'no tap: Today');
  assert.equal(bootTabTarget({ tapped: 'Today', routeNames: main, tabNames: tabs }), null, 'Today is already open');
  assert.equal(bootTabTarget({ tapped: 'Nope', routeNames: main, tabNames: tabs }), null, 'only a real tab');
  assert.equal(bootTabTarget({ tapped: 'Settings', routeNames: ['Auth'], tabNames: tabs }), null, 'signed out / profile to complete: no tab');
  assert.equal(bootTabTarget({ tapped: 'Settings', routeNames: main, tabNames: tabs, pendingNav: true }), null, 'a notification tap wins');
});

test('council (2): BootTabs still prevents navigation but records the tap; the app applies it once on ready', () => {
  const app = read('App.js');
  const i = app.indexOf('function BootTabs(');
  const boot = app.slice(i, app.indexOf('\n}\n', i));
  assert.match(boot, /screenListeners=\{\(\{ route \}\) => \(\{ tabPress: \(e\) => \{ e\.preventDefault\(\); if \(onTabTap\) onTabTap\(route\.name\); \} \}\)\}/);
  assert.match(app, /<BootTabs onTabTap=\{onTabTap\} \/>/);
  assert.match(app, /<BootScreen lastUser=\{bootUser\} fontsLoaded=\{fontsLoaded\} onTabTap=\{rememberBootTab\} \/>/);
  assert.match(app, /const bootTabRef = useRef\(null\);/);
  assert.match(app, /const target = bootTabTarget\(\{ tapped: tab, routeNames: names, tabNames: TAB_NAMES, pendingNav: !!pendingNavRef\.current \}\);/);
  assert.match(app, /onNavReady=\{onRootNavReady\}/);
});

// (3) Copy (A-136 oral IU wizard): the warning said what is wrong but not what to do. It now names
// the two fields by their on-screen names and the fix, in each language's own IU word.
test('council (3): the serving unit warning says how to fix it, natural in all 6 languages', () => {
  const { translations: tr } = require('../i18n/translations.js');
  const want = {
    en: { iu: 'IU', field: 'strength per serving' },
    es: { iu: 'UI', field: 'contenido por porción' },
    pt: { iu: 'UI', field: 'concentração por porção' },
    fr: { iu: 'UI', field: 'dosage par portion' },
    de: { iu: 'IE', field: 'Wirkstoff pro Portion' },
    it: { iu: 'UI', field: 'dosaggio per porzione' },
  };
  for (const [lang, w] of Object.entries(want)) {
    const s = tr[lang].protocols_serving_unit_mismatch;
    assert.ok(s.includes(w.field), `${lang} names the field: ${s}`);
    assert.ok(tr[lang].protocols_serving_strength.toLowerCase() === w.field.toLowerCase(), `${lang} field name matches the label`);
    assert.ok(new RegExp(`\\b${w.iu}\\b`).test(s), `${lang} says ${w.iu}: ${s}`);
    assert.ok(s.includes('mg / mcg / g'), `${lang} names the weight units: ${s}`);
  }
  assert.match(tr.fr.protocols_serving_unit_mismatch, /^Indiquez /, 'French says vous');
});

// (4) The Fold opening (founder rule "no spinners", picture a135).
test('council (4a): the Dose log on the book\'s right page loads on its plain page ground, no spinner', () => {
  const log = read('screens/LogScreen.js');
  assert.match(log, /\{listState === 'loading' \? \(\s*<View style=\{s\.loadingBox\}>\s*\{!embedded && <ActivityIndicator size="large" color=\{colors\.accent\} \/>\}\s*<\/View>/);
  assert.match(log, /loadingBox: \{ flex: 1, paddingTop: 96, alignItems: 'center' \}/, 'no ground of its own: the page ground shows');
});

const trackerShape = () => {
  const src = read('screens/components/TodaySkeleton.js');
  const i = src.indexOf('function TrackerShape(');
  return src.slice(i, src.indexOf('\n}\n', i));
};

test('council (4b): the ring placeholder takes the same fit as the real tracker (no jump at the swap)', () => {
  const src = read('screens/components/TodaySkeleton.js');
  assert.match(src, /import \{ trackerFit \} from '\.\.\/\.\.\/lib\/trackerFit';/);
  const t = trackerShape();
  assert.match(t, /const \[inner, setInner\] = useState\(0\);/);
  assert.match(t, /const fit = trackerFit\(inner\);/);
  assert.match(t, /onLayout=\{\(e\) => setInner\(Math\.round\(e\.nativeEvent\.layout\.width\) - 40\)\}/, 'the slab interior, as TodayTracker');
  assert.match(t, /\{ gap: fit\.gap \}/);
  assert.match(t, /width: fit\.big, height: fit\.big/);
  assert.match(t, /<Ring size=\{fit\.big\}/);
  assert.ok(!/\b132\b|\b18\b/.test(t), 'no hardcoded gauge / gap');
  // TodayTracker measures the same box the same way.
  const tracker = read('screens/components/TodayTracker.js');
  assert.match(tracker, /onLayout=\{\(e\) => setInner\(Math\.round\(e\.nativeEvent\.layout\.width\) - 40\)\}/);
  // trackerFit with nothing measured is the approved 132 / 18.
  const { trackerFit } = require('../lib/trackerFit');
  assert.deepEqual(trackerFit(0), { big: 132, gap: 18, pctMax: null });
});

test('council (4c): only the placeholder bars pulse in the ring block, not the ring tracks or the week circles', () => {
  const t = trackerShape();
  assert.ok(!t.includes('Animated.View'), 'the block itself does not pulse');
  assert.ok(!/<Ring[^>]*ps/.test(t), 'rings stay still');
  assert.match(t, /<View style=\{\[s\.wdc, \{ borderColor: line \}\]\} \/>/, 'week circles stay still');
  // Every bar in the block pulses (ps passed), and Bar can pulse on its own.
  const bars = t.match(/<Bar\b[^>]*\/>/g) || [];
  assert.ok(bars.length >= 9, String(bars.length));
  for (const b of bars) assert.match(b, /\bps=\{ps\}/, b);
  const src = read('screens/components/TodaySkeleton.js');
  assert.match(src, /function Bar\(\{ w, h = 12, lh, color, style, ps \}\)/);
  assert.match(src, /const Box = ps \? Animated\.View : View;/);
});

// (5) One size per value: the pieces of a reading, and the two matching rows of the tracker, never
// shrink each on its own ("58" at 17 pt next to "cápsulas" at ~9 pt; "7 dias" and "30 dias" in two
// sizes on the Fold).
test('council (5): a reading takes one scale for all its pieces', () => {
  const { readPieces, readScale, READ } = require('../lib/readPieces');
  const w = (p) => p.length * (0.6 * READ.SIZE - 0.3); // Geist Mono: 0.6 em less the letter spacing
  // Room for everything: full size.
  assert.equal(readScale(['58', 'cápsulas'], 200), 1);
  assert.equal(readScale(['58', 'cápsulas'], 0), 1, 'not measured yet');
  assert.equal(readScale([], 50), 1);
  // A little short: one line, every piece at the same smaller scale (never below the floor).
  const pieces = ['58', 'cápsulas'];
  const oneLine = w('58') + w('cápsulas') + READ.GAP;
  const sOne = readScale(pieces, oneLine - 8);
  assert.ok(sOne < 1 && sOne >= READ.FLOOR, String(sOne));
  assert.ok((w('58') + w('cápsulas')) * sOne + READ.GAP <= oneLine - 8 + 0.01, 'fits one line');
  // Too short for one line at the floor: it wraps at the space, at full size while the longest piece fits.
  assert.equal(readScale(pieces, w('cápsulas') + 1), 1);
  // A single piece wider than the column: all shrink together, as far as the old floor (never a break in a word).
  const long = readPieces('120 cápsulas em gel');
  const sLong = readScale(long, 90);
  assert.ok(sLong < 1 && sLong >= READ.MIN, String(sLong));
  assert.ok(w(long[0]) * sLong <= 90 + 0.01);
  assert.equal(READ.FLOOR, 0.85);
  assert.equal(READ.MIN, 0.55);
});

test('council (5): ReadValue measures its column and gives every piece the same size', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /import \{ readPieces, readScale, READ \} from '\.\.\/lib\/readPieces';/);
  const fn = src.slice(src.indexOf('function ReadValue('), src.indexOf('\n}\n', src.indexOf('function ReadValue(')));
  assert.match(fn, /const \[col, setCol\] = useState\(0\);/);
  assert.match(fn, /onLayout=\{\(e\) => setCol\(Math\.round\(e\.nativeEvent\.layout\.width\)\)\}/);
  assert.match(fn, /const k = readScale\(pieces, col\);/);
  assert.match(fn, /const size = \{ fontSize: READ\.SIZE \* k, letterSpacing: -0\.3 \* k \};/);
  assert.match(fn, /<Text key=\{i\} style=\{\[s\.readVal, s\.readPiece, size\]\} numberOfLines=\{1\}>/);
  assert.ok(!fn.includes('adjustsFontSizeToFit'), 'no piece shrinks on its own');
});

test('council (5): the tracker\'s two side rows share one label size and one count size', () => {
  const { sideTextSize } = require('../lib/trackerFit');
  assert.equal(sideTextSize(0, ['7 dias', '30 dias'], 15), 15, 'not measured yet');
  assert.equal(sideTextSize(200, ['7 dias', '30 dias'], 15), 15);
  const narrow = sideTextSize(40, ['7 dias', '30 dias'], 15);
  assert.ok(narrow < 15 && narrow >= 15 * 0.75, String(narrow));
  assert.equal(sideTextSize(40, ['30 dias', '7 dias'], 15), narrow, 'the longest decides, in any order');
  assert.ok(sideTextSize(10, ['30 giorni'], 15) >= 15 * 0.75, 'floor');
  const src = read('screens/components/TodayTracker.js');
  assert.match(src, /import \{ trackerFit, sideTextSize \} from '\.\.\/\.\.\/lib\/trackerFit';/);
  assert.match(src, /const labelSize = sideTextSize\(col, \[label7, label30\], 15\);/);
  assert.match(src, /const subSize = sideTextSize\(col, \[sub7, sub30\], 13, 0\.5\);/);
  assert.match(src, /<Text style=\{\[s\.sideLabel, \{ fontSize: labelSize \}\]\} numberOfLines=\{1\}>\{label\}<\/Text>/);
  assert.match(src, /<Text style=\{\[s\.sideSub, \{ fontSize: subSize \}\]\} numberOfLines=\{1\}>\{sub\}<\/Text>/);
  assert.match(src, /onLayout=\{\(e\) => measureCol\(i, e\.nativeEvent\.layout\.width\)\}/);
});
