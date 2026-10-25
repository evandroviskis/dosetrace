'use strict';
// EAS Update + the Fold development client (founder 2026-10-23 "pode fazer os três", after the
// US$ 37 Expo bill; 2026-10-23 22:21 audience = everyone on TestFlight and on the Play internal
// track, store users only on the founder's word; 2026-10-23 22:22 the development client
// REPLACES the installed app on the Fold, option B; 2026-10-25 "Pode seguir").
// The configuration rules below are what keeps an update from reaching the wrong phones or the
// wrong binary, and from ever blocking or restarting the app under the user.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));

test('EAS Update: expo-updates is installed for SDK 54', () => {
  assert.match(pkg.dependencies['expo-updates'] || '', /^~29\./);
});

test('EAS Update: the app asks this project for updates, and only for its own native build', () => {
  assert.equal(app.updates?.url, `https://u.expo.dev/${app.extra.eas.projectId}`);
  // fingerprint: any native change gives a new runtime, so a JS update can never land on a binary
  // whose native code it was not built for
  assert.deepEqual(app.runtimeVersion, { policy: 'fingerprint' });
});

test('EAS Update: an update never blocks the launch (downloaded in the background, used on the next start)', () => {
  assert.equal(app.updates.fallbackToCacheTimeout, 0);
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
  const src = ['App.js', ...fs.readdirSync(path.join(root, 'lib')).map((f) => `lib/${f}`),
    ...fs.readdirSync(path.join(root, 'screens')).filter((f) => f.endsWith('.js')).map((f) => `screens/${f}`)]
    .filter((f) => f.endsWith('.js')).map(read).join('\n');
  assert.doesNotMatch(src, /Updates\.reloadAsync|reloadAsync\(/, 'the app never restarts itself to apply an update');
});

test('EAS Update: store/TestFlight builds listen on "production", test APKs on "preview"; publishing is a manual step', () => {
  assert.equal(eas.build.production.channel, 'production');
  assert.equal(eas.build.preview.channel, 'preview');
  assert.equal(eas.build.development.channel, undefined);
  assert.doesNotMatch(read('package.json'), /eas update/, 'no script publishes an update by itself');
});

test('Development client (option B): same app id as the real app, so reminders and Google sign-in work unchanged', () => {
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.distribution, 'internal');
  assert.equal(eas.build.development.android?.buildType, 'apk');
  assert.equal(app.android.package, 'io.outcom.dosetrace');
  assert.ok(pkg.dependencies['expo-dev-client'], 'expo-dev-client installed');
});
