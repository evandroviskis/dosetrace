// Found 2026-11-01 on the Fold (Play 1.3.1 vc63, first launch of an EAS Update): the app crashed at
// start with "NativeDatabase.execSync has been rejected — database is locked". The reminder refresh
// task and the notification-action task open their own connection to dosetrace.db (another JS runtime)
// and run initDatabase; with no busy timeout SQLite fails at once when the other one holds the lock,
// and App.js ran initDatabase in an effect with nothing around it, so the error was fatal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('every connection waits for a lock instead of failing (busy_timeout set right after opening)', () => {
  const db = read('lib/database.js');
  const getDB = db.slice(db.indexOf('export function getDB('), db.indexOf('\n}\n', db.indexOf('export function getDB(')));
  assert.match(getDB, /_db = SQLite\.openDatabaseSync\('dosetrace\.db'\);[^;]*?try \{ _db\.execSync\(`PRAGMA busy_timeout = 5000;`\); \} catch/);
});

test('App.js never lets a failed database start crash the app: it retries once, then carries on', () => {
  const app = read('App.js');
  assert.doesNotMatch(app, /\n    initDatabase\(\);\n/, 'no bare call in the start effect');
  assert.match(app, /try \{ initDatabase\(\); \} catch \(e\) \{ setTimeout\(\(\) => \{ try \{ initDatabase\(\); \} catch \(e2\) \{ \/\*/);
});
