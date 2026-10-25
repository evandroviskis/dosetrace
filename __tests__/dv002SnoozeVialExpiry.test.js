'use strict';
// DV-002 (S1 privacy, AD-03): with "Show names in notifications" OFF, a snoozed vial-expiry copy must
// not keep the compound name, and it goes out on the vial-alerts channel (CHANNEL_FOR had no
// vial_expiry entry, so it fell back to the check-in channel). Runs the real restoreSnoozesLocked,
// scheduleSnoozeCopy and scheduleReq from lib/notifications.js with the real androidChannelRequest.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { androidChannelRequest, snoozeKindOff, withFireMs } = require('../lib/notificationPlan');
const { pluralKey } = require('../lib/plural');
const { translations } = require('../i18n/translations');

const SRC = read('lib/notifications.js');
const CHANNEL_FOR = new Function(`${/const CHANNEL_FOR = \{[^}]*\};/.exec(SRC)[0]}\nreturn CHANNEL_FOR;`)();

function makeT(lang) {
  const t = (k) => (translations[lang] && translations[lang][k]) || translations.en[k] || k;
  t.language = lang;
  return t;
}

async function restoreWith({ lang = 'en', namesOff = true, rec }) {
  const scheduledReqs = [];
  const scheduled = new Map([[rec.id, {}]]);
  const N = {
    async getAllScheduledNotificationsAsync() { return [...scheduled.keys()].map((identifier) => ({ identifier })); },
    async cancelScheduledNotificationAsync(id) { scheduled.delete(id); },
    async scheduleNotificationAsync(req) { scheduledReqs.push(req); scheduled.set(req.identifier, req); return req.identifier; },
  };
  const Platform = { OS: 'android' };
  const scheduleReq = loadFn('lib/notifications.js', 'async function scheduleReq(', 'scheduleReq', {
    silentNow: async () => false, androidChannelRequest, Platform, withFireMs, // DV-139 (1.3.2)
  });
  const scheduleSnoozeCopy = loadFn('lib/notifications.js', 'async function scheduleSnoozeCopy(', 'scheduleSnoozeCopy', {
    scheduleReq, Platform, CHANNEL_FOR,
  });
  let saved = null;
  const fn = loadFn('lib/notifications.js', 'async function restoreSnoozesLocked(', 'restoreSnoozesLocked', {
    getNotifications: () => N,
    loadSnoozes: async () => [JSON.parse(JSON.stringify(rec))],
    getCachedUser: async () => ({ user_metadata: { notif_show_names: !namesOff } }),
    pruneSnoozes: (l) => l, doseSlotResolved: () => false, snoozeKindOff, // DV-225 (1.3.2)
    getT: async () => makeT(lang),
    fill: (s, vars) => Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(String(vars[k])), s),
    isOne: (n) => n === 1, pluralKey,
    scheduleSnoozeCopy, saveSnoozes: async (l) => { saved = l; },
  });
  await fn();
  return { scheduledReqs, saved };
}

const expired = {
  id: 'snz-vial-exp-v1-0', origId: 'vial-exp-v1-0', fireAt: Date.now() + 3600e3, createdAt: Date.now(), kind: 'hour',
  title: 'Vial expiring soon', body: 'BPC-157 — expired',
  data: { type: 'vial_expiry', vialId: 'v1', protocolId: 'p1', daysLeft: 0 },
};

test('DV-002: names off → the re-armed vial-expiry snooze has no compound name, on the vial-alerts channel', async () => {
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const { scheduledReqs, saved } = await restoreWith({ lang, rec: expired });
    assert.equal(scheduledReqs.length, 1, `${lang}: the copy is re-armed with the new body`);
    const req = scheduledReqs[0];
    assert.ok(!/BPC/.test(req.content.body), `${lang}: no compound name in "${req.content.body}"`);
    assert.ok(!/BPC/.test(req.content.title), `${lang}: no compound name in the title`);
    const t = makeT(lang);
    assert.equal(req.content.body, t('today_alert_vial_expired_one').replace('{name}', t('notif_vial_fallback')));
    assert.equal(req.trigger.channelId, 'vial-alerts', `${lang}: the vial-alerts channel, not check-in`);
    assert.ok(!/BPC/.test(saved[0].body), `${lang}: the stored record is re-bodied too`);
  }
});

test('DV-002: a vial-expiry snooze 7 days ahead keeps its day count, without the name', async () => {
  const rec = { ...expired, id: 'snz-vial-exp-v1-7', body: 'BPC-157 expires in 7 days', data: { ...expired.data, daysLeft: 7 } };
  const { scheduledReqs } = await restoreWith({ rec });
  const t = makeT('en');
  assert.equal(scheduledReqs[0].content.body,
    t(pluralKey('today_alert_vial_expiry_days', 7, 'en')).replace('{name}', t('notif_vial_fallback')).replace('{n}', '7'));
  assert.ok(!/BPC/.test(scheduledReqs[0].content.body));
});

test('DV-002: names on → the vial-expiry snooze is left alone (still on the vial-alerts channel when re-armed)', async () => {
  const { scheduledReqs } = await restoreWith({ namesOff: false, rec: expired });
  assert.equal(scheduledReqs.length, 0, 'an armed copy with nothing to change is not touched');
  assert.equal(CHANNEL_FOR.vial_expiry, 'vial-alerts');
});
