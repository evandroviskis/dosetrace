// DV-011 (DL-93; parked-error sweep 2026-10-31): delete-user's list did not name ai_assistant_usage (the ledger
// rule) or profiles (keyed by id), missed app_release_pushes, and listed notification_preferences and
// notification_sends, which do not exist in production. Checked against the live tables with a user column
// (information_schema, read 2026-10-31): every one is deleted by name, or exempt with a reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIVE_USER_TABLES = ['account_devices', 'admin_actions_log', 'admin_users', 'ai_assistant_usage', 'ai_food_usage', 'ai_scan_usage',
  'analytics_events', 'app_release_pushes', 'apple_tokens', 'biomarkers', 'calc_inputs', 'calc_snapshots', 'calc_targets', 'dose_logs',
  'food_logs', 'lab_prefs', 'protocols', 'push_tokens', 'reality_check_open', 'reality_checks', 'referral_codes', 'reminders',
  'team_messages', 'user_devices', 'vaccines', 'vials'];
// Admin-side records, not the person's own data (kept as the admin audit trail; never synced to the app).
const EXEMPT = ['admin_actions_log', 'admin_users'];

const src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/delete-user/index.ts'), 'utf8');
const list = (name) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  return m ? m[1].split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).join('').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
};

test('DV-011: every live user table is deleted by name (or exempt), and nothing absent is listed', () => {
  const named = new Set([...list('userDataTables'), ...list('deviceTables')]);
  const missing = LIVE_USER_TABLES.filter((t) => !named.has(t) && !EXEMPT.includes(t));
  assert.deepEqual(missing, []);
  const absent = [...named].filter((t) => !LIVE_USER_TABLES.includes(t));
  assert.deepEqual(absent, []);
  assert.match(src, /\.from\('profiles'\)\s*\.delete\(\)\s*\.eq\('id', user\.id\)/);
  assert.match(src, /\.from\('referrals'\)/);
});
