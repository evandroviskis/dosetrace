'use strict';
// Council 2026-10-27 (regulatory-privacy, test first): one phone at a time (AD-77 / A-119) — the privacy
// texts never promise syncing "your devices"; the data syncs to the person's account in our cloud and comes
// back on a new phone. The FAQ names every AI feature that sends data to Anthropic, not only lab scans.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const DEVICES = /your devices|all your devices|tus dispositivos|seus dispositivos|seus aparelhos|os seus aparelhos|vos appareils|deine[nr]? Geräte|deinen Geräten|i tuoi dispositivi|tuoi dispositivi/i;

function faqAnswers(l) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') { if (typeof v.a === 'string') out.push(v.a); Object.values(v).forEach(walk); }
  };
  walk(translations[l]);
  return out;
}

test('policy §3, the consent purpose and the permanent delete never say "your devices" (×6)', () => {
  for (const l of LANGS) {
    for (const k of ['settings_privacy_body', 'consent_purpose_2', 'protocols_purge_body_single', 'protocols_purge_body_many']) {
      assert.doesNotMatch(translations[l][k], DEVICES, `${l}.${k}`);
    }
  }
  assert.match(translations.pt.settings_privacy_body, /sincronizar a sua conta com a nossa nuvem/);
  assert.equal(translations.pt.consent_purpose_2, 'Para sincronizar seus dados com a sua conta na nossa nuvem');
});

test('the privacy FAQ: one phone, and every AI feature named (×6)', () => {
  for (const l of LANGS) {
    const a = faqAnswers(l).find((x) => /Anthropic/.test(x));
    assert.ok(a, l);
    assert.doesNotMatch(a, DEVICES, l);
    assert.ok((a.match(/,|;/g) || []).length >= 3, `${l}: lists the other AI features`);
  }
  const pt = faqAnswers('pt').find((x) => /Anthropic/.test(x));
  assert.match(pt, /carteira de vacinação/);
  assert.match(pt, /assistente de protocolos/);
});

test('the legal copies and the website policy say the same (§2 one phone, §3 the account)', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['docs/legal/privacy-policy-2026-10.md', 'docs/legal/privacy-policy-2026-10.pt.md', 'web/privacy-policy.html']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(s, /sync your devices|sincronizar os seus aparelhos|available on your other devices/, f);
  }
  const web = fs.readFileSync(path.join(root, 'web/privacy-policy.html'), 'utf8');
  assert.match(web, /comes back when you sign in on a new phone/);
});
