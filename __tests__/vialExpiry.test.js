'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { daysUntilExpiry, expiryColor, parseDateOnly, DEFAULT_VALID_DAYS } = require('../lib/vialExpiry');

test('daysUntilExpiry: counts down from the mix date + validity window', () => {
  const now = new Date('2024-06-15T10:00:00');
  // Mixed today, 30-day window → 30 days left.
  assert.equal(daysUntilExpiry('2024-06-15', 30, now), 30);
  // Mixed 12 days ago, 30-day window → 18 left.
  assert.equal(daysUntilExpiry('2024-06-03', 30, now), 18);
  // Exactly at the window → 0.
  assert.equal(daysUntilExpiry('2024-05-16', 30, now), 0);
  // Past the window → negative.
  assert.equal(daysUntilExpiry('2024-05-10', 30, now), -6);
});

test('daysUntilExpiry: honors a custom (non-30) window', () => {
  const now = new Date('2024-06-15T10:00:00');
  assert.equal(daysUntilExpiry('2024-06-15', 14, now), 14);
  assert.equal(daysUntilExpiry('2024-06-10', 14, now), 9);
});

test('daysUntilExpiry: null on unusable input', () => {
  const now = new Date('2024-06-15T10:00:00');
  assert.equal(daysUntilExpiry('', 30, now), null);
  assert.equal(daysUntilExpiry('2024-06-15', 0, now), null);
  assert.equal(daysUntilExpiry('2024-06-15', null, now), null);
  assert.equal(daysUntilExpiry(null, 30, now), null);
});

test('daysUntilExpiry: accepts full ISO timestamps too', () => {
  const now = new Date('2024-06-15T23:00:00');
  assert.equal(daysUntilExpiry('2024-06-15T08:30:00.000Z', 30, now), 30);
});

test('expiryColor: red ≤3, amber ≤7, green beyond, stone when unknown', () => {
  assert.equal(expiryColor(2), '#E24B4A');
  assert.equal(expiryColor(0), '#E24B4A');
  assert.equal(expiryColor(5), '#BA7517');
  assert.equal(expiryColor(20), '#1D9E75');
  assert.equal(expiryColor(null), '#888780');
});

test('DEFAULT_VALID_DAYS is 30', () => {
  assert.equal(DEFAULT_VALID_DAYS, 30);
});

test('parseDateOnly builds a local-midnight date', () => {
  const d = parseDateOnly('2024-06-15');
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getMonth(), 5);
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 0);
});
