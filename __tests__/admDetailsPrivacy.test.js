// Founder 2026-11-02 (Admin Council round 1, answer 6): "Top biomarkers" and "adherence" leave the panel now (with 40
// accounts a marker counted once identifies the person; adherence is per-dose health data). They return later, aggregated,
// in a "Partners" view (favourite = starred markers, cells < 5 hidden). Dummy data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./helpers/admAuthFake');
const ROOT = path.join(__dirname, '..');
process.env.ADMIN_TOKEN = 'x';
const adm = require('../api/adm.js');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'adm.html'), 'utf8');

test('DP1: the page no longer renders the adherence doughnut nor the top-biomarkers card (no section, no canvas, no renderer)', () => {
  assert.ok(!/c-adh/.test(HTML), 'adherence canvas gone');
  assert.ok(!/function secProduct\(/.test(HTML), 'product section (top biomarkers) gone');
  assert.ok(!/D\.top_biomarkers/.test(HTML), 'no renderer reads top_biomarkers');
  assert.ok(!/D\.adherence/.test(HTML), 'no renderer reads adherence');
  assert.ok(!/type:'doughnut'/.test(HTML), 'no doughnut left');
  assert.match(HTML, /function secEngagement\(\)\{[\s\S]*?c-doses/, 'the dose-logs-per-day count chart stays (aggregate activity, no account)');
});

test('DP2: the API strips adherence and top_biomarkers from the Supabase data before answering (the panel never carries health data)', async () => {
  F.envOn();
  try {
  const r = await F.call(adm, { headers: F.bearer('admin') }, { data: () => F.json({ accounts: [], protocols_live: 0, adherence: { taken: 5, missed: 1, skipped: 0, total: 6 }, top_biomarkers: [{ k: 'x', n: 1 }], totals: { users: 1 } }) });
  assert.equal(r.code, 200);
  const d = r.json.sources.supabase.data;
  assert.equal(d.adherence, undefined);
  assert.equal(d.top_biomarkers, undefined);
  assert.deepEqual(d.totals, { users: 1 }, 'other data untouched');
  } finally { F.envOff(); }
});
