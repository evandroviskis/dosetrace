'use strict';
// A-141 (3) — Fold session 2026-10-17 (build 50): in My Protocols › Recently deleted, a protocol
// deleted seconds ago read "Excluído há 1d".
// Cause: ProtocolsScreen's deletedAgo was Math.ceil((now - deleted_at) / 24 h): any time above
// zero rounds UP to 1 day, and it counts 24-hour blocks, not the user's calendar days (deleted at
// 23:50, seen at 00:10 = "1d" by the calendar but 0.01 by the clock).
// Fix: lib/localDate calendarDaysSince counts LOCAL calendar days (DST-safe); the row says
// "Deleted today" (new key protocols_deleted_today ×6) on the same day, then "Deleted {days}d ago".
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { calendarDaysSince, deletedAgoText } = require('../lib/localDate');

const tFor = (lang) => (k) => tr[lang][k];
const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);

test('A-141 (3): deleted seconds ago reads "Excluído hoje", not "há 1d"', () => {
  const now = at(2026, 10, 17, 11, 0);
  const del = new Date(now.getTime() - 5000).toISOString();
  assert.equal(deletedAgoText(del, tFor('pt'), now), 'Excluído hoje');
  assert.equal(deletedAgoText(del, tFor('en'), now), 'Deleted today');
});

test('A-141 (3): local calendar days, not 24-hour blocks and not UTC', () => {
  // 21:30 local (São Paulo) is already the next day in UTC: still today.
  assert.equal(calendarDaysSince(at(2026, 10, 17, 9, 0).toISOString(), at(2026, 10, 17, 21, 30)), 0);
  assert.equal(calendarDaysSince(at(2026, 10, 16, 23, 50).toISOString(), at(2026, 10, 17, 0, 10)), 1, 'yesterday by the calendar');
  assert.equal(calendarDaysSince(at(2026, 10, 14, 8, 0).toISOString(), at(2026, 10, 17, 7, 0)), 3, 'three calendar days, though < 72 h');
  assert.equal(deletedAgoText(at(2026, 10, 14, 8, 0).toISOString(), tFor('pt'), at(2026, 10, 17, 7, 0)), 'Excluído há 3d');
  assert.equal(calendarDaysSince(at(2026, 10, 18, 9, 0).toISOString(), at(2026, 10, 17, 9, 0)), 0, 'a clock behind the server never goes negative');
  assert.equal(calendarDaysSince(null, at(2026, 10, 17, 9, 0)), 0);
  assert.equal(calendarDaysSince('not a date', at(2026, 10, 17, 9, 0)), 0);
});

test('A-141 (3): the "today" line exists in all 6 languages, natural', () => {
  const want = { en: 'Deleted today', es: 'Eliminado hoy', pt: 'Excluído hoje', fr: 'Supprimé aujourd’hui', de: 'Heute gelöscht', it: 'Eliminato oggi' };
  for (const [lang, s] of Object.entries(want)) assert.equal(tr[lang].protocols_deleted_today, s, lang);
});

test('A-141 (3): Recently deleted uses deletedAgoText, never a ceil of 24-hour blocks', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
  const line = src.split('\n').find((l) => /const deletedAgo = /.test(l));
  assert.ok(line, 'deletedAgo exists');
  assert.doesNotMatch(line, /Math\.ceil/);
  assert.match(line, /deletedAgoText\(/);
});
