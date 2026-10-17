'use strict';
// A-135 (founder 2026-10-17, picture docs/design/a135-today-skeleton.html, "aprovo, pulso ligado"):
// Today opens at once with its skeleton — date, "Hoje", the tab bar and the cards at their final
// size in a quiet tone, no number, no text — and each card fills in place when its data arrives.
// The Fold7 cold start (2026-10-16) showed a full-screen spinner, then the title with a second
// spinner, then the whole Today. Spec: docs/specs/today-skeleton.md (SK-1…SK-15).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));
const sk = () => require('../lib/todaySkeleton');

// ── the layout memory ("mould"): pure rules ─────────────────────────────────────────────────────
test('SK-8: the mould keeps only which blocks were shown, their rows / cards and heights — never data', () => {
  assert.ok(exists('lib/todaySkeleton.js'), 'lib/todaySkeleton.js');
  const { sanitizeLayout } = sk();
  const dirty = {
    alerts: { h: 210.4, n: 2, title: 'Estoque baixo', body: 'TB-500, BPC-157' },
    pending: { h: 150, n: 1, name: 'BPC-157' },
    tracker: { h: 309, pct: 12, streak: 4 },
    food: { h: 220, kcal: 1800 },
    doses: { h: 460, cards: [181, 181.6], names: ['TB-500'], amounts: ['2,5 mg'] },
    userName: 'Sam', weight: 82.5, protocols: [{ id: 1 }],
  };
  const clean = sanitizeLayout(dirty);
  assert.deepEqual(clean, {
    alerts: { h: 210, n: 2 },
    pending: { h: 150, n: 1 },
    tracker: { h: 309 },
    food: { h: 220 },
    doses: { h: 460, cards: [181, 182] },
  });
  // Every leaf is a number: nothing a person could read as their data.
  const leaves = [];
  (function walk(v) { if (v && typeof v === 'object') Object.values(v).forEach(walk); else leaves.push(v); })(clean);
  assert.ok(leaves.every((v) => typeof v === 'number' && Number.isFinite(v)), 'numbers only');
});

test('SK-8: a broken or hostile stored value never reaches the screen', () => {
  const { sanitizeLayout, parseStore } = sk();
  assert.equal(sanitizeLayout(null), null);
  assert.equal(sanitizeLayout('x'), null);
  assert.equal(sanitizeLayout([]), null);
  assert.deepEqual(sanitizeLayout({ alerts: { h: -5, n: 2 }, tracker: { h: 'big' }, food: { h: 1e9 }, doses: { h: 400, cards: 'many' } }), { doses: { h: 400, cards: [] } });
  assert.deepEqual(sanitizeLayout({ alerts: { h: 100, n: 99 } }), { alerts: { h: 100, n: 8 } }, 'rows are capped');
  assert.equal(sanitizeLayout({ doses: { h: 900, cards: new Array(20).fill(100) } }).doses.cards.length, 8, 'cards are capped');
  assert.equal(parseStore('not json'), null);
  assert.equal(parseStore(null), null);
  assert.equal(parseStore(JSON.stringify({ user: 42 })), null, 'the owner is a user id string');
  assert.deepEqual(parseStore(JSON.stringify({ user: 'u1', single: { tracker: { h: 300, pct: 9 } }, book: 'x', extra: 1 })), { user: 'u1', single: { tracker: { h: 300 } }, book: null });
});

test('SK-8: the mould belongs to one user and one posture; another user gets none', () => {
  const { withLayout, layoutFor, lastSignedInUser } = sk();
  let st = withLayout(null, 'u1', 'single', { tracker: { h: 300 }, name: 'x' });
  assert.deepEqual(st, { user: 'u1', single: { tracker: { h: 300 } }, book: null });
  st = withLayout(st, 'u1', 'book', { doses: { h: 400, cards: [180, 180] } });
  assert.deepEqual(layoutFor(st, 'u1', 'single'), { tracker: { h: 300 } });
  assert.deepEqual(layoutFor(st, 'u1', 'book'), { doses: { h: 400, cards: [180, 180] } });
  assert.equal(layoutFor(st, 'u2', 'single'), null, 'another account never sees this mould');
  assert.deepEqual(layoutFor(st, null, 'single'), { tracker: { h: 300 } }, 'the opening (no user read yet) uses the owner');
  assert.equal(lastSignedInUser(st), 'u1');
  const other = withLayout(st, 'u2', 'single', { food: { h: 200 } });
  assert.deepEqual(other, { user: 'u2', single: { food: { h: 200 } }, book: null }, 'a new user starts a fresh mould');
  assert.equal(lastSignedInUser(null), null);
});

test('SK-9: no mould → the default shape set: ring, food log, 2 doses, no alerts', () => {
  const { skeletonPlan } = sk();
  const plan = skeletonPlan(null);
  assert.deepEqual(plan.map((b) => b.key), ['tracker', 'food', 'doses']);
  assert.equal(plan.find((b) => b.key === 'doses').cards.length, 2);
  assert.ok(plan.every((b) => b.h > 0));
  // A remembered mould is drawn in Today's order, only the blocks it has.
  const mine = skeletonPlan({ doses: { h: 300, cards: [180] }, alerts: { h: 200, n: 2 }, tracker: { h: 309 } });
  assert.deepEqual(mine.map((b) => b.key), ['alerts', 'tracker', 'doses']);
  assert.deepEqual(skeletonPlan({}).map((b) => b.key), [], 'a remembered empty Today draws no block');
});

test('SK-8/SK-14: the mould is built from what was on screen; an unchanged layout is not written again', () => {
  const { layoutFromMeasure, sameLayout } = sk();
  const lay = layoutFromMeasure({
    present: { alerts: 2, pending: 0, tracker: true, empty: false, doses: true },
    heights: { alerts: 210, pending: 150, tracker: 309, food: 0, empty: 180, doses: 460 },
    cards: [181, 181],
  });
  assert.deepEqual(lay, { alerts: { h: 210, n: 2 }, tracker: { h: 309 }, doses: { h: 460, cards: [181, 181] } }, 'a block not on screen (pending, empty) or 0 tall (food) is left out');
  assert.equal(layoutFromMeasure({ present: { tracker: true }, heights: {} }).tracker, undefined, 'a block not measured yet is left out');
  assert.ok(sameLayout(lay, { alerts: { h: 210.6, n: 2 }, tracker: { h: 309 }, doses: { h: 460, cards: [181, 181.4] } }), 'under 1 pt is the same');
  assert.ok(!sameLayout(lay, { ...lay, alerts: { h: 274, n: 3 } }));
  assert.ok(!sameLayout(lay, null));
});

// ── when a block fills in (SK-7, SK-10) ─────────────────────────────────────────────────────────
test('SK-7/SK-10: each block fills when its own reads are done; doses (and the empty state) only after the protocols were read', () => {
  const { sectionsReady } = sk();
  const none = sectionsReady({}, false);
  assert.deepEqual(none, { alerts: false, pending: false, tracker: false, food: false, doses: false });
  assert.equal(sectionsReady({ alerts: true }, false).alerts, false, 'vial / supply alerts need the protocols too');
  assert.equal(sectionsReady({ alerts: true, protocols: true }, false).alerts, true);
  assert.equal(sectionsReady({ food: true }, false).food, true, 'the food card needs only its own read');
  const most = { protocols: true, todayLogs: true, pStreaks: true, pending: true, streak: true, alerts: true, food: true };
  assert.equal(sectionsReady(most, false).doses, false, 'the last-site line is part of the card');
  assert.equal(sectionsReady({ ...most, sites: true }, false).doses, true);
  assert.equal(sectionsReady({ todayLogs: true, pStreaks: true, sites: true }, false).doses, false, 'never the empty state before the protocols were read');
  assert.equal(sectionsReady({ protocols: true, todayLogs: true }, false).tracker, false, 'the ring needs the streak');
  assert.deepEqual(sectionsReady({}, true), { alerts: true, pending: true, tracker: true, food: true, doses: true }, 'the 4 s cap ends every placeholder');
});

// ── the opening (SK-1, SK-2) ────────────────────────────────────────────────────────────────────
test('SK-1/SK-2: the opening is Today\'s skeleton only when the last session was signed in', () => {
  const { bootView } = sk();
  const allRead = { fontsLoaded: true, langReady: true, themeReady: true };
  assert.equal(bootView({ lastUser: 'u1', ...allRead }), 'today', 'signed-in cold start: no spinner');
  assert.equal(bootView({ lastUser: null, ...allRead }), 'spinner', 'signed out / never signed in: as before');
  assert.equal(bootView({ lastUser: undefined, ...allRead }), 'blank', 'the mould not read yet (a few ms): plain ground, no spinner');
  assert.equal(bootView({ lastUser: 'u1', ...allRead, fontsLoaded: false }), 'blank', 'never the system font, then a reflow');
  assert.equal(bootView({ lastUser: 'u1', ...allRead, langReady: false }), 'blank', 'never "Today" in English before "Hoje"');
  assert.equal(bootView({ lastUser: 'u1', ...allRead, themeReady: false }), 'blank', 'never the wrong theme first');
});

// ── the pulse (SK-11) ───────────────────────────────────────────────────────────────────────────
test('SK-11: a 1.6 s pulse, opacity 1 → 0.5 → 1; still with Reduce Motion / Remove animations', () => {
  const { PULSE_MS, shouldPulse, pulseOpacity, pulsePhase } = sk();
  assert.equal(PULSE_MS, 1600);
  assert.equal(shouldPulse({ reduceMotion: false }), true);
  assert.equal(shouldPulse({ reduceMotion: true }), false);
  assert.equal(shouldPulse({ reduceMotion: null }), true, 'unknown = the OS default (animations on)');
  assert.ok(Math.abs(pulseOpacity(0) - 1) < 1e-9);
  assert.ok(Math.abs(pulseOpacity(0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(pulseOpacity(1) - 1) < 1e-9);
  for (let p = 0; p <= 1; p += 0.05) { const o = pulseOpacity(p); assert.ok(o >= 0.5 - 1e-9 && o <= 1 + 1e-9); }
  // Two placeholders mounted at different moments pulse together (the opening, then Today).
  assert.equal(pulsePhase(1600 * 7 + 400), 0.25);
  assert.equal(pulsePhase(0), 0);
});

// ── wiring (source) ─────────────────────────────────────────────────────────────────────────────
test('SK-1/SK-2: App.js — the loading gate opens on Today\'s skeleton after a signed-in session, the spinner otherwise', () => {
  const app = read('App.js');
  assert.match(app, /import \{ bootView[^}]*\} from '\.\/lib\/todaySkeleton';/);
  assert.match(app, /import \{ loadTodayLayout, forgetTodayLayout \} from '\.\/lib\/todayLayoutStore';/);
  assert.match(app, /import \{ TodayOpening \} from '\.\/screens\/components\/TodaySkeleton';/);
  const boot = app.slice(app.indexOf('function BootScreen('), app.indexOf('\n}\n', app.indexOf('function BootScreen(')));
  assert.match(boot, /const view = bootView\(\{ lastUser, fontsLoaded, langReady, themeReady \}\);/);
  assert.match(boot, /if \(view === 'spinner'\) return <ThemedLoading \/>;/);
  assert.match(boot, /if \(view === 'today'\) return <BootTabs onTabTap=\{onTabTap\} \/>;/);
  // One app root: the language, theme and measured window are not re-created when the gate opens.
  const gate = app.slice(app.indexOf('const booting = '), app.indexOf('\n}\n', app.indexOf('const booting = ')));
  assert.match(gate, /\{booting \? \(\s*<BootScreen lastUser=\{bootUser\} fontsLoaded=\{fontsLoaded\} onTabTap=\{rememberBootTab\} \/>\s*\) : \(\s*<ThemedRoot/);
  // The mould is read at the start; a session that ends forgets it (the next cold start is signed out).
  assert.match(app, /loadTodayLayout\(\)\.then\(\(st\) => setBootUser\(lastSignedInUser\(st\)\)\)\.catch\(\(\) => setBootUser\(null\)\);/);
  assert.match(app, /useEffect\(\(\) => \{ if \(!booting && !session\) forgetTodayLayout\(\); \}, \[booting, session\]\);/);
  // onAuthStateChange stays synchronous: the forget is not inside it.
  const cb = app.slice(app.indexOf('supabase.auth.onAuthStateChange('), app.indexOf('// Sign in with Apple: if the user revokes'));
  assert.ok(!cb.includes('forgetTodayLayout'), 'nothing new inside onAuthStateChange');
  // The opening's tab bar is the real tab navigator with the same options; taps wait for the app.
  const tabs = app.slice(app.indexOf('function BootTabs('), app.indexOf('\n}\n', app.indexOf('function BootTabs(')));
  assert.match(tabs, /screenOptions=\{tabScreenOptions\(colors, insets\)\}/);
  assert.match(tabs, /tabPress: \(e\) => \{ e\.preventDefault\(\);/); // council (2): the tap is remembered (a135CouncilFixes)
  assert.match(tabs, /component=\{tab\.name === 'Today' \? TodayOpening : BootEmpty\}/);
  const main = app.slice(app.indexOf('function MainTabs('), app.indexOf('\n}\n', app.indexOf('function MainTabs(')));
  assert.match(main, /screenOptions=\{tabScreenOptions\(colors, insets\)\}/, 'the real tab bar uses the same options');
});

test('SK-1: the language and theme say when their stored choice was read (no English / wrong-theme first frame)', () => {
  const lang = read('i18n/LanguageContext.js');
  assert.match(lang, /const \[ready, setReady\] = useState\(false\);/);
  assert.match(lang, /\.finally\(\(\) => setReady\(true\)\)/);
  assert.match(lang, /value=\{\{ language, setLanguage, timeFormat, setTimeFormat, t, LANGUAGES, ready \}\}/);
  const theme = read('lib/theme.js');
  assert.match(theme, /const \[ready, setReady\] = useState\(false\);/);
  assert.match(theme, /\.finally\(\(\) => setReady\(true\)\)/);
  assert.match(theme, /value=\{\{ mode, setMode, colors, isDark, ready \}\}/);
});

test('SK-3/SK-7/SK-10: Today — no spinner; each block is its placeholder until its own data is in', () => {
  const today = read('screens/TodayScreen.js');
  assert.ok(!/ActivityIndicator/.test(today), 'no spinner left on Today');
  assert.ok(!today.includes('s.loadingBox'), 'the loading box is gone');
  assert.match(today, /import \{ SkeletonBlock, TODAY_HEADER \} from '\.\/components\/TodaySkeleton';/);
  assert.match(today, /const ready = sectionsReady\(reads, firstLoaded\);/);
  // Every first read marks its own part done (and the 4 s cap still ends the first load).
  const fr = today.slice(today.indexOf('const firstReads = ['), today.indexOf('];', today.indexOf('const firstReads = [')));
  for (const [call, key] of [['fetchProtocols()', 'protocols'], ['fetchTodayLogs()', 'todayLogs'], ['fetchPendingYesterday()', 'pending'], ['fetchStreakData()', 'streak'], ['fetchProtocolStreaks()', 'pStreaks'], ['fetchLastSites()', 'sites'], ['fetchAlerts()', 'alerts'], ['heroReadyRef.current.p', 'food']]) {
    assert.ok(fr.includes(`markRead(${call}, '${key}')`), `${call} marks ${key}`);
  }
  assert.match(today, /if \(!firstLoadedRef\.current\) whenAllSettled\(firstReads\)\.then\(\(\) => \{ firstLoadedRef\.current = true; setFirstLoaded\(true\); \}\);/);
  const left = today.slice(today.indexOf('const leftPage = ('), today.indexOf('\n  );\n', today.indexOf('const leftPage = (')));
  assert.ok(!left.includes('hiddenUntilLoaded}>\n\n        {focusCard'), 'the content is no longer hidden in one block');
  // In order: alerts, pending, ring, food, the empty state, doses — each placeholder before its block.
  const order = ["skel('alerts')", 'ready.alerts && alerts.length > 0', "skel('pending')", 'ready.pending && pendingYest.length > 0', "skel('tracker')", 'ready.tracker && protocols.length > 0', "skel('food')", '<FoodLogHero', "skel('empty')", 'ready.doses && protocols.length === 0 && !loading', "skel('doses')", 'ready.doses && protocols.length > 0'];
  let at = -1;
  for (const piece of order) { const i = left.indexOf(piece); assert.ok(i > at, `${piece} in order`); at = i; }
  // The food card is mounted (it reads its data) but hidden until its read is done.
  assert.match(left, /<View style=\{ready\.food \? null : s\.hiddenUntilLoaded\} onLayout=\{onBlock\('food'\)\}>/);
  // The placeholder of a block is drawn only while that block waits.
  assert.match(today, /const skel = \(key\) => \(ready\[SKEL_SECTION\[key\]\] \? null : <SkeletonBlock spec=\{plan\.find\(\(b\) => b\.key === key\)\} first=\{key === firstSkel\} \/>\);/);
  // One "Carregando" for the region: the first block still waiting says it.
  assert.match(today, /const firstSkel = \(plan\.find\(\(b\) => !ready\[SKEL_SECTION\[b\.key\]\]\) \|\| \{\}\)\.key;/);
});

test('SK-8: Today stores only the measured mould (heights and counts), per user and posture', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /import \{ cachedTodayLayout, saveTodayLayout, loadTodayLayout \} from '\.\.\/lib\/todayLayoutStore';/);
  const save = today.slice(today.indexOf('function saveMould()'), today.indexOf('\n  }\n', today.indexOf('function saveMould()')));
  assert.match(save, /const lay = layoutFromMeasure\(\{ present: presentRef\.current, heights: measureRef\.current\.heights, cards: cardHeights\(\) \}\);/);
  assert.match(save, /saveTodayLayout\(uid, book \? 'book' : 'single', lay\)/);
  // Only after the first screen is complete: never a half-loaded mould.
  assert.match(save, /if \(!firstLoadedRef\.current \|\| !uid\) return;/);
  const store = read('lib/todayLayoutStore.js');
  assert.match(store, /withLayout\(/, 'the store writes through the sanitizing rule');
  assert.match(store, /AsyncStorage\.setItem\(TODAY_LAYOUT_KEY, JSON\.stringify\(next\)\)/);
  assert.match(store, /export async function forgetTodayLayout\(\)/);
});

test('SK-4/SK-5/SK-6/SK-13: the placeholders — real card colours, bars in well / slabInv.line / line, no text, hidden from screen readers', () => {
  assert.ok(exists('screens/components/TodaySkeleton.js'));
  const src = read('screens/components/TodaySkeleton.js');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/.test(code), 'theme tokens only');
  for (const tok of ['c.raised', 'c.slab', 'c.well', 'c.slabInv.line', 'c.line']) assert.ok(code.includes(tok), tok);
  // No readable text in a placeholder: the only Text components are the opening's date and title.
  const texts = code.match(/<Text\b[^>]*>[^<]*<\/Text>/g) || [];
  assert.deepEqual(texts.map((x) => x.replace(/\s+/g, ' ')), ['<Text style={hs.date}>{date}</Text>', "<Text style={hs.title}>{t('tab_today')}</Text>"]);
  // Each block: the bars hidden, the region says "Carregando" once (the existing string ×6).
  assert.match(code, /accessibilityElementsHidden/);
  assert.match(code, /importantForAccessibility="no-hide-descendants"/);
  assert.match(code, /accessibilityLabel=\{first \? t\('loading'\) : undefined\}/);
  // The pulse: opacity only, one rule, still with Reduce Motion.
  assert.match(code, /useReducedMotion\(\)/);
  assert.match(code, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(code, /reduceMotionChanged/);
  assert.match(code, /shouldPulse\(\{ reduceMotion \}\)/);
  assert.match(code, /opacity: 0\.75 \+ 0\.25 \* Math\.cos\(2 \* Math\.PI \* p\.value\)/);
  assert.ok(!/transform|scale:|translate/.test(code.slice(code.indexOf('function usePulse'), code.indexOf('function usePulse') + 1500)), 'opacity only');
});

test('SK-2/SK-6: the existing "loading" string is used, present and natural in all 6 languages', () => {
  const tr = read('i18n/translations.js');
  const vals = [...tr.matchAll(/^    loading: '([^']+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(vals, ['Loading...', 'Cargando...', 'Carregando...', 'Chargement...', 'Wird geladen...', 'Caricamento...']);
});

test('SK-12: book — the opening shows the same skeleton in Today\'s column; the right page keeps the Dose log\'s own loading', () => {
  const src = read('screens/components/TodaySkeleton.js');
  const op = src.slice(src.indexOf('export function TodayOpening('), src.indexOf('\n}\n', src.indexOf('export function TodayOpening(')));
  assert.match(op, /book \? <BookPanes left=\{page\} right=\{<View \/>\} rightKey="log" \/> : page/);
  assert.match(op, /edges=\{TAB_SCREEN_EDGES\}/);
  assert.match(op, /contentContainerStyle=\{hs\.centered\}/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /return <LogScreen embedded refreshKey=\{logRev\} onChanged=\{afterLogChange\} popupGate=\{logPopupGate\} \/>;/, 'the Dose log page is unchanged');
  assert.match(read('screens/LogScreen.js'), /\{listState === 'loading' \? \(/);
});
