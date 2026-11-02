'use strict';
// Founder 2026-11-02: advertising never names a substance, and every page an ad points to is reviewed by
// Meta/Apple/Google. The visible store texts (Apple subtitle and promo, Play short description, full
// description) must not name peptides, TRT, GLP-1 or other substances. The hidden Apple keyword field is
// a separate choice and is not checked here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const BANNED = /p[eé]pt[ií]d|peptid|\bTRT\b|GLP-?1|testost|semaglut|tirzepat|steroid|ester[oó]id|horm[oô]n/i;

test('visible store texts name no substance, in every language', () => {
  for (const l of LANGS) {
    const s = fs.readFileSync(path.join(__dirname, '../store/listing', `${l}.md`), 'utf8');
    const [, front, body] = s.split(/^---$/m);
    const field = (k) => ((new RegExp(`^${k}: "(.*)"$`, 'm').exec(front) || [])[1] || '');
    for (const k of ['apple_name', 'apple_subtitle', 'apple_promo', 'play_title', 'play_short']) {
      assert.doesNotMatch(field(k), BANNED, `${l}: ${k} names a substance`);
    }
    assert.doesNotMatch(body, BANNED, `${l}: full description names a substance`);
    assert.ok(field('apple_subtitle').length <= 30, `${l}: subtitle fits 30`);
    assert.ok(field('play_short').length <= 80, `${l}: play_short fits 80`);
  }
});
