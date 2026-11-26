'use strict';
// Ads session 2026-11-26: a profile with no sex at birth sees the MALE body in "Local da injeção"
// (lib/bodySites figureSex), but the video picker found no video for that case (bySex videos only
// carry -m / -f). The video must follow the body the app shows: the same rule, figureSex.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { figureSex } = require('../lib/bodySites');
const { pickVideo } = require('../lib/howtoVideos');

const URL = 'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/';
const manifest = { v: 1, videos: { site: [
  { lang: 'pt', variant: 'android-m', url: URL + 'site-m.mp4', dur: 30, bySex: true },
  { lang: 'pt', variant: 'android-f', url: URL + 'site-f.mp4', dur: 30, bySex: true },
] } };

test('no sex in the profile → the male body → the -m video', () => {
  for (const meta of [{}, null, { gender: '' }, { gender: 'other' }]) {
    const v = pickVideo(manifest, { id: 'site', lang: 'pt', os: 'android', book: false, sex: figureSex(meta), appVersion: '1.3.1' });
    assert.ok(v && v.url.endsWith('site-m.mp4'), `meta ${JSON.stringify(meta)}`);
  }
  const f = pickVideo(manifest, { id: 'site', lang: 'pt', os: 'android', book: false, sex: figureSex({ gender: 'female' }), appVersion: '1.3.1' });
  assert.ok(f.url.endsWith('site-f.mp4'));
});

test('the FAQ reads the sex through the body rule (figureSex), not the raw field', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'howtoRuntime.js'), 'utf8');
  const fn = src.slice(src.indexOf('export function useProfileSex'));
  assert.match(src, /import \{ figureSex \} from '\.\/bodySites'/);
  assert.match(fn, /setSex\(figureSex\(/);
});
