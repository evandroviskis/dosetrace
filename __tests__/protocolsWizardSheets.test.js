'use strict';
// My Protocols part 21 (founder 2026-10-02, the page Proposta column): the wizard's other
// popups are DoseTrace sheets, never the grey iOS alert — the AI consent (spark in the well
// circle, the privacy-policy link, Agree & continue on top of Cancel), "Not signed in" and
// the save error (the app's current warning triangle, Q15, title Error, one OK); "Let's
// double-check" has no icon and its button reads OK; Missing name and the scan notices read
// OK too (prototype sheetHTML default). Part 4: "Delete permanently?" gets the warning icon.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const PARTS = read('screens', 'components', 'ProtocolParts.js');
const fnBody = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a >= 0, `function ${name}`);
  let depth = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};

test('part 21: the wizard has no system Alert left', () => {
  assert.doesNotMatch(SCREEN, /Alert\.alert\(/);
  assert.doesNotMatch(SCREEN, /requestAIConsent\(/, 'the consent is the DoseTrace sheet, not the shared Alert');
});

test('part 21: AI consent is a DoseTrace sheet with the spark, the policy link, Agree on top of Cancel', () => {
  const scan = fnBody(SCREEN, 'handleVialScanPress');
  assert.match(scan, /await hasAIConsent\(\)/);
  assert.match(scan, /icon: 'ai_spark'/);
  assert.match(scan, /title: t\('ai_consent_title'\)/);
  assert.match(scan, /body: t\('ai_consent_body'\)/);
  assert.match(scan, /link: \{ label: t\('ai_consent_privacy'\), onPress: \(\) => Linking\.openURL\(AI_PRIVACY_URL\)/);
  assert.match(scan, /\{ label: t\('cancel'\), kind: 'secondary' \}/);
  assert.match(scan, /\{ label: t\('ai_consent_agree'\), kind: 'primary', onPress: async \(\) => \{ await grantAIConsent\(\); openScanChoice\(\); \} \}/);
  // the consent is still recorded in the one shared key (lib/aiConsent.js)
  const lib = read('lib', 'aiConsent.js');
  assert.match(fnBody(lib, 'grantAIConsent'), /AsyncStorage\.setItem\(CONSENT_KEY, 'granted'\)/);
  assert.match(lib, /export const AI_PRIVACY_URL = PRIVACY_URL;/);
  // DTSheet draws the link as the prototype .btnlink: 17 ink, underlined in tick
  assert.match(PARTS, /shown\.link \? \(/);
  assert.match(PARTS, /link: \{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' \}/);
  assert.match(PARTS, /linkText: \{ fontSize: 17, color: c\.ink, textDecorationLine: 'underline', textDecorationColor: c\.tick \}/);
});

test('part 21: Not signed in and the save error are DoseTrace sheets (warning icon, Error, OK)', () => {
  const save = fnBody(SCREEN, 'saveProtocol');
  assert.match(save, /wizError\(t\('protocols_not_signed_in'\)\)/);
  assert.match(save, /wizError\(friendlyError\(err, t, 'error_save_failed'\)\)/);
  const err = fnBody(SCREEN, 'wizError');
  assert.match(err, /icon: 'warning', title: t\('error'\), body, buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/);
});

test("part 21: Let's double-check has no icon and reads OK; Missing name and notices read OK", () => {
  const chk = fnBody(SCREEN, 'showCheckValues');
  assert.doesNotMatch(chk, /icon:/);
  assert.match(chk, /buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/);
  assert.match(fnBody(SCREEN, 'showMissingName'), /buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/);
  assert.match(fnBody(SCREEN, 'wizNotice'), /buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\]/);
});

test('part 4: Delete permanently? carries the warning icon (current app drawing, Q15)', () => {
  const del = fnBody(SCREEN, 'confirmPermanentDelete');
  assert.match(del, /icon: 'warning',/);
  assert.match(del, /title: t\('settings_delete_protocol_title'\)/);
});
