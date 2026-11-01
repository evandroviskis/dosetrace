'use strict';
// DV-018 colour (DL-80, AD-65; picture docs/design/rodada1-hoje-registro.html #dv018, founder go
// 2026-11-01): My Protocols colours a vial's days left exactly like Today's card — ≤3 risk, ≤7
// attention, above 7 ok, weight 600 — from ONE tone function both screens call (lib/vialExpiry).
// Before: Protocols drew more than 7 days in ink2 at weight 400 ("21 dias" grey there, green on Today).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const C = { risk: 'R', attention: 'A', ok: 'O', ink2: 'I2' };

test('DV-018: one tone for the days left — ≤3 risk, ≤7 attention, above 7 ok, always weight 600', () => {
  const { vialDaysTone } = require('../lib/vialExpiry');
  assert.deepEqual(vialDaysTone(0, C), { color: 'R', fontWeight: '600' });
  assert.deepEqual(vialDaysTone(3, C), { color: 'R', fontWeight: '600' });
  assert.deepEqual(vialDaysTone(4, C), { color: 'A', fontWeight: '600' });
  assert.deepEqual(vialDaysTone(7, C), { color: 'A', fontWeight: '600' });
  assert.deepEqual(vialDaysTone(8, C), { color: 'O', fontWeight: '600' });
  assert.deepEqual(vialDaysTone(21, C), { color: 'O', fontWeight: '600' });
});

test('DV-018: My Protocols (list and vial block) and Today call the shared tone, no local copy', () => {
  const prot = read('screens/ProtocolsScreen.js');
  assert.doesNotMatch(prot, /function daysTone\(/);
  assert.doesNotMatch(prot, /fontWeight: (vialDaysLeft|daysLeft) <= 7 \? '600' : '400'/);
  assert.equal((prot.match(/style=\{vialDaysTone\((daysLeft|vialDaysLeft), c\)\}/g) || []).length, 2);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /style=\{vialDaysTone\(daysLeft, colors\)\}/);
  assert.doesNotMatch(today, /daysLeft <= 3 \? colors\.risk : daysLeft <= 7 \? colors\.attention : colors\.ok/);
});
