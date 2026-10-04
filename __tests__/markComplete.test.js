'use strict';
// Founder 2026-10-02 ("troca para Mark complete também"): the action and every remaining
// user-facing "taken" wording say complete instead, in all 6 languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations.js');

const KEYS = ['today_mark_taken', 'notif_action_complete', 'log_mark_taken', 'report_outcome_line', 'today_take_undone',
  'today_site_back_msg', 'today_tip_2', 'xp_remind_body', 'xp_remind_taken', 'xp_notes_taken', 'today_pending_take'];
const OLD = { en: /\btaken\b/i, es: /\btomad[ao]s?\b/i, pt: /\btomad[ao]s?\b/i, fr: /\bpris(es?)?\b/i, de: /\b(ein)?genommen\b/i, it: /\b(assunt[aeio]|pres[ae])\b/i };

test('Mark complete in 6 languages (the notification action and the dose-log choice; Today\'s button has its short verb, todayTakeButtonFit.test.js)', () => {
  const want = { en: 'Mark complete', es: 'Marcar como completada', pt: 'Marcar como concluída', fr: 'Marquer comme effectuée', de: 'Als erledigt markieren', it: 'Segna come completata' };
  for (const [l, v] of Object.entries(want)) {
    assert.equal(translations[l].notif_action_complete, v, l);
    assert.equal(translations[l].log_mark_taken, v, l);
  }
});

test('no "taken" wording left in these strings (6 languages)', () => {
  for (const [l, re] of Object.entries(OLD)) for (const k of KEYS) {
    assert.ok(!re.test(translations[l][k].replace(/\{[a-z_]+\}/g, "")), `${l}.${k}: ${translations[l][k]}`);
  }
});
