'use strict';
// Council 2026-11-26 (regulatory-privacy, backend): the injection-site video's variant ends in -f / -m,
// so the analytics event carried the person's sex at birth next to the install id. The event needs only
// which question, language and phone family — never the sex.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/howtoVideos');
const URL = 'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/x.mp4';

test('the event variant drops the -f / -m suffix', () => {
  for (const [v, want] of [['ios-f', 'ios'], ['android-m', 'android'], ['fold-open-f', 'fold-open'], ['ios-fold-open-m', 'ios-fold-open'], ['ios', 'ios']]) {
    assert.deepEqual(H.eventProps('site', { lang: 'pt', variant: v, url: URL, dur: 30, bySex: v.endsWith('-f') || v.endsWith('-m') }), { question: 'site', lang: 'pt', variant: want });
  }
});
