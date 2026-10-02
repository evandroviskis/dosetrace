'use strict';
// Delete a dose from the Dose log (founder 2026-10-02, option A, copy approved "A, aprovo
// os textos"). Before this there was no way to remove a dose once Today's 4 s Undo bar had
// gone: deleteDoseLog was only reached from Today's Undo, and a Dose log row only opened
// the site editor (injectables only).
//  - Tapping ANY Taken / Skipped row (injectable or oral, also on the book page) opens the
//    dose sheet: protocol name, Done, Status / When / Site, Change site (injectables, the
//    drawn chevron, the existing site editor), then "Delete this dose" in risk.
//  - "Delete this dose" opens the Graduated confirm (DTSheet): Cancel (well) / Delete (risk).
//  - Missed rows keep their Mark taken / Mark skipped editor (no delete in this change).
//  - The write goes through lib/deleteDose.js planDeleteDose (Today's Undo plan), then the
//    sync tombstone, requestSync, the list, and onChanged (BK-19).
//  - One popup at a time with Today (BK-20 gate).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'screens', 'LogScreen.js'), 'utf8');
const today = fs.readFileSync(path.join(ROOT, 'screens', 'TodayScreen.js'), 'utf8');
parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

function fnBody(name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `function ${name} exists`);
  const open = src.indexOf('{', src.indexOf(')', i));
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(open, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
function styleBlock(name) {
  const m = src.match(new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name}`);
  return m[1];
}

test('every Taken / Skipped row opens the dose sheet; a Missed row keeps its editor', () => {
  assert.match(src, /onPress=\{\(\) => log\.outcome === 'Missed' \? openMissedEditor\(log\) : openDoseSheet\(log\)\}/);
  // no more "only injectables are tappable": every row carries the drawn chevron
  assert.doesNotMatch(src, /const tappable =/);
  assert.doesNotMatch(src, /<Text style=\{s\.chev\}>›<\/Text>/);
  const missed = fnBody('openMissedEditor');
  assert.match(missed, /t\('log_mark_taken'\)/);
  assert.match(missed, /t\('log_mark_skipped'\)/);
  assert.doesNotMatch(missed, /log_delete/);
});

test('the dose sheet: name, Done, Status / When / Site, Change site (injectables), Delete this dose', () => {
  assert.match(src, /t\('log_sheet_status'\)/);
  assert.match(src, /t\('log_sheet_when'\)/);
  assert.match(src, /t\('log_sheet_site'\)/);
  assert.match(src, /t\('log_change_site'\)/);
  assert.match(src, /t\('done'\)/);
  assert.match(src, /t\('log_delete_dose'\)/);
  assert.match(src, /describeStored\(/);
  assert.match(src, /<RowChevron color=\{colors\.ink3\} \/>/);
  // Change site and the Site row are for injectables only
  assert.match(src, /sheetInjectable && \(/);
  // Change site opens the existing editor flow, exactly as the row tap did
  assert.match(fnBody('changeSiteFromSheet'), /openSiteEditor\(log\)/);
  // the look: raised, radius 22 top, title 22/700, Done 17/600 ink, red text button
  const sheet = styleBlock('doseSheet');
  assert.match(sheet, /backgroundColor: c\.raised/);
  assert.match(sheet, /borderTopLeftRadius: 22/);
  assert.match(sheet, /borderTopRightRadius: 22/);
  assert.match(styleBlock('sheetTitle'), /fontSize: 22, fontWeight: '700', color: c\.ink/);
  assert.match(styleBlock('sheetDone'), /fontSize: 17, fontWeight: '600', color: c\.ink/);
  const danger = styleBlock('dangerBtn');
  assert.match(danger, /minHeight: 50/);
  const dangerText = styleBlock('dangerBtnText');
  assert.match(dangerText, /fontSize: 17, fontWeight: '600', color: c\.risk/);
  assert.match(styleBlock('changeSite'), /backgroundColor: c\.well/);
  assert.match(styleBlock('kvRow'), /borderBottomColor: c\.line/);
});

test('Delete this dose asks first, on the Graduated confirm sheet (DTSheet): Cancel / Delete in risk', () => {
  assert.match(src, /import \{ DTSheet \} from '\.\/components\/ProtocolParts'/);
  assert.match(src, /<DTSheet config=\{deleteSheet\} onClose=\{closeDeleteAsk\} \/>/);
  assert.match(src, /title: t\('log_delete_title'\)/);
  assert.match(src, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
  assert.match(src, /\{ label: t\('log_delete'\), kind: 'danger', onPress: /);
  assert.match(src, /'log_delete_body_oral'/);
  assert.match(src, /'log_delete_body'/);
  // DTSheet's danger button is risk with onInk text
  const parts = fs.readFileSync(path.join(ROOT, 'screens', 'components', 'ProtocolParts.js'), 'utf8');
  assert.match(parts, /btn_danger: \{ backgroundColor: c\.risk \}/);
  assert.match(parts, /btnText_danger: \{ color: c\.onInk \}/);
});

test('the delete applies the ONE plan, the sync tombstone, sync, the list and Today (BK-19)', () => {
  assert.match(src, /import \{ planDeleteDose, rememberDeleted, doseDayKind \} from '\.\.\/lib\/deleteDose'/);
  const apply = fnBody('applyDelete');
  assert.match(apply, /planDeleteDose\(log, /);
  assert.match(apply, /deleteDoseLog\(id\)/);
  assert.match(apply, /rememberDeleted\(id\)/);
  assert.match(apply, /updateVial\(/);
  assert.match(apply, /updateProtocol\(/);
  assert.match(apply, /requestSync\(\)/);
  assert.match(apply, /fetchLogs\(\)/);
  assert.match(apply, /onChanged\(\)/);
  assert.match(fnBody('deleteContext'), /getVialsForProtocol\(/);
});

test('one popup at a time with Today (BK-20): the dose sheet waits, holds the gate, and frees it', () => {
  const open = fnBody('openDoseSheet');
  assert.match(open, /gate\.busy\(\)/);
  assert.match(open, /gate\.wait\(/);
  assert.match(open, /gate\.opened\(\)/);
  assert.match(fnBody('closeDoseSheet'), /releasePopup\(\)/);
  assert.match(fnBody('closeDeleteAsk'), /releasePopup\(\)/);
  // the site editor opened from the sheet keeps the gate the sheet holds
  assert.match(fnBody('openSiteEditor'), /if \(gate && !editorOpenRef\.current\)/);
});

test('Today\'s Undo never runs on a row deleted from the Dose log (no double give-back)', () => {
  assert.match(today, /import \{ wasDeleted \} from '\.\.\/lib\/deleteDose'/);
  assert.match(today, /undoneIdsRef\.current\.has\(record\.logId\) \|\| wasDeleted\(record\.logId\)/);
  assert.match(today, /setUndoData\(prev => \(prev && wasDeleted\(prev\.logId\) \? null : prev\)\)/);
});

test('no raw colours in the Dose log: theme tokens only', () => {
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(src, /'white'|'black'|rgba\(/);
});

test('the dose sheet strings exist in all 6 languages with the {name} / {when} placeholders', () => {
  const tsrc = fs.readFileSync(path.join(ROOT, 'i18n', 'translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', tsrc.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  const tr = mod.exports.translations;
  const keys = ['log_delete_dose', 'log_delete_title', 'log_delete_body', 'log_delete_body_oral', 'log_delete_body_plain', 'log_delete', 'log_sheet_status', 'log_sheet_when', 'log_sheet_site', 'log_change_site'];
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of keys) assert.ok(tr[lang][k] && tr[lang][k].trim(), `${lang}.${k}`);
    for (const k of ['log_delete_body', 'log_delete_body_oral', 'log_delete_body_plain']) {
      assert.match(tr[lang][k], /\{name\}/, `${lang}.${k} {name}`);
      assert.match(tr[lang][k], /\{when\}/, `${lang}.${k} {when}`);
    }
  }
  assert.equal(tr.en.log_delete_dose, 'Delete this dose');
  assert.equal(tr.en.log_delete_title, 'Delete this dose?');
  assert.equal(tr.en.log_delete_body, '{name} · {when} is removed from your log, and one dose goes back to the vial. It cannot be undone.');
  assert.equal(tr.en.log_delete_body_oral, '{name} · {when} is removed from your log, and one serving goes back to the bottle. It cannot be undone.');
  assert.equal(tr.en.log_delete, 'Delete');
});
