'use strict';
// My Body — the Graduated redesign (docs/specs/my-body.md, founder 2026-10-03: "siga as
// recomendações no My Body"). The rules are pure functions in lib/bodyHub.js, lib/bodyScan.js
// and lib/bodyDates.js; the screens are checked on their parsed source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BODY = read('screens', 'BodyScreen.js');
const VAX = read('screens', 'components', 'VaccinesSection.js');
const SHEETS = read('screens', 'components', 'BodySheets.js');
const { translations } = require('../i18n/translations');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const EN = translations.en;
const t = (k) => (k in EN ? EN[k] : k);
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
function fnCode(src, name) {
  let hit = null;
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }), (n) => {
    if (!hit && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = src.slice(n.start, n.end);
  });
  assert.ok(hit, `function ${name} exists`);
  return hit;
}
const styleOf = (src, name) => {
  const m = src.match(new RegExp(`\\n\\s+${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name}`);
  return m[1];
};

// ── Part 1: the hub ─────────────────────────────────────────────────────────────────────────

test('MB-1: the hub is three hero cards in order — Lab test journal, Vaccine journal, Dose accumulation — then a left-aligned footnote', () => {
  const hub = BODY.slice(BODY.indexOf('<View style={s.hubBody}>'), BODY.indexOf('<Text style={s.hubFootnote}>', BODY.indexOf('<View style={s.hubBody}>')));
  const order = ['{renderLabCard()}', '{renderVaxCard()}', '{renderDoseCard(false)}'].map((x) => hub.indexOf(x));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'Lab, Vaccine, Dose in order');
  const hero = styleOf(BODY, 'hero');
  assert.match(hero, /borderRadius: 26/);
  assert.match(hero, /padding: 20/);
  assert.match(styleOf(BODY, 'heroTop'), /flexDirection: 'row'/);
  for (const f of ['renderLabCard', 'renderVaxCard']) {
    const code = fnCode(BODY, f);
    assert.match(code, /size=\{24\}/, `${f}: 24-pt icon beside the title`);
    assert.match(code, /<Chevron color=\{colors\.tick\} \/>/, `${f}: chevron at the top right`);
    assert.ok(code.indexOf('_desc\')}') > code.indexOf('countRow'), `${f}: the description comes last`);
  }
  const foot = styleOf(BODY, 'hubFootnote');
  assert.doesNotMatch(foot, /textAlign: 'center'/, 'left-aligned (prototype B6)');
  assert.match(foot, /color: c\.ink2/);
  assert.doesNotMatch(BODY, /hubBadge|hubCardStat|LabsGlyph|VaccinesGlyph|AccumGlyph/, 'the old row cards and glyphs are gone');
});

test('MB-2: the Lab card counts uploads in a big light number, lists the starred markers\' latest values and names the latest test', () => {
  const { labHubSummary } = require('../lib/bodyHub');
  const rows = [
    { report_date: '2026-05-12', created_at: 'a', marker: 'Hematocrit', value: 44.1, unit: '%' },
    { report_date: '2026-08-20', created_at: 'b', marker: 'Hematocrit', value: 47.6, unit: '%' },
    { report_date: '2026-08-20', created_at: 'b', marker: 'Total Testosterone', value: 986, unit: 'ng/dL' },
    { report_date: '2026-05-12', created_at: 'a', marker: 'Total testosterone', value: 512, unit: 'ng/dL' },
    { report_date: '2026-08-20', created_at: 'b', marker: 'Glucose', value: 91, unit: 'mg/dL' },
  ];
  const sum = labHubSummary(rows, ['Total testosterone', 'Hematocrit']);
  assert.equal(sum.tests, 2, 'one per upload');
  assert.equal(sum.latestDate, '2026-08-20');
  assert.deepEqual(sum.starred.map((m) => [m.marker, m.value, m.unit]), [['Hematocrit', 47.6, '%'], ['Total Testosterone', 986, 'ng/dL']],
    'each starred marker\'s latest reading (naming variants merged), A–Z');
  assert.deepEqual(labHubSummary(rows, []).starred, [], 'nothing starred: no rows');
  assert.deepEqual(labHubSummary([], ['x']), { tests: 0, starred: [], latestDate: null });

  const count = styleOf(BODY, 'count');
  assert.match(count, /fontSize: 56/);
  assert.match(count, /fontWeight: '300'/);
  const card = fnCode(BODY, 'renderLabCard');
  assert.match(card, /t\('body_starred_latest'\)\.replace\('\{date\}', localeDate\(labHub\.latestDate, language, 'dayMonthAuto'\)\)/);
  assert.match(card, /<StarGlyph color=\{colors\.ink2\} size=\{16\} \/>/);
  assert.match(card, /<Text style=\{s\.bodyMuted\}>\{t\('body_stat_none'\)\}<\/Text>/, '"Nothing logged yet" in regular ink2');
  assert.doesNotMatch(styleOf(BODY, 'bodyMuted'), /fontWeight/);
});

test('MB-3: the Vaccine card shows the nearest next-due date the user typed (today or later), never a past one', () => {
  const { nextDueVaccine } = require('../lib/bodyHub');
  const list = [
    { name: 'Td', next_due: '2029-03-14' },
    { name: 'Influenza (flu)', next_due: '2026-10-05' },
    { name: 'Hep A', next_due: '2026-09-01' }, // already past
    { name: 'COVID-19', next_due: null },
  ];
  assert.deepEqual(nextDueVaccine(list, '2026-10-03'), { name: 'Influenza (flu)', due: '2026-10-05' });
  assert.deepEqual(nextDueVaccine(list, '2026-10-05'), { name: 'Influenza (flu)', due: '2026-10-05' }, 'today counts');
  assert.equal(nextDueVaccine([{ name: 'Hep A', next_due: '2026-09-01' }], '2026-10-03'), null);
  assert.equal(nextDueVaccine([], '2026-10-03'), null);
  const card = fnCode(BODY, 'renderVaxCard');
  assert.match(card, /t\('body_next_due'\)\.replace\('\{name\}', nextDue\.name\)\.replace\('\{date\}', localeDate\(nextDue\.due, language, 'dayMonthAuto'\)\)/);
  assert.match(card, /<FeatureIcon name="calendar" size=\{16\} color=\{colors\.ink2\} \/>/);
  assert.match(BODY, /const nextDue = nextDueVaccine\(vaccineList, todayLocal\(\)\);/);
});

test('MB-4: Dose accumulation shows the Curve\'s compound and Est. level for Premium (remembered view, palette B); free shows Premium + lock, no number', () => {
  const fetch = fnCode(BODY, 'fetchReports');
  assert.match(fetch, /const savedView = await loadCurveView\(user\.id\);/);
  assert.match(fetch, /setLevel\(defaultCurveLevel\(getActiveProtocols\(user\.id\), Date\.now\(\), undefined, savedView\)\);/);
  assert.match(fetch, /if \(!pro\) \{ setLevel\(null\); return; \}/);
  const card = fnCode(BODY, 'renderDoseCard');
  assert.match(card, /\{premium && level \? \(/);
  assert.match(card, /displayColor\(level\.protocol\.color\) \|\| colors\.data/);
  assert.match(card, /t\('curve_current_level'\)/);
  assert.match(card, /levelLabel\(level\.value, language\)/);
  assert.match(card, /<View style=\{s\.otag\}><Text style=\{s\.otagText\}>\{t\('paywall_premium'\)\}<\/Text><\/View>\s*<FeatureIcon name="lock" size=\{18\} color=\{colors\.ink3\} \/>/);
  const lv = styleOf(BODY, 'level');
  assert.match(lv, /fontSize: 34/);
  assert.match(lv, /fontWeight: '300'/);
  assert.match(lv, /color: c\.data/);
  assert.match(styleOf(BODY, 'levelRow'), /borderTopWidth: 1/);
  // the same number Journey shows: the same lib call with the same remembered view
  assert.match(read('screens', 'JourneyScreen.js'), /defaultCurveLevel\(getActiveProtocols\(user\.id\), Date\.now\(\), undefined, savedView\)/);
});

test('MB-5: the prototype icons — lab frame with a drop, the syringe tilted −45°, the loose curve in data blue — from the monoline set', () => {
  const data = read('components', 'featureIconsData.js');
  for (const n of ['lab_frame', 'syringe_tilt']) {
    assert.match(data, new RegExp(`\\n  ${n}: \``), `${n} glyph`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'feature-icons', `${n}.svg`)), `${n}.svg in the set`);
  }
  assert.match(data.match(/syringe_tilt: `([\s\S]*?)`/)[1], /rotate\(-45 512 512\)/);
  assert.match(fnCode(BODY, 'renderLabCard'), /<FeatureIcon name="lab_frame" size=\{24\}/);
  assert.match(fnCode(BODY, 'renderVaxCard'), /<FeatureIcon name="syringe_tilt" size=\{24\}/);
  assert.match(fnCode(BODY, 'renderDoseCard'), /<FeatureIcon name="curve_loose" size=\{22\} color=\{colors\.data\} \/>/);
  assert.match(VAX, /<FeatureIcon name="syringe_tilt" size=\{44\} color=\{colors\.ink3\} \/>/, 'the empty Vaccine journal');
  assert.match(VAX, /<FeatureIcon name="lab_frame" size=\{18\} color=\{colors\.ink\} \/>/, 'Scan / upload');
  for (const src of [BODY, VAX]) assert.doesNotMatch(strip(src), /\p{Extended_Pictographic}/u, 'no emoji');
});

test('MB-6: the free Dose accumulation preview is the shared bottom sheet (Example curve, Unlock with Premium → Paywall)', () => {
  assert.match(BODY, /<FeaturePreviewSheet\s+featureKey=\{showSerumPreview \? 'serum' : null\}/);
  assert.match(BODY, /navigation\.navigate\('Paywall', \{ source: 'serum_preview_sheet' \}\)/);
  assert.doesNotMatch(BODY, /AccumulationHero|paywall_hero_example|serum_preview_title/, 'the old full-height page is gone');
  assert.match(read('components', 'FeaturePreviews.js'), /\{ key: 'serum', icon: 'curve', titleKey: 'serum_preview_title', bodyKey: 'serum_preview_body', hero: true \}/);
});

// ── Parts 3–9: the Lab test journal and its popups ─────────────────────────────────────────

test('MB-7: one "Reading your lab report..." card with one indicator while a report is read', () => {
  const journal = fnCode(BODY, 'renderJournalBody');
  assert.equal((journal.match(/<ActivityIndicator/g) || []).length, 1);
  assert.match(journal, /\{uploading && \(\s*<View style=\{\[s\.card, s\.rowCard\]\}>\s*<ActivityIndicator/);
  assert.match(BODY, /<SegmentedBar\s+items=\{\[\{ key: 'date', label: t\('blood_view_by_date'\) \}, \{ key: 'marker', label: t\('blood_view_by_marker'\) \}\]\}/);
});

test('MB-9: Export shows only when there is something to export', () => {
  const { exportVisible } = require('../lib/bodyHub');
  assert.equal(exportVisible('labs', { tests: 0, vaccines: 0 }), false, 'empty: hidden');
  assert.equal(exportVisible('labs', { tests: 0, vaccines: 2 }), true, 'labs: vaccines can be exported');
  assert.equal(exportVisible('labs', { tests: 3, vaccines: 0 }), true);
  assert.equal(exportVisible('vaccines', { tests: 3, vaccines: 0 }), false, 'Vaccine journal: only with vaccines (prototype)');
  assert.equal(exportVisible('vaccines', { tests: 0, vaccines: 1 }), true);
  assert.match(BODY, /\{!detail && \(\(section === 'labs' && canExportLabs\) \|\| \(section === 'vaccines' && canExportVax\)\) && renderExportButton\(\)\}/);
  assert.match(fnCode(BODY, 'renderBookLeft'), /\{canExportLabs && \(/);
});

test('MB-10 / MB-11: the S-24 copy — the free budget is 3 a month, the Premium lines carry no number', () => {
  for (const l of LANGS) {
    const tr = translations[l];
    assert.match(tr.blood_empty_sub, /3/, `${l} blood_empty_sub names the 3 free scans`);
    assert.match(tr.blood_first_free, /3/, `${l} blood_first_free`);
    for (const k of ['blood_premium_markers', 'blood_upgrade_title', 'blood_upgrade_sub', 'blood_upgrade_feat_1']) {
      assert.doesNotMatch(tr[k].replace('{n}', ''), /\d/, `${l} ${k}: no number in a Premium line`);
      assert.doesNotMatch(tr[k], /unlimited|ilimitad|illimit|unbegrenzt/i, `${l} ${k}`);
    }
  }
  assert.match(BODY, /<BottomSheet visible=\{showUpgradeModal\} onClose=\{\(\) => setShowUpgradeModal\(false\)\}>\s*<CloseBar title=\{t\('blood_upload_modal_title'\)\}/);
});

test('MB-12: permission, source and result are DoseTrace sheets (one shared consent key)', () => {
  const choose = fnCode(BODY, 'chooseSource');
  assert.match(choose, /if \(!\(await hasAIConsent\(\)\)\)/);
  assert.match(choose, /icon: 'ai_spark'/);
  assert.match(choose, /link: \{ label: t\('ai_consent_privacy'\), onPress: \(\) => Linking\.openURL\(AI_PRIVACY_URL\)/);
  assert.match(choose, /\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('ai_consent_agree'\), kind: 'primary', onPress: async \(\) => \{ await grantAIConsent\(\); openSourceChoice\(\); \} \}/);
  const src = fnCode(BODY, 'openSourceChoice');
  assert.match(src, /heading: t\('blood_upload_choose_title'\)/);
  assert.match(src, /title: t\('blood_upload_choose_sub'\)/);
  assert.match(BODY, /<DTActionSheet config=\{sourceChoice\} onClose=\{\(\) => setSourceChoice\(null\)\} \/>/);
  assert.match(fnCode(BODY, 'extractWithClaude'), /notice\(\{ icon: null, title: t\('blood_imported_title'\), body: lines\.join\('\\n\\n'\) \}\);/);
  // the bold first line of the action sheet (shared component, optional)
  assert.match(read('screens', 'components', 'ProtocolParts.js'), /\{shown\.heading \? \(/);
});

test('MB-13: every scan error is a DoseTrace sheet; the service error never says "enter values manually"; the limit is the server\'s', () => {
  const { scanErrorKind, scanErrorSheet } = require('../lib/bodyScan');
  assert.equal(scanErrorKind({ code: 'quota_exceeded', status: 429 }), 'quota');
  assert.equal(scanErrorKind({ status: 429 }), 'quota');
  assert.equal(scanErrorKind({ status: 401 }), 'signin');
  assert.equal(scanErrorKind({ status: 413 }), 'big');
  assert.equal(scanErrorKind({ code: 'provider_error', status: 500 }), 'service');
  assert.equal(scanErrorKind({ code: null, status: 503 }), 'service');
  assert.equal(scanErrorKind({ code: 'no_markers', status: 422 }), 'unread', 'a real unreadable file');
  assert.deepEqual(scanErrorSheet('service', t), {
    title: 'Scan service unavailable',
    body: 'The lab-reading service is temporarily unavailable. Your file is fine — please try again in a little while.',
  });
  assert.equal(scanErrorSheet('quota', t, { errBody: { limit: 20 } }).body, "You've used your 20 scans for this month (labs, vaccine cards, and vials combined). You can still enter everything by hand.");
  assert.equal(scanErrorSheet('unread', t).title, 'Extraction failed');
  assert.equal(scanErrorSheet('unread', t, { what: 'vaccine' }).title, "Couldn't read that");
  for (const l of LANGS) {
    assert.doesNotMatch(translations[l].blood_error_service_sub, /manual|manualmente|manuellement|von Hand|à la main|a mano/i, `${l}: no "enter values manually"`);
  }
  const notice = fnCode(BODY, 'notice');
  assert.match(notice, /buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/);
});

test('MB-25: no native alert is left in My Body — DoseTrace sheets only', () => {
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX]]) {
    const code = strip(src);
    assert.doesNotMatch(code, /\bAlert\b/, `${name}: no Alert`);
    assert.doesNotMatch(code, /requestAIConsent/, `${name}: the consent is asked in a DoseTrace sheet`);
  }
});

// ── Parts 10–15: test, marker, edit value, export ─────────────────────────────────────────

test('MB-15: deleting a blood test asks first in a DoseTrace sheet, and only Delete removes that upload', () => {
  const code = fnCode(BODY, 'deleteReport');
  assert.match(code, /setSheet\(\{\s*title: t\('blood_report_delete'\),/);
  assert.match(code, /\{ label: t\('cancel'\), kind: 'secondary' \},/);
  assert.match(code, /label: t\('blood_report_delete_confirm'\),\s*kind: 'danger',/);
  assert.ok(code.indexOf('deleteBiomarkerReport(') > code.indexOf("kind: 'danger'"), 'the delete runs only from the Delete button');
});

test('MB-16: the marker card reads "Latest · {date}" over a light 56-pt number with the unit attached', () => {
  const code = fnCode(BODY, 'renderMarkerDetail');
  assert.match(code, /t\('blood_latest_on'\)\.replace\('\{date\}', formatDate\(markerDetail\.latest\.date\)\)/);
  assert.match(code, /<Text style=\{s\.display\}>/);
  assert.match(code, /<Text style=\{s\.unitAfter\}>\{markerDetail\.unit\}<\/Text>/);
  const d = styleOf(BODY, 'display');
  assert.match(d, /fontSize: 56/);
  assert.match(d, /fontWeight: '300'/);
  assert.match(styleOf(BODY, 'unitAfter'), /fontFamily: MONO\['400'\], fontSize: 13, color: c\.ink3, marginLeft: 3/);
  assert.equal(t('blood_latest_on').replace('{date}', 'August 20, 2026'), 'Latest · August 20, 2026');
});

test('MB-17: Edit value is a bottom sheet; Test date opens its own wheel sheet that never reaches a future day', () => {
  assert.match(BODY, /<BottomSheet visible=\{!!mEdit\} onClose=\{closeMarkerEdit\}>\s*<SheetBar title=\{t\('blood_edit_title'\)\} cancelLabel=\{t\('cancel'\)\} onCancel=\{closeMarkerEdit\} actionLabel=\{t\('save'\)\} onAction=\{saveMarkerEdit\} \/>/);
  assert.match(BODY, /<DTPickerSheet visible=\{!!mEdit && mDateWheel\} title=\{t\('blood_edit_date'\)\} doneLabel=\{t\('done'\)\}/);
  assert.match(BODY, /wheelAfter\(mDate \|\| today, new Date\(\), col, i, \{ \.\.\.TEST_DATE_RANGE, max: today \}\)/);
  assert.doesNotMatch(BODY, /DateTimePicker/, 'no inline iOS spinner');
  const save = fnCode(BODY, 'saveMarkerEdit');
  assert.match(save, /const value = parseMeasure\(mValue, language\);/);
  assert.match(save, /setValueSheet\(\{ icon: 'warning', title: t\('error'\), body: t\('blood_edit_invalid'\)/);
  const { wheelAfter, wheelColumns } = require('../lib/bodyDates');
  const now = new Date(2026, 9, 3, 12);
  assert.equal(wheelAfter('2026-10-01', now, 1, 29, { back: 30, ahead: 0, max: '2026-10-03' }), '2026-10-03', 'Oct 30 → today');
  assert.equal(wheelAfter('2026-03-31', now, 0, 1, { back: 30, ahead: 0 }), '2026-02-28', 'Mar 31 → Feb 28');
  const years = wheelColumns('2026-08-20', now, Array(12).fill('m'), { back: 30, ahead: 0 })[2].values;
  assert.equal(years[0], '1996');
  assert.equal(years[years.length - 1], '2026', 'no future year on a lab test');
  const due = wheelColumns('2026-10-03', now, Array(12).fill('m'), { back: 10, ahead: 15 })[2].values;
  assert.equal(due[due.length - 1], '2041', 'a ten-year booster can be set');
});

test('MB-19: the export sheet hugs its content, rows say only "N readings", and PDF on the free plan asks with Cancel first', () => {
  assert.match(BODY, /<BottomSheet\s+visible=\{exportModalOpen\}/);
  assert.doesNotMatch(BODY, /m\.unit \? ` · \$\{m\.unit\}`/, 'no " · unit" on the export rows');
  const exp = fnCode(BODY, 'doExport');
  assert.match(exp, /setExportSheet\(\{\s*title: t\('export_premium_title'\),\s*body: t\('export_premium_sub'\),\s*buttons: \[\s*\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('vax_premium_cta'\), kind: 'primary'/);
  assert.match(BODY, /<DTSheet config=\{exportModalOpen \? exportSheet : null\} onClose=\{\(\) => setExportSheet\(null\)\} \/>/);
  assert.match(exp, /notice\(\{ title: t\('error'\), body: t\('export_error'\) \}, true\)/);
});

// ── Parts 16–20: the Vaccine journal ──────────────────────────────────────────────────────

test('MB-20 / MB-23: one "Reading your record…" card while a record is read; the button shows no spinner', () => {
  assert.equal((VAX.match(/<ActivityIndicator/g) || []).length, 1);
  assert.match(VAX, /\{uploading && \(\s*<View style=\{\[s\.card, s\.rowCard\]\}>\s*<ActivityIndicator size="small" color=\{colors\.ink\} \/>\s*<Text style=\{\[s\.body, s\.grow\]\}>\{t\('vax_scanning'\)\}<\/Text>/);
  const choice = fnCode(VAX, 'openScanChoice');
  assert.match(choice, /heading: t\('vax_scan_choose_title'\)/);
  assert.match(choice, /\{ label: t\('blood_source_pdf'\), onPress: \(\) => pickPdfAndExtract\(\) \}/);
  const scan = fnCode(VAX, 'handleScanPress');
  assert.match(scan, /if \(!\(await hasAIConsent\(\)\)\)/);
  assert.match(scan, /await grantAIConsent\(\); openScanChoice\(\);/);
  assert.match(fnCode(VAX, 'extractVaccines'), /notice\(\{ icon: null, title: t\('vax_imported_title'\), body: lines\.join\('\\n\\n'\) \}\);/);
});

test('MB-21: Save without a name shows the toast "Enter the vaccine name first." and saves nothing', async () => {
  const { vaccineNameMissing } = require('../lib/bodyHub');
  assert.equal(vaccineNameMissing(''), true);
  assert.equal(vaccineNameMissing('   '), true);
  assert.equal(vaccineNameMissing('Influenza'), false);
  const calls = [];
  const save = new Function(
    'vaccineNameMissing', 'name', 'showToast', 't', 'getCachedUser', 'insertVaccine', 'updateVaccine', 'requestSync', 'closeForm', 'fetchList',
    'doseNumber', 'dateGiven', 'nextDue', 'notes', 'manufacturer', 'batchLot', 'provider', 'location', 'editingId',
    `${fnCode(VAX, 'save')}\nreturn save;`,
  )(
    vaccineNameMissing, '  ', (x) => calls.push(['toast', x]), t, async () => ({ id: 'u' }), () => calls.push(['insert']), () => calls.push(['update']),
    () => calls.push(['sync']), () => calls.push(['close']), () => calls.push(['fetch']),
    '', '2026-10-02', '', '', '', '', '', '', null,
  );
  await save();
  assert.deepEqual(calls, [['toast', 'Enter the vaccine name first.']], 'only the toast — nothing saved, the sheet stays open');
  assert.match(VAX, /<BottomSheet visible=\{modalOpen\} onClose=\{closeForm\} overlay=\{<SheetToast text=\{toast\} \/>\}>/);
  assert.match(VAX, /<DTPickerSheet visible=\{pickerFor === 'given'\} title=\{t\('vax_date_given'\)\}/);
  assert.match(VAX, /wheelAfter\(dateGiven \|\| today, new Date\(\), col, i, \{ \.\.\.GIVEN_RANGE, max: today \}\)/);
  assert.match(VAX, /<DTPickerSheet visible=\{pickerFor === 'due'\} title=\{t\('vax_next_due_opt'\)\}/);
  assert.doesNotMatch(VAX, /DateTimePicker/, 'no inline iOS spinner');
  assert.match(SHEETS, /toast: \{[^}]*backgroundColor: c\.toast/);
});

test('MB-24 (founder decision A, 2026-10-03): a free vaccine-card scan uses the shared monthly budget — no "A Premium feature" sheet', () => {
  // Part 20's Premium sheet was approved on 2026-10-03 and replaced the same day by decision A:
  // free users get 3 scans a month for labs, vaccine cards and vials combined (freeScans.test.js).
  assert.doesNotMatch(VAX, /premiumSheet|vax_scan_premium_title|hasPremium/);
  assert.match(fnCode(VAX, 'handleScanPress'), /if \(!\(await hasAIConsent\(\)\)\)/);
});

// ── Rebuild = replace, data, strings, colours ─────────────────────────────────────────────

test('MB-26: the retired review sheets, inline spinners and old preview page are deleted', () => {
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX]]) {
    const code = strip(src);
    assert.doesNotMatch(code, /blood_review_title|vax_review_title|showConfirmModal|reviewOpen|saveExtracted|saveMarkers\b|extractedMarkers/, `${name}: review sheets gone`);
    assert.doesNotMatch(code, /<Modal\b/, `${name}: every sheet is a DoseTrace / bottom sheet`);
    assert.doesNotMatch(code, /presentationStyle="pageSheet"/, `${name}: no full-height page sheet`);
  }
});

test('MB-28: every delete in My Body is the synced tombstone; nothing stored is dropped or migrated', () => {
  const db = read('lib', 'database.js');
  for (const fn of ['deleteBiomarker', 'deleteBiomarkerReport', 'deleteVaccine']) {
    const i = db.indexOf(`export function ${fn}(`);
    assert.ok(i > 0, fn);
    assert.match(db.slice(i, i + 600), /SET sync_status = 'deleted'/, `${fn} writes a tombstone`);
  }
  assert.doesNotMatch(strip(BODY + VAX), /DELETE FROM|hardDelete|clearLocalDatabase|AsyncStorage\.removeItem/);
  // the stored shapes are read as before (favourites and labels still in user_metadata)
  assert.match(BODY, /user\.user_metadata\?\.favorite_markers/);
  assert.match(BODY, /user\.user_metadata\?\.report_tags/);
});

test('MB-29: the new strings exist in all 6 languages with their placeholders', () => {
  const keys = {
    body_starred_latest: ['{date}'], body_next_due: ['{name}', '{date}'], blood_latest_on: ['{date}'],
    blood_value_delete_title: [], blood_value_delete_body: ['{marker}', '{date}'],
    vax_delete_title: [], vax_delete_body: ['{name}'], vax_name_first: [], blood_error_service_sub: [],
  };
  for (const [k, ph] of Object.entries(keys)) {
    for (const l of LANGS) {
      const v = translations[l][k];
      assert.ok(typeof v === 'string' && v.length > 0, `${l}.${k}`);
      for (const p of ph) assert.ok(v.includes(p), `${l}.${k} keeps ${p}`);
    }
  }
  for (const l of LANGS.slice(1)) assert.notEqual(translations[l].vax_name_first, EN.vax_name_first, `${l} is translated`);
});

test('MB-30: theme tokens only in the changed My Body files', () => {
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX], ['BodySheets', SHEETS], ['bodyHub', read('lib', 'bodyHub.js')]]) {
    assert.doesNotMatch(strip(src), /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, `${name}: theme tokens only`);
  }
});
