// DV-213 (AD-105, founder 2026-10-15: keep the caps as abuse ceilings, each with a true message when hit, ×6;
// parked-error sweep 2026-10-31): parse-food refused three different caps with one code ("today's limit —
// it resets tomorrow"), and a refused follow-up answer was dropped in silence. Each cap now has its own
// reason and the chat says what is true:
//   quota_exceeded — the 25 parses of the local day (resets at midnight, nutri_quota as before);
//   followup_limit — the 25 follow-up answers of the day (the item stays an estimate);
//   ceiling_24h    — 60 calls in a rolling 24 h, with the time a call frees up (retry_at).
// The server part ships with the next functions deploy (founder go); an old server's 429 still reads as quota.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sendFailureNotice, followupFailure } = require('../lib/foodThread');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DV-213: each refusal reads as its own notice', () => {
  assert.equal(sendFailureNotice({ ok: false, code: 'quota_exceeded', status: 429 }, true), 'quota');
  assert.equal(sendFailureNotice({ ok: false, code: 'ceiling_24h', status: 429 }, true), 'ceiling');
  assert.equal(sendFailureNotice({ ok: false, code: null, status: 429 }, true), 'quota', 'an old server');
  assert.equal(followupFailure({ ok: false, code: 'followup_limit', status: 429 }), 'limit');
  assert.equal(followupFailure({ ok: false, code: 'ceiling_24h', status: 429 }), 'ceiling');
  assert.equal(followupFailure({ ok: false, code: 'quota_exceeded', status: 429 }), 'limit', 'an old server');
  assert.equal(followupFailure({ ok: false, code: 'network', status: null }), 'retry');
  assert.equal(followupFailure({ ok: false, code: 'bad_request', status: 400 }), 'dropped');
});

test('DV-213: the server names each cap; the client carries retry_at; the chat shows the true message (x6)', () => {
  const fn = read('supabase/functions/parse-food/index.ts');
  assert.match(fn, /code: 'ceiling_24h', retry_at: retryAt/);
  assert.match(fn, /code: kind === 'followup' \? 'followup_limit' : 'quota_exceeded', limit/);
  assert.match(read('lib/nutritionClient.js'), /retryAt = body\?\.retry_at \|\| null/);
  assert.match(read('lib/foodLogActions.js'), /const fail = followupFailure\(res\);/);
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /x\.kind === 'ceiling' \? t\('nutri_ceiling'\)\.replace\('\{time\}', /);
  assert.match(chat, /x\.kind === 'followup_limit' \? t\('nutri_followup_limit'\)/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.match(translations[l].nutri_ceiling, /\{time\}/, l);
    assert.ok(translations[l].nutri_followup_limit, l);
  }
});
