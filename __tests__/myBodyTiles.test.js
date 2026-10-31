'use strict';
// A-125 — My Body in Evolução's layout (docs/specs/my-body-tiles.md, founder-signed 2026-10-15).
// MB2-5 (the bug): one upload is one lab card. The grouping is a pure rule in lib/labReports.js,
// run here on the real shapes from the cloud (aggregate only, no values): the cloud stamps every
// row with its own created_at as the sync pushes it one row at a time, so a device that pulls
// an upload (a second phone, a reinstall, a re-sign-in) sees one created_at per value.
const test = require('node:test');
const assert = require('node:assert/strict');

// A cloud timestamp as Postgres sends it (microseconds, +00:00), `ms` after `base`.
const cloudStamp = (base, ms) => new Date(Date.parse(base) + ms).toISOString().replace('Z', '') + '417+00:00';

// One upload of `n` values on `date`, pushed row by row from `base` (every ~130 ms, like the
// 46 values of hello@ in 6 s); `repeat` markers appear twice in it.
function upload(date, base, n, { repeat = 0, step = 130, idFrom = 1, local = false } = {}) {
  const rows = [];
  const distinct = n - repeat;
  for (let i = 0; i < n; i++) {
    const m = i < distinct ? `Marker ${i + 1}` : `Marker ${i - distinct + 1}`; // the last `repeat` repeat the first ones
    rows.push({
      id: idFrom + i,
      report_date: date,
      created_at: local ? base : cloudStamp(base, i * step),
      marker: m,
      value: i + 1,
      unit: 'u',
    });
  }
  return rows;
}

test('MB2-5: appreview — 3 uploads of 19, 18 and 20 values (one created_at per value) are 3 cards', () => {
  const { reportCards } = require('../lib/labReports');
  const rows = [
    ...upload('2026-02-15', '2026-03-01T10:00:00.000Z', 19, { idFrom: 1, step: 40 }),
    ...upload('2026-04-15', '2026-05-02T09:30:00.000Z', 18, { idFrom: 100, step: 900 }),
    ...upload('2026-06-15', '2026-07-03T18:12:00.000Z', 20, { idFrom: 200, step: 250, repeat: 2 }),
  ];
  const cards = reportCards(rows);
  assert.equal(cards.length, 3, 'one card per upload');
  const byDate = Object.fromEntries(cards.map((c) => [c.date, c.markers.length]));
  assert.deepEqual(byDate, { '2026-02-15': 19, '2026-04-15': 18, '2026-06-15': 20 });
});

test('MB2-5: hello — 46 values of one upload within 6 s, 5 markers repeated, are ONE card', () => {
  const { reportCards } = require('../lib/labReports');
  const rows = upload('2026-02-26', '2026-07-25T14:03:11.000Z', 46, { repeat: 5 });
  assert.equal(new Set(rows.map((r) => r.created_at)).size, 46, 'fixture: 46 distinct created_at');
  assert.equal(new Set(rows.map((r) => r.marker)).size, 41, 'fixture: 41 distinct markers');
  const cards = reportCards(rows);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].markers.length, 46);
  // Delete (BodyScreen deleteReport) removes the card batch by batch: every created_at of the
  // card is a batch, so nothing of the upload is left behind.
  assert.deepEqual(new Set(cards[0].batches), new Set(rows.map((r) => r.created_at)));
  // The key is the first row's stamp, the same shape as before (labels and the right page keep working).
  assert.equal(cards[0].key, '2026-02-26|' + rows[0].created_at);
  // The rows arrive ordered by report_date DESC, marker ASC (lib/database getBiomarkers): order never matters.
  const shuffled = rows.slice().sort((a, b) => a.marker.localeCompare(b.marker));
  assert.equal(reportCards(shuffled).length, 1);
  assert.equal(reportCards(shuffled)[0].key, cards[0].key, 'the key does not depend on the row order');
});

test('MB2-5: two separate uploads on the same date, minutes apart, are 2 cards (a duplicate can be deleted alone)', () => {
  const { reportCards } = require('../lib/labReports');
  const first = upload('2026-09-20', '2026-09-21T08:00:00.000Z', 12);
  const again = upload('2026-09-20', '2026-09-21T08:04:30.000Z', 12, { idFrom: 50 }); // the same PDF again, 4.5 min later
  const cards = reportCards([...first, ...again]);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.markers.length), [12, 12]);
  assert.deepEqual(new Set(cards[1].batches), new Set(again.map((r) => r.created_at)), 'deleting the second card leaves the first');
});

test('MB2-5: on the device that scanned, one upload shares one created_at — one card; two such uploads never merge', () => {
  const { reportCards } = require('../lib/labReports');
  const a = upload('2026-10-01', '2026-10-01T10:00:00.000Z', 30, { local: true, repeat: 3 });
  const b = upload('2026-10-01', '2026-10-01T10:00:20.000Z', 8, { local: true, idFrom: 90 }); // a second scan 20 s later
  const cards = reportCards([...a, ...b]);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.markers.length), [30, 8]);
  assert.deepEqual(cards.map((c) => c.batches.length), [1, 1]);
});

test('MB2-5: a missing or unreadable created_at keeps today\'s key; other dates never mix', () => {
  const { reportCards, buildReport } = require('../lib/labReports');
  const rows = [
    { id: 1, report_date: '2026-01-01', created_at: null, marker: 'A' },
    { id: 2, report_date: '2026-01-01', created_at: null, marker: 'B' },
    { id: 3, report_date: '2026-01-02', created_at: '2026-01-02 08:00:00', marker: 'A' }, // SQLite datetime() shape
    { id: 4, report_date: '2026-01-02', created_at: '2026-01-02 08:00:01', marker: 'A' },
  ];
  const cards = reportCards(rows);
  assert.deepEqual(cards.map((c) => c.key).sort(), ['2026-01-01|', '2026-01-02|2026-01-02 08:00:00']);
  assert.deepEqual(buildReport(rows, '2026-01-02|2026-01-02 08:00:00').markers.map((m) => m.id), [3, 4]);
  assert.equal(buildReport(rows, 'nope'), null);
  assert.deepEqual(reportCards([]), []);
  assert.deepEqual(reportCards(null), []);
});

test('MB2-5: the journal order is date, then upload time — newest first or oldest first', () => {
  const { reportCards, orderCards } = require('../lib/labReports');
  const rows = [
    ...upload('2026-09-20', '2026-09-21T08:00:00.000Z', 3),
    ...upload('2026-09-20', '2026-09-22T09:00:00.000Z', 2, { idFrom: 10 }),
    ...upload('2026-07-01', '2026-07-02T10:00:00.000Z', 1, { idFrom: 20 }),
  ];
  const cards = reportCards(rows);
  assert.deepEqual(orderCards(cards, true).map((c) => [c.date, c.markers.length]), [['2026-09-20', 2], ['2026-09-20', 3], ['2026-07-01', 1]]);
  assert.deepEqual(orderCards(cards, false).map((c) => [c.date, c.markers.length]), [['2026-07-01', 1], ['2026-09-20', 3], ['2026-09-20', 2]]);
});

test('MB2-5: cloud and local timestamps are read the same on every engine', () => {
  const { stampMs } = require('../lib/labReports');
  assert.equal(stampMs('2026-07-25T14:03:11.123456+00:00'), Date.UTC(2026, 6, 25, 14, 3, 11, 123));
  assert.equal(stampMs('2026-07-25T14:03:11.123Z'), Date.UTC(2026, 6, 25, 14, 3, 11, 123));
  assert.equal(stampMs('2026-07-25T16:03:11+02:00'), Date.UTC(2026, 6, 25, 14, 3, 11));
  assert.equal(stampMs('2026-07-25 14:03:11'), Date.UTC(2026, 6, 25, 14, 3, 11), 'no zone = UTC (SQLite)');
  assert.ok(Number.isNaN(stampMs('')));
  assert.ok(Number.isNaN(stampMs(null)));
  assert.ok(Number.isNaN(stampMs('t1')));
});

// ── MB2-1 … MB2-4, MB2-6: the hub in Evolução's layout ─────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BODY = read('screens', 'BodyScreen.js');
const JOURNEY = read('screens', 'JourneyScreen.js');
const TILE_PATH = path.join(__dirname, '..', 'screens', 'components', 'DashTile.js');
const TILE = fs.existsSync(TILE_PATH) ? fs.readFileSync(TILE_PATH, 'utf8') : '';
const { translations } = require('../i18n/translations');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
function fnCode(src, name) {
  let hit = null;
  walk(ast(src), (n) => { if (!hit && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = src.slice(n.start, n.end); });
  assert.ok(hit, `function ${name} exists`);
  return hit;
}
// Every <Name …> element: its props as source text.
function elements(src, name) {
  const out = [];
  walk(ast(src), (n) => {
    if (n.type === 'JSXElement' && n.openingElement.name.name === name) {
      const props = {};
      for (const a of n.openingElement.attributes) {
        if (a.type !== 'JSXAttribute') continue;
        props[a.name.name] = a.value == null ? 'true' : a.value.type === 'StringLiteral' ? a.value.value : src.slice(a.value.expression.start, a.value.expression.end);
      }
      out.push({ props, code: src.slice(n.start, n.end) });
    }
  });
  return out;
}

test('MB2-1: Evolução\'s tile is one shared component; Journey renders the same two tiles with the same props', () => {
  assert.ok(TILE, 'screens/components/DashTile.js exists');
  const code = strip(TILE);
  // The tile as Journey drew it (radius 24, padding 16, gap 8), the icon 22 pt, chevron or tag at the top right.
  assert.match(code, /tile: \{ flex: 1, backgroundColor: c\.raised, borderRadius: 24, padding: 16, gap: 8, minWidth: 0 \}/);
  assert.match(code, /tileTop: \{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: -2 \}/);
  assert.match(code, /tileTitle: \{ fontSize: 17, fontWeight: '600', color: c\.ink \}/);
  assert.match(code, /big: \{ fontSize: 34, fontWeight: '500', color: c\.ink, letterSpacing: -1, fontVariant: \['tabular-nums'\] \}/);
  assert.match(code, /selected: \{ borderWidth: 2, borderColor: c\.ink, borderRadius: 24 \}/);
  assert.match(code, /<TouchableOpacity\s+style=\{s\.tile\}\s+activeOpacity=\{0\.75\}\s+onPress=\{onPress\}\s+accessibilityRole="button"\s+accessibilityState=\{book \? \{ selected: !!selected \} : undefined\}\s*>/);
  assert.match(code, /\{book && selected \? <View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, s\.selected\]\} \/> : null\}/);
  assert.match(code, /<FeatureIcon name=\{icon\} size=\{22\} color=\{iconColor \|\| colors\.ink2\} \/>/);
  assert.match(code, /\{tag \? <Text style=\{s\.tag\}>\{tag\}<\/Text> : <RowChevron color=\{colors\.tick\} \/>\}/);
  assert.match(code, /<Text style=\{s\.tileTitle\}>\{title\}<\/Text>/);
  // Journey: the same two tiles, same icons, titles, outline and Premium tag as before.
  const tiles = elements(JOURNEY, 'DashTile');
  assert.equal(tiles.length, 2);
  assert.deepEqual(
    (({ icon, iconColor, title, book, selected }) => ({ icon, iconColor, title, book, selected }))(tiles[0].props),
    { icon: 'calc_trend', iconColor: 'colors.ink2', title: "t('cal_snap_title')", book: 'book', selected: "page === 'progress'" },
  );
  assert.match(tiles[0].props.onPress, /book \? open\('progress'\) : navigation\.navigate\('Progress'\)/);
  assert.deepEqual(
    (({ icon, iconColor, title, book, selected, tag }) => ({ icon, iconColor, title, book, selected, tag }))(tiles[1].props),
    { icon: 'curve_loose', iconColor: 'colors.data', title: "t('body_card_dosing_title')", book: 'book', selected: "page === 'curve'", tag: "!premium ? t('paywall_premium') : null" },
  );
  // A-208: free → the animated preview first.
  assert.match(tiles[1].props.onPress, /if \(!premium\) \{ setPreviewKey\('serum'\); return; \}/);
  assert.doesNotMatch(strip(JOURNEY), /style=\{s\.tile\}|tileTop: \{/, 'Journey keeps no copy of the tile');
  assert.match(JOURNEY, /\.\.\.dashTileStyles\(c\)/, 'Journey\'s tile content uses the shared styles');
});

test('MB2-1: My Body is two tiles side by side (labs left, vaccines right), Dose accumulation full width, then the footnote — phone and Fold', () => {
  const items = fnCode(BODY, 'renderHubItems');
  assert.match(items, /<View style=\{\[s\.duo, fontScale >= 1\.3 && s\.duoStack\]\}>\s*\{renderLabTile\(\)\}\s*\{renderVaxTile\(\)\}\s*<\/View>\s*\{renderDoseCard\(inBook && rightPage\?\.type === 'curve'\)\}\s*<Text style=\{s\.hubFootnote\}>\{t\('body_hub_footnote'\)\}<\/Text>/);
  const lab = elements(fnCode(BODY, 'renderLabTile'), 'DashTile');
  const vax = elements(fnCode(BODY, 'renderVaxTile'), 'DashTile');
  assert.equal(lab.length, 1);
  assert.equal(vax.length, 1);
  assert.equal(lab[0].props.icon, 'lab_frame');
  assert.equal(lab[0].props.title, "t('body_card_labs_title')");
  assert.equal(vax[0].props.icon, 'syringe_tilt');
  assert.equal(vax[0].props.title, "t('body_card_vax_title')");
  // Phone: the hub; Fold: the same items on the left page.
  assert.match(BODY, /<View style=\{s\.hubBody\}>\s*\{renderHubItems\(false\)\}\s*<\/View>/);
  const left = fnCode(BODY, 'renderBookLeft');
  assert.match(left, /<View style=\{s\.bookHero\}>/);
  assert.match(left, /\{renderHubItems\(true\)\}/);
  assert.doesNotMatch(left, /renderJournalBody|VaccinesSection/, 'the journals no longer open on the left page');
  assert.match(BODY, /duo: \{ flexDirection: 'row', gap: 10, alignItems: 'stretch' \}/);
  assert.match(BODY, /duoStack: \{ flexDirection: 'column' \}/);
  // Rebuild = replace: the open hero cards are gone.
  assert.doesNotMatch(strip(BODY), /renderLabCard|renderVaxCard|labHubSummary|nextDueVaccine|body_starred_latest|body_next_due|s\.hero\b|countRow/);
});

test('MB2-2: the Labs tile shows the number of tests, the latest test\'s day and its markers', () => {
  const { reportCards, labTileSummary } = require('../lib/labReports');
  const rows = [
    ...upload('2026-02-15', '2026-03-01T10:00:00.000Z', 19, { idFrom: 1 }),
    ...upload('2026-06-15', '2026-07-03T18:12:00.000Z', 20, { idFrom: 200, repeat: 2 }),
    ...upload('2026-04-15', '2026-05-02T09:30:00.000Z', 18, { idFrom: 100 }),
  ];
  assert.deepEqual(labTileSummary(reportCards(rows)), { tests: 3, latestDate: '2026-06-15', latestMarkers: 18 }); // 20 values, 2 repeated → 18 distinct markers (picture A counts markers)
  assert.deepEqual(labTileSummary(reportCards(upload('2026-02-26', '2026-07-25T14:03:11.000Z', 46, { repeat: 5 }))), { tests: 1, latestDate: '2026-02-26', latestMarkers: 41 });
  assert.deepEqual(labTileSummary([]), { tests: 0, latestDate: null, latestMarkers: 0 });
  const code = fnCode(BODY, 'renderLabTile');
  assert.match(code, /\{labTile\.tests > 0 \? \(/);
  assert.match(code, /<Text style=\{s\.big\}>\{labTile\.tests\}<Text style=\{s\.unit\}> \{labTile\.tests === 1 \? t\('body_stat_test'\) : t\('body_stat_tests'\)\}<\/Text><\/Text>/);
  assert.match(code, /t\('body_tile_lab_latest'\)\.replace\('\{date\}', localeDate\(labTile\.latestDate, language, 'dayMonthAuto'\)\)/);
  assert.match(code, /\{labTile\.latestMarkers\} \{t\(pluralKey\('blood_markers', labTile\.latestMarkers, language\)\)\}/);
  assert.match(BODY, /const labTile = useMemo\(\(\) => labTileSummary\(cards\), \[cards\]\);/);
  // The same count the journal cards and Export use.
  assert.match(BODY, /const cards = useMemo\(\(\) => reportCards\(rows\), \[rows\]\);/);
  assert.match(BODY, /const testCount = cards\.length;/);
  // Only what the user stored: no value, no colour, no high/low.
  assert.doesNotMatch(code, /decimalText|\.value\b|colors\.(data|risk|attention)|range|high|low/i);
});

test('MB2-2: the Vaccines tile shows the number of vaccines and the latest one\'s name and date', () => {
  const { latestVaccine } = require('../lib/bodyHub');
  const list = [
    { id: 1, name: 'Hepatitis B', date_given: '2025-03-03', created_at: '2025-03-03T10:00:00Z' },
    { id: 2, name: 'Flu (Influenza)', date_given: '2026-04-12', created_at: '2026-04-12T10:00:00Z' },
    { id: 3, name: 'Tetanus', date_given: null, created_at: '2026-09-01T10:00:00Z' },
  ];
  assert.deepEqual(latestVaccine(list), { name: 'Flu (Influenza)', date: '2026-04-12' });
  assert.deepEqual(latestVaccine([...list, { id: 4, name: 'Hepatitis A', date_given: '2026-04-12', created_at: '2026-04-13T08:00:00Z' }]),
    { name: 'Hepatitis A', date: '2026-04-12' }, 'same day: the one added last');
  assert.deepEqual(latestVaccine([{ id: 3, name: 'Tetanus', date_given: '' }]), { name: 'Tetanus', date: null }, 'no date typed: the name only');
  assert.equal(latestVaccine([]), null);
  assert.equal(latestVaccine(null), null);
  const code = fnCode(BODY, 'renderVaxTile');
  assert.match(code, /const lastVax = latestVaccine\(vaccineList\);/);
  assert.match(code, /<Text style=\{s\.big\}>\{n\}<Text style=\{s\.unit\}> \{n === 1 \? t\('body_stat_vaccine'\) : t\('body_stat_vaccines'\)\}<\/Text><\/Text>/);
  assert.match(code, /<View style=\{\[s\.num, s\.numSep\]\}>\s*<Text style=\{s\.cap\}>\{t\('body_tile_vax_latest'\)\}<\/Text>\s*<Text style=\{s\.tileName\} numberOfLines=\{1\}>\{lastVax\.name\}<\/Text>/);
  assert.match(code, /localeDate\(lastVax\.date, language, 'dayMonthAuto'\)/);
  assert.doesNotMatch(code, /next_due|nextDue|colors\.(data|risk|attention)/, 'never a schedule');
});

test('MB2-2/MB2-3: the tile lines read as in the picture (pt, en) and naturally in es/fr/de/it', () => {
  const { formatDate } = require('../lib/localeFormat');
  const y = new Date().getFullYear();
  const day = `${y}-02-26`;
  const T = (l, k) => translations[l][k];
  assert.equal(T('pt', 'body_tile_lab_latest').replace('{date}', formatDate(day, 'pt', 'dayMonthAuto')), 'último em 26 de fev.');
  assert.equal(T('en', 'body_tile_lab_latest').replace('{date}', formatDate(day, 'en', 'dayMonthAuto')), 'latest Feb 26');
  assert.equal(T('pt', 'body_tile_vax_latest'), 'Última');
  assert.equal(T('en', 'body_tile_vax_latest'), 'Latest');
  for (const l of LANGS) {
    assert.ok(T(l, 'body_tile_lab_latest').includes('{date}'), `${l} keeps {date}`);
    assert.ok(T(l, 'body_tile_vax_latest').length > 0, l);
    if (l !== 'en') assert.notEqual(T(l, 'body_tile_lab_latest'), T('en', 'body_tile_lab_latest'), `${l} is translated`);
  }
  // Empty tiles: "Nada registrado ainda" and the journal's own description.
  assert.equal(T('pt', 'body_stat_none'), 'Nada registrado ainda');
  for (const [f, desc] of [['renderLabTile', 'body_card_labs_desc'], ['renderVaxTile', 'body_card_vax_desc']]) {
    const code = fnCode(BODY, f);
    assert.match(code, new RegExp(`renderEmptyTile\\('${desc}'\\)`), `${f}: empty state`);
  }
  assert.match(fnCode(BODY, 'renderEmptyTile'), /<Text style=\{\[s\.desc, s\.descInk\]\}>\{t\('body_stat_none'\)\}<\/Text>\s*<Text style=\{s\.desc\}>\{t\(descKey\)\}<\/Text>/);
  // The retired hub lines left all six languages.
  for (const l of LANGS) for (const k of ['body_starred_latest', 'body_next_due']) assert.equal(T(l, k), undefined, `${l}.${k} removed`);
});

// Runs openSection as written, with the screen's state passed in.
function runOpen(key, book) {
  const calls = [];
  const fn = new Function('Analytics', 'book', 'select', 'setSection', `${fnCode(BODY, 'openSection')}\nreturn openSection;`)(
    { viewed: () => {} }, book, (v) => calls.push(['select', v]), (v) => calls.push(['section', v]),
  );
  fn(key);
  return calls;
}
const pureBook = new Function(
  ['bodyRightPage', 'bodyFoldPlan', 'bodyUnfoldSel'].map((f) => fnCode(BODY, f)).join('\n') + '\nreturn { bodyRightPage, bodyFoldPlan, bodyUnfoldSel };',
)();

test('MB2-4: a tile opens its journal — phone: the journal screen as today; Fold: the right page', () => {
  assert.deepEqual(runOpen('labs', false), [['section', 'labs']]);
  assert.deepEqual(runOpen('vaccines', false), [['section', 'vaccines']]);
  assert.deepEqual(runOpen('labs', true), [['select', 'labs']]);
  assert.deepEqual(runOpen('vaccines', true), [['select', 'vaccines']]);
  assert.match(fnCode(BODY, 'renderLabTile'), /onPress=\{\(\) => openSection\('labs'\)\}/);
  assert.match(fnCode(BODY, 'renderVaxTile'), /onPress=\{\(\) => openSection\('vaccines'\)\}/);
});

test('MB2-4: on the Fold the right page defaults to the lab journal (never blank); the open tile has the outline', () => {
  const { defaultSelection } = require('../lib/bookLayout');
  assert.equal(defaultSelection('Body', {}), 'labs');
  assert.match(BODY, /useBookSelection\('Body', defaultSelection\('Body'\)\)/);
  const page = (sel, premium = true) => pureBook.bodyRightPage({ sel, reportKeys: new Set(['d|1']), markerKeys: new Set(['hct']), vaxKeys: new Set(['7']), premium });
  assert.deepEqual(page(null), { type: 'labs', id: 'labs', group: 'labs' });
  assert.deepEqual(page('labs'), { type: 'labs', id: 'labs', group: 'labs' });
  assert.deepEqual(page('vaccines'), { type: 'vaccines', id: 'vaccines', group: 'vaccines' });
  assert.deepEqual(page('d|1'), { type: 'report', key: 'd|1', id: 'd|1', group: 'labs' });
  assert.deepEqual(page('marker:hct'), { type: 'marker', key: 'hct', id: 'marker:hct', group: 'labs' });
  assert.deepEqual(page('vax:7'), { type: 'vaccine', key: '7', id: 'vax:7', group: 'vaccines' });
  assert.deepEqual(page('vax:99'), { type: 'vaccines', id: 'vaccines', group: 'vaccines' }, 'a deleted vaccine: its journal');
  assert.deepEqual(page('d|gone'), { type: 'labs', id: 'labs', group: 'labs' }, 'a deleted test: the lab journal');
  assert.deepEqual(page('curve'), { type: 'curve', id: 'curve', group: 'curve' });
  assert.deepEqual(page('curve', false), { type: 'labs', id: 'labs', group: 'labs' }, 'never the Curve page for a free user');
  // The outline: the tile whose journal is open, Dose accumulation when the Curve is open.
  const lab = elements(fnCode(BODY, 'renderLabTile'), 'DashTile')[0].props;
  const vax = elements(fnCode(BODY, 'renderVaxTile'), 'DashTile')[0].props;
  assert.equal(lab.book, 'book');
  assert.equal(lab.selected, "rightPage?.group === 'labs'");
  assert.equal(vax.book, 'book');
  assert.equal(vax.selected, "rightPage?.group === 'vaccines'");
  assert.match(fnCode(BODY, 'renderDoseCard'), /selected && s\.selCard/);
});

test('MB2-4: the right page shows the journal, then a test, marker or vaccine with "‹ back" to its journal; the Curve for Premium', () => {
  const right = fnCode(BODY, 'renderBookRight');
  assert.match(right, /if \(rightPage\.type === 'curve'\) return <SerumCurveScreen embedded \/>;/);
  assert.match(right, /<VaccinesSection\s+draftRef=\{vaxDraft\}\s+onSheetChange=\{setVaxSheetOpen\}\s+onSelect=\{selectVaccine\}\s+onListChange=\{onVaxList\}\s+controlRef=\{vaxControl\}\s+\/>/);
  assert.match(right, /\{renderPageBack\(t\('body_card_vax_title'\), \(\) => select\('vaccines'\)\)\}\s*<VaccinePage vaccine=\{bookVaccine\} onEdit=\{\(\) => editVaccine\(bookVaccine\)\} \/>/);
  assert.match(right, /\{renderPageBack\(t\('body_card_labs_title'\), \(\) => select\('labs'\)\)\}\s*\{renderReportDetail\(bookReport, true\)\}/);
  assert.match(right, /\{renderPageBack\(t\('body_card_labs_title'\), \(\) => select\('labs'\)\)\}\s*\{renderMarkerDetail\(bookMarker, bookChartWidth, true\)\}/);
  assert.match(right, /return renderBookJournal\(\);/);
  // While the read page covers the vaccine list, the list is hidden from the screen reader; the
  // list stays mounted so Edit opens its sheet.
  assert.match(right, /accessibilityElementsHidden=\{!!bookVaccine\}/);
  assert.match(right, /importantForAccessibility=\{bookVaccine \? 'no-hide-descendants' : 'auto'\}/);
  // The lab journal on the right page: title (a header), + Upload, Export, then the journal; a test or marker opens in place.
  const journal = fnCode(BODY, 'renderBookJournal');
  assert.match(journal, /<Text style=\{s\.screenTitle\} accessibilityRole="header">\{t\('body_card_labs_title'\)\}<\/Text>/);
  assert.match(journal, /onPress=\{handleUploadPress\}/);
  assert.match(journal, /\{canExportLabs && renderExportButton\(\)\}/);
  assert.match(journal, /\{renderJournalBody\(true\)\}/);
  const body = fnCode(BODY, 'renderJournalBody');
  assert.match(body, /onPress=\{\(\) => \(inBook \? selectReport\(key\) : openReport\(key\)\)\}/);
  assert.match(body, /onPress=\{\(\) => \(inBook \? selectMarker\(mk\.key\) : openMarker\(mk\.key\)\)\}/);
  assert.match(BODY, /function selectReport\(key\) \{ if \(key !== rightPage\?\.id\) setTagDraft\(''\); select\(key\); \}/, 'a new test starts with an empty label field');
  assert.match(BODY, /function selectMarker\(key\) \{ select\('marker:' \+ key\); \}/);
  assert.match(body, /\{rows\.length === 0 && !loading && \(\s*<>\s*<View style=\{\[s\.card, s\.emptyCard\]\}>[\s\S]*?\{renderTips\(\)\}/, 'the tips show under the empty journal on both layouts');
  // The pane is keyed per page, but the vaccine journal and its read page share one key (the
  // list and its sheet stay mounted).
  assert.match(BODY, /rightKey=\{rightPage\.group === 'vaccines' \? 'vaccines' : rightPage\.id\}/);
});

test('MB2-4: folding keeps what was open (journal, test, marker, vaccine journal); unfolding opens it on the right page', () => {
  const fold = pureBook.bodyFoldPlan;
  assert.deepEqual(fold({ sel: 'labs', explicit: true }), { section: 'labs', detail: null });
  assert.deepEqual(fold({ sel: 'vaccines', explicit: true }), { section: 'vaccines', detail: null });
  assert.deepEqual(fold({ sel: 'vax:7', explicit: true }), { section: 'vaccines', detail: null });
  assert.deepEqual(fold({ sel: 'd|1', explicit: true }), { section: 'labs', detail: { type: 'report', key: 'd|1' } });
  assert.deepEqual(fold({ sel: 'marker:hct', explicit: true }), { section: 'labs', detail: { type: 'marker', key: 'hct' } });
  assert.deepEqual(fold({ sel: 'curve', explicit: true }), { section: null, detail: null, push: 'SerumCurve' });
  assert.equal(fold({ sel: 'labs', explicit: false }), null, 'the default nobody chose: the phone hub stays');
  assert.deepEqual(fold({ sel: 'curve', explicit: true, vaxSheetOpen: true }), { section: 'vaccines', detail: null }, 'an open vaccine sheet wins');
  const unfold = pureBook.bodyUnfoldSel;
  assert.equal(unfold({ section: 'labs', detail: null }), 'labs');
  assert.equal(unfold({ section: 'vaccines', detail: null }), 'vaccines');
  assert.equal(unfold({ section: 'labs', detail: { type: 'report', key: 'd|1' } }), 'd|1');
  assert.equal(unfold({ section: 'labs', detail: { type: 'marker', key: 'hct' } }), 'marker:hct');
  assert.equal(unfold({ section: null, detail: null }), null, 'the hub: the default page');
  for (const st of [{ section: 'labs', detail: null }, { section: 'vaccines', detail: null }, { section: 'labs', detail: { type: 'marker', key: 'hct' } }]) {
    assert.deepEqual(fold({ sel: unfold(st), explicit: true }), st, 'round trip');
  }
  // A deep link (Today's bloodwork alert) opens the lab journal on the Fold too.
  assert.match(BODY, /setSection\(target\);\s*setDetail\(null\);\s*if \(book\) select\(target\);/);
});

test('MB2-6: Premium gating unchanged — the tiles are not charts; theme tokens only; no emoji', () => {
  for (const f of ['renderLabTile', 'renderVaxTile', 'renderEmptyTile']) {
    assert.doesNotMatch(fnCode(BODY, f), /premium|Paywall|hasPremium/i, `${f}: not gated`);
  }
  const dose = fnCode(BODY, 'renderDoseCard');
  assert.match(dose, /\{premium \? \(\s*<Chevron color=\{colors\.tick\} \/>/, 'Dose accumulation keeps its Premium tag and lock');
  assert.match(fnCode(BODY, 'openDoseAccumulation'), /setPreviewKey\('serum'\);/); // A-208
  for (const [name, src] of [['BodyScreen', BODY], ['DashTile', TILE], ['JourneyScreen', JOURNEY], ['labReports', read('lib', 'labReports.js')]]) {
    const code = strip(src);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, `${name}: theme tokens only`);
    assert.doesNotMatch(code, /\p{Extended_Pictographic}/u, `${name}: no emoji`);
  }
  assert.match(BODY, /tileName: \{ fontSize: 15, lineHeight: 20, color: c\.ink \}/);
  assert.match(BODY, /descInk: \{ color: c\.ink \}/);
});

test('MB2-2: "{n} marcadores" counts distinct markers (picture A: 41 for 46 values with 5 repeated), on the tile and the journal cards', () => {
  const { reportCards, markerCount } = require('../lib/labReports');
  const card = reportCards(upload('2026-02-26', '2026-07-25T14:03:11.000Z', 46, { repeat: 5 }))[0];
  assert.equal(markerCount(card.markers), 41);
  const body = require('fs').readFileSync(require('path').join(__dirname, '..', 'screens', 'BodyScreen.js'), 'utf8');
  assert.doesNotMatch(body, /\{(?:card|reportDetail|labTile)?\.?markers\.length\} \{t\(pluralKey\('blood_markers'/, 'no screen shows the raw value count as markers');
});
