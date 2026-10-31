// S25 2026-10-31 (reminder setup, pt): "Você conferiu em 31 de out.. Se mudar…" — a short month that
// already ends in a period (pt "out.", es/fr "oct.") filled into "{date}." printed two periods.
// Every string that ends a sentence right after {date} goes through a filler that keeps one period
// (lib/unsyncedDoses fillDate, lib/assistantText renderText), never a bare .replace('{date}', …).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const { fillDate } = require('../lib/unsyncedDoses');
const { renderText } = require('../lib/assistantText');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the reminder setup "checked on {date}." line has one period after a short month', () => {
  const src = read('components/ReminderSetupList.js');
  assert.match(src, /fillDate\(t\('rc_deep_sleep_checked'\), formatDate\(new Date\(c\.at\), language, 'dayMonth'\)\)/);
  assert.equal(fillDate(translations.pt.rc_deep_sleep_checked, '31 de out.'),
    'Você conferiu em 31 de out. Se mudar algo nas configurações do celular, confira de novo.');
  assert.equal(fillDate(translations.en.rc_deep_sleep_checked, 'Oct 31'),
    "You checked on Oct 31. If you change anything in Samsung's settings, check again.");
});

test('the assistant\'s texts keep one period after a date that ends in one', () => {
  const t = (k) => ({ x: 'Ela volta {date}. Até lá, preencha à mão.' })[k];
  assert.equal(renderText(t, 'x', { date: 'sex., 19 de out.' }), 'Ela volta sex., 19 de out. Até lá, preencha à mão.');
  assert.equal(renderText(t, 'x', { date: 'Fri, Oct 19' }), 'Ela volta Fri, Oct 19. Até lá, preencha à mão.');
});

test('no string with "{date}." is filled with a bare replace anywhere in the app', () => {
  const keys = new Set();
  for (const lang of Object.keys(translations)) {
    for (const [k, v] of Object.entries(translations[lang])) if (typeof v === 'string' && /\{date\}\./.test(v)) keys.add(k);
  }
  const files = ['App.js'];
  for (const dir of ['screens', 'components', 'lib']) {
    const walk = (d) => fs.readdirSync(path.join(__dirname, '..', d), { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
    });
    walk(dir);
  }
  for (const f of files) {
    const src = read(f);
    for (const k of keys) {
      assert.doesNotMatch(src, new RegExp(`t\\('${k}'\\)\\.replace\\('\\{date\\}'`), `${f}: ${k} must use fillDate`);
    }
  }
});

// S25 2026-10-31 (Ajustes, pt): the "Show names in notifications" switch was ON and its line began
// "Desligado:" — read as the current state. It says what happens if it is turned off.
test('"Show names in notifications" explains what turning it off does, never reads as its state', () => {
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(translations[lang].settings_notif_names_sub, /^(Off|Desactivado|Desligado|Désactivé|Aus)\s?:/, lang);
  }
  assert.equal(translations.pt.settings_notif_names_sub, 'Se desligar, a tela de bloqueio mostra “Lembrete de dose” em vez do nome do composto.');
});
