'use strict';
// A-141 (4) — Fold session 2026-10-17 (build 50): the "Delete protocol" sheet
// (protocols_delete_confirm_settings, used by both delete sheets in My Protocols) still said the
// protocol "poderá ser recuperado por 7 dias" while the automatic purge is paused in 1.3.0
// (decisions.md:506) — Recently deleted keeps it until the user deletes it forever.
// Decision 2026-10-03/04 "Copy must be true" (decisions.md:544, PRD-PROT-101, DV-023): the sheet
// never promises a day count while the purge is paused and says the doses leave the Dose log while
// the protocol is deleted (true: lib/protocolEnd SQL_ALL_LOGS hides doses of a soft-deleted
// protocol). The wording follows the in-app privacy policy §8 ("stays there, so you can restore
// it, until you choose Delete forever"). No other delete / restore string ×6 names a day count.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const DAYS = /\d+\s*(days?|días|dias|jours?|Tage|giorni)\b/i;

test('A-141 (4): the delete sheet promises no day count, in all 6 languages', () => {
  for (const lang of LANGS) {
    const v = tr[lang].protocols_delete_confirm_settings;
    assert.ok(v, `${lang} exists`);
    assert.doesNotMatch(v, /\d/, `${lang}: no number of days ("${v}")`);
  }
});

test('A-141 (4): it says where the protocol goes, that it stays until deleted forever, and that its doses leave the Dose log', () => {
  const forever = { en: 'delete it forever', es: 'lo elimines para siempre', pt: 'excluí-lo para sempre', fr: 'supprimiez définitivement', de: 'endgültig löschst', it: 'lo elimini per sempre' };
  for (const lang of LANGS) {
    const v = tr[lang].protocols_delete_confirm_settings;
    assert.ok(v.includes(tr[lang].protocols_recently_deleted), `${lang}: names Recently deleted`);
    assert.ok(v.includes(forever[lang]), `${lang}: stays until deleted forever`);
    assert.ok(v.includes(tr[lang].log_title), `${lang}: names the Dose log ("${tr[lang].log_title}")`);
  }
  assert.match(tr.fr.protocols_delete_confirm_settings, /\bvous\b/, 'fr: vous');
});

test('A-141 (4): no delete / restore / Recently deleted string ×6 promises a day count', () => {
  for (const lang of LANGS) {
    const rd = tr[lang].protocols_recently_deleted;
    const walk = (o, p) => {
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object') { walk(v, p + k + '.'); continue; }
        if (typeof v !== 'string') continue;
        if (/delete_confirm|deleted|restore|recover/i.test(k) || v.includes(rd)) {
          let i = v.indexOf(rd);
          const segs = i < 0 ? [v] : [];
          while (i >= 0) { segs.push(v.slice(Math.max(0, i - 200), i + 250)); i = v.indexOf(rd, i + 1); }
          for (const s of segs) assert.doesNotMatch(s, DAYS, `${lang} ${p}${k}`);
        }
      }
    };
    walk(tr[lang], '');
  }
});

test('A-141 (4): both delete sheets use this text', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
  assert.equal((src.match(/body: t\('protocols_delete_confirm_settings'\)/g) || []).length, 2);
});
