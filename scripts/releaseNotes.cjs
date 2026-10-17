// Release notes for the store scripts, from store/whats-new-<version>.json.
//  - Google Play: the top-level per-language texts (they may name Android).
//  - App Store:   the "ios" block (never names Android / Google Play, Apple 2.3.10),
//                 written to release-notes/<version>.json for asc-create-and-submit.cjs.
// _store_locales maps app language -> store locale. It says "it" for Italian (the App
// Store code); Google Play's code is "it-IT", so Play gets that one override.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLAY_LIMIT = 500;   // Play release notes, per language
const IOS_LIMIT = 4000;   // App Store What's New, per locale
const PLAY_LOCALE_OVERRIDE = { it: 'it-IT' };
const IOS_FORBIDDEN = /android|google\s*play/i;

function appVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.version;
}

function readWhatsNew(version = appVersion()) {
  const file = path.join(ROOT, 'store', `whats-new-${version}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(ROOT, file)}`);
  const wn = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!wn._store_locales || typeof wn._store_locales !== 'object') {
    throw new Error(`${path.relative(ROOT, file)} has no _store_locales mapping`);
  }
  return wn;
}

// [{ language, text }] for the Play track release, one per _store_locales entry.
function playReleaseNotes(version = appVersion()) {
  const wn = readWhatsNew(version);
  return Object.entries(wn._store_locales).map(([lang, storeLocale]) => {
    const text = wn[lang];
    if (typeof text !== 'string' || !text.trim()) throw new Error(`Play notes: no text for "${lang}"`);
    if (text.length > PLAY_LIMIT) throw new Error(`Play notes ${lang}: ${text.length} chars > ${PLAY_LIMIT}`);
    const language = PLAY_LOCALE_OVERRIDE[storeLocale] || storeLocale;
    return { language, text };
  });
}

// { 'en-US': text, ..., 'it-IT': text } from the "ios" block. Keyed like Play (it-IT);
// asc-create-and-submit.cjs maps it-IT -> it for App Store Connect.
function iosReleaseNotes(version = appVersion()) {
  const wn = readWhatsNew(version);
  if (!wn.ios || typeof wn.ios !== 'object') throw new Error('no "ios" block in whats-new');
  const out = {};
  for (const [lang, storeLocale] of Object.entries(wn._store_locales)) {
    const text = wn.ios[lang];
    if (typeof text !== 'string' || !text.trim()) throw new Error(`iOS notes: no text for "${lang}"`);
    const key = PLAY_LOCALE_OVERRIDE[storeLocale] || storeLocale;
    out[key] = text;
  }
  assertIosNotes(out);
  return out;
}

function assertIosNotes(notes) {
  for (const [locale, text] of Object.entries(notes)) {
    if (IOS_FORBIDDEN.test(text)) throw new Error(`iOS notes ${locale} name Android/Google Play (Apple 2.3.10)`);
    if (text.length > IOS_LIMIT) throw new Error(`iOS notes ${locale}: ${text.length} chars > ${IOS_LIMIT}`);
  }
}

module.exports = { appVersion, readWhatsNew, playReleaseNotes, iosReleaseNotes, assertIosNotes, IOS_FORBIDDEN };
