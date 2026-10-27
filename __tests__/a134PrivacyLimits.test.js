'use strict';
// A-134 (7) — both-theme render pass 2026-10-16: privacy §5 said the app counts AI requests
// "(para os limites mensais)" — but only the scans are limited per month; the AI food log is
// limited per DAY (parse-food DAILY_FOOD_LIMIT, the user's local day) and the protocol assistant
// per WEEK (protocol-assistant "Weekly limit reached"). The sentence now names each limit with
// its period, in the app ×6 and the website copies (docs/legal en + pt: app = website). The
// "Last updated" date stays 16 October 2026 (same day). Also the pt copies used straight quotes
// ("nós", "Seus números reais"…): Portuguese typography is “ ”.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const sec5 = (body) => { const b = body.split('\n\n'); const i = b.findIndex((x) => /^(## )?5\. /.test(x)); return b.slice(i + 1).join('\n\n').split(/\n\n(## )?6\. /)[0]; };
const WEB_EN = fs.readFileSync(path.join(ROOT, 'docs/legal/privacy-policy-2026-10.md'), 'utf8');
const WEB_PT_ALL = fs.readFileSync(path.join(ROOT, 'docs/legal/privacy-policy-2026-10.pt.md'), 'utf8');
const WEB_PT = WEB_PT_ALL.split('\n---\n').slice(1).join('\n---\n'); // the published part

const PERIODS = {
  en: [/scans per month/, /AI food log per day/, /protocol assistant per week/],
  es: [/escaneos por mes/, /registro de comida con IA por día/, /asistente de protocolos por semana/],
  pt: [/leituras por mês/, /registro de comida com IA por dia/, /assistente de protocolos por semana/],
  fr: [/scans par mois/, /journal alimentaire avec IA par jour/, /assistant de protocole par semaine/],
  de: [/Scans pro Monat/, /KI-Essensprotokoll pro Tag/, /Protokoll-Assistent pro Woche/],
  it: [/scansioni al mese/, /diario alimentare con IA al giorno/, /assistente dei protocolli alla settimana/],
};
const OLD = /\((for the monthly limits|para los límites mensuales|para os limites mensais|pour les limites mensuelles|für die monatlichen Limits|per i limiti mensili)\)/;

test('A-134 (7): §5 names each AI limit with its own period (scans month, food log day, assistant week), app ×6 + website en/pt', () => {
  const texts = LANGS.map((l) => [l, l, tr[l].settings_privacy_body]).concat([['web en', 'en', WEB_EN], ['web pt', 'pt', WEB_PT]]);
  for (const [where, l, body] of texts) {
    const s = sec5(body);
    assert.doesNotMatch(s, OLD, `${where}: no "monthly limits" for every AI feature`);
    for (const re of PERIODS[l]) assert.match(s, re, `${where}: ${re}`);
  }
  // app = website, word for word for this sentence
  const line = (s) => s.match(/[^.]*\(for the limits:[^)]*\)[^.]*\./)[0];
  assert.equal(line(sec5(tr.en.settings_privacy_body)), line(sec5(WEB_EN)));
  const linePt = (s) => s.match(/Guardamos quantos pedidos[^.]*\./)[0];
  assert.equal(linePt(sec5(tr.pt.settings_privacy_body)), linePt(sec5(WEB_PT)));
});

// A-134 kept the 16 October date (same day); the A-163 team-messages paragraph (founder-approved
// 2026-10-22, council 2026-10-22 fix 4) moved it to 22 October 2026 in the app and the website copies.
test('A-134 (7) / A-163 / A-183: the date moves with each change (now 25 October 2026, Expo updates line), app and website copies alike', () => {
  assert.match(WEB_EN, /^Last updated: October 27, 2026$/m);
  assert.match(tr.pt.settings_privacy_body, /Última atualização: 27 de outubro de 2026/);
  assert.match(WEB_PT, /27 de outubro de 2026/);
});

test('A-134 (7): Portuguese quotes are “ ” in the pt policy (app and website), never straight', () => {
  assert.doesNotMatch(tr.pt.settings_privacy_body, /"/, 'pt in-app policy');
  assert.match(tr.pt.settings_privacy_body, /A Outcom \(“nós”\)/);
  assert.doesNotMatch(WEB_PT, /"/, 'pt website policy (published part)');
  assert.match(WEB_PT, /A Outcom \(“nós”\)/);
});
