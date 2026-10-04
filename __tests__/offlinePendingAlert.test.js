'use strict';
// A-46 extension "Offline pending alert" (founder 2026-09-28, target 1.2.6 → 1.3.0): while the
// phone is offline AND changes are waiting to be pushed, Today's alerts box says so; when the
// connection returns a sync runs (already) and the alert goes once nothing is pending. Saving is
// never blocked. Unknown connectivity (before the first report) shows nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { offlinePendingAlert } = require('../lib/offlineAlert');
const { read } = require('./helpers/extractFn');

test('offline with pending changes → alert; online, unknown or nothing pending → none', () => {
  assert.equal(offlinePendingAlert({ online: false, pendingCount: 3 }), true);
  assert.equal(offlinePendingAlert({ online: true, pendingCount: 3 }), false);
  assert.equal(offlinePendingAlert({ online: null, pendingCount: 3 }), false);
  assert.equal(offlinePendingAlert({ online: false, pendingCount: 0 }), false);
});

test('Today shows it in the alerts box and re-checks on connectivity, sync and every save', () => {
  const src = read('screens/TodayScreen.js');
  assert.match(src, /id: 'offline_pending'/);
  assert.match(src, /t\('today_alert_offline_title'\)/);
  assert.match(src, /e\.type === 'connectivity'/);
  assert.match(src, /offlinePendingAlert\(\{ online: isOnlineNow\(\), pendingCount:/);
});
