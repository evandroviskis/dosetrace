'use strict';
// Release-engineer review (founder 2026-10-17, build 52 / iOS 70 to both stores for everyone):
//  - Play promote reads store/whats-new-<version>.json (top-level texts, _store_locales) and names
//    the release "<app.json version> (<versionCode>)"; production, completed, no userFraction (100%).
//  - release-notes/1.3.0.json = the "ios" block keyed like Play; never names Android / Google Play
//    (Apple 2.3.10).
//  - asc-create-and-submit sets releaseType AFTER_APPROVAL, never creates a phased release, and its
//    default run is read-only (every non-GET goes through a guard).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { playReleaseNotes, iosReleaseNotes } = require('../scripts/releaseNotes.cjs');
const WN = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/whats-new-1.3.0.json'), 'utf8'));
const IOS_FILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'release-notes/1.3.0.json'), 'utf8'));
const PLAY_SRC = fs.readFileSync(path.join(ROOT, 'scripts/play-promote-production.cjs'), 'utf8');
const ASC_SRC = fs.readFileSync(path.join(ROOT, 'scripts/asc-create-and-submit.cjs'), 'utf8');
const LOCALES = ['en-US', 'es-ES', 'pt-BR', 'fr-FR', 'de-DE', 'it-IT'];

test('Play notes: the 6 top-level texts via _store_locales, Italian as it-IT, each <= 500', () => {
  const notes = playReleaseNotes('1.3.0');
  assert.deepEqual(notes.map((n) => n.language).sort(), [...LOCALES].sort());
  for (const [lang, loc] of Object.entries(WN._store_locales)) {
    const n = notes.find((x) => x.language === (loc === 'it' ? 'it-IT' : loc));
    assert.equal(n.text, WN[lang], lang);
    assert.ok(n.text.length <= 500, `${lang} ${n.text.length}`);
  }
});

test('release-notes/1.3.0.json is the "ios" block, 6 locales, no Android / Google Play', () => {
  assert.deepEqual(Object.keys(IOS_FILE), LOCALES);
  assert.deepEqual(IOS_FILE, iosReleaseNotes('1.3.0'));
  assert.equal(IOS_FILE['en-US'], WN.ios.en);
  assert.equal(IOS_FILE['it-IT'], WN.ios.it);
  for (const [loc, text] of Object.entries(IOS_FILE)) assert.doesNotMatch(text, /android|google/i, loc);
});

test('Play promote: release name from app.json, production, completed, full rollout, dry by default', () => {
  assert.doesNotMatch(PLAY_SRC, /1\.2\.2|RELEASE_NOTES = \[/, 'no hardcoded name or notes');
  assert.match(PLAY_SRC, /RELEASE_NAME = `\$\{VERSION\} \(\$\{versionCode\}\)`/);
  assert.match(PLAY_SRC, /tracks\/production/);
  assert.match(PLAY_SRC, /status: 'completed'/);
  assert.doesNotMatch(PLAY_SRC, /userFraction\s*:\s*[\d.]/, 'no staged rollout');
  assert.match(PLAY_SRC, /COMMIT = process\.argv\.includes\('--commit'\)/);
  assert.match(PLAY_SRC, /if \(COMMIT\) \{\s*await api\(token, 'POST', `\/edits\/\$\{editId\}:commit`\)/);
});

test('ASC submit: AFTER_APPROVAL, no phased release created, read-only unless --write/--submit', () => {
  assert.match(ASC_SRC, /RELEASE_TYPE = 'AFTER_APPROVAL'/);
  assert.match(ASC_SRC, /attributes: \{ platform: 'IOS', versionString: VERSION, releaseType: RELEASE_TYPE \}/);
  assert.match(ASC_SRC, /releaseType: RELEASE_TYPE, earliestReleaseDate: null/);
  assert.doesNotMatch(ASC_SRC, /'POST', '\/v1\/appStoreVersionPhasedReleases'/, 'never creates a phased release');
  assert.match(ASC_SRC, /'DELETE', `\/v1\/appStoreVersionPhasedReleases\//);
  assert.match(ASC_SRC, /WRITE = SUBMIT \|\| process\.argv\.includes\('--write'\)/);
  assert.match(ASC_SRC, /if \(!WRITE\) throw new Error/);
  // Every non-GET call goes through write(); request() is only called by get() and write().
  const direct = [...ASC_SRC.matchAll(/request\('(POST|PATCH|DELETE)'/g)];
  assert.equal(direct.length, 0, 'no direct writes bypassing the guard');
  assert.equal([...ASC_SRC.matchAll(/(?<!\.)\brequest\(/g)].length, 3, 'function + get + write');
});
