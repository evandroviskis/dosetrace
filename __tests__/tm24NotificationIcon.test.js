'use strict';
// TM-24 (founder 2026-10-22, "troca o ícone"): Android draws the notification small icon from the
// alpha channel only, so the opaque assets/icon.png showed a plain square on every notification
// (dose reminders and team messages). The small icon is a white droplet on a transparent background.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('TM-24: expo-notifications uses the transparent white droplet as the Android small icon', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
  assert.ok(plugin, 'expo-notifications plugin configured');
  assert.equal(plugin[1].icon, './assets/notification-icon.png');
});

test('TM-24: the icon file is a PNG with an alpha channel (colour type 6, RGBA)', () => {
  const buf = fs.readFileSync(path.join(ROOT, 'assets/notification-icon.png'));
  assert.equal(buf.slice(1, 4).toString('ascii'), 'PNG');
  assert.equal(buf[25], 6, 'RGBA, so the transparent parts stay transparent');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.equal(w, h, 'square');
  assert.ok(w >= 96, 'at least 96 px (xxxhdpi)');
});
