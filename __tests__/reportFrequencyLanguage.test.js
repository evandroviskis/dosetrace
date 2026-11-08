'use strict';
// S25 2026-11-06/07 (app in pt): the adherence report read "Dose: 2000 UI · Daily", "Dose: 0,5 mg ·
// Every 7 days". The report printed the protocol's stored `frequency` string, which is baked in at
// creation time in the creation language. Fix: one helper, lib/schedule protocolFrequencyText, the
// wording the protocol screens show (interval_days → protocols_daily / protocols_every_x_days in the
// app language); the report and the protocol page both use it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { protocolFrequencyText, frequencyLabelFor } = require('../lib/schedule');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (l) => (k) => tr[l][k] ?? tr.en[k];

test('report frequency: a protocol stored with the English label reads in the app language (pt)', () => {
  const t = tFor('pt');
  assert.equal(protocolFrequencyText({ interval_days: 1, frequency: 'Daily' }, t), 'Diariamente');
  assert.equal(protocolFrequencyText({ interval_days: 7, frequency: 'Every 7 days' }, t), 'A cada 7 dias');
  assert.equal(protocolFrequencyText({ interval_days: 2, frequency: 'Every 2 days' }, t), 'A cada 2 dias');
  assert.equal(protocolFrequencyText({ interval_days: 3, frequency: 'Every 3 days' }, t), 'A cada 3 dias');
});

test('report frequency: all 6 languages use the protocol screens wording, never the stored string', () => {
  for (const l of LANGS) {
    const t = tFor(l);
    for (const i of [1, 2, 3, 7, 14]) {
      const p = { interval_days: i, frequency: i === 1 ? 'Daily' : `Every ${i} days` };
      assert.equal(protocolFrequencyText(p, t), frequencyLabelFor(i, t), `${l} ${i}`);
      if (l !== 'en') assert.notEqual(protocolFrequencyText(p, t), p.frequency, `${l} ${i} is not English`);
    }
  }
});

test('report frequency: no interval falls back to the stored text, then a dash', () => {
  const t = tFor('pt');
  assert.equal(protocolFrequencyText({ frequency: 'Custom' }, t), 'Custom');
  assert.equal(protocolFrequencyText({}, t), '—');
});

test('report frequency: the adherence report and the protocol page both use the helper', () => {
  const settings = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');
  assert.match(settings, /frequency:\s*protocolFrequencyText\(p, t\)/);
  assert.doesNotMatch(settings, /frequency:\s*p\.frequency/);
  const protocols = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');
  assert.match(protocols, /value:\s*protocolFrequencyText\(p, t\)/);
});
