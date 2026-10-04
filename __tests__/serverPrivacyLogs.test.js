'use strict';
// dt-council 2026-10-04 (backend + regulatory): server logs never carry the user's health content,
// and a protocol deleted forever never sends a reminder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('extract-bloodwork logs no lab text: no provider body and no model output in console lines', () => {
  const s = read('supabase/functions/extract-bloodwork/index.ts');
  for (const line of s.split('\n').filter((l) => /console\.(error|log|warn)\(/.test(l))) {
    assert.doesNotMatch(line, /providerBody|clean\.slice|clean\)|parsed|text\b/, `content in a log line: ${line.trim()}`);
  }
});

test('send-reminders skips protocols deleted forever', () => {
  assert.match(read('supabase/functions/send-reminders/index.ts'), /\.is\('purged_at', null\)/);
});
