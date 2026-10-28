'use strict';
// Founder 2026-10-28 ("Aprovo os três pontos"), after a copy review of short labels:
// 1. Dose log, empty filter: the screen glued "Nenhuma" to the plural filter label ("Nenhuma
//    concluídas", "No complete"). It now says one whole phrase per filter, in each language.
// 2. Today: the done list's title said a bare masculine "Concluído"; it says "Doses concluídas",
//    and the take button, once tapped, says "Dose concluída" (one dose).
// 3. The 7-day streak line "Mandando bem!" was informal (formal Portuguese, founder 2026-10-20):
//    "Ótima sequência!". The other languages keep their wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const NONE = {
  en: ['No completed doses', 'No skipped doses', 'No missed doses'],
  es: ['Ninguna dosis completada', 'Ninguna dosis omitida', 'Ninguna dosis perdida'],
  pt: ['Nenhuma dose concluída', 'Nenhuma dose pulada', 'Nenhuma dose perdida'],
  fr: ['Aucune dose effectuée', 'Aucune dose sautée', 'Aucune dose manquée'],
  de: ['Keine erledigten Dosen', 'Keine ausgelassenen Dosen', 'Keine verpassten Dosen'],
  it: ['Nessuna dose completata', 'Nessuna dose saltata', 'Nessuna dose mancata'],
};

test('1. the empty Dose log filter says one whole phrase per filter (6 languages)', () => {
  for (const [l, [a, b, c]] of Object.entries(NONE)) {
    assert.equal(tr[l].log_none_taken, a, l);
    assert.equal(tr[l].log_none_skipped, b, l);
    assert.equal(tr[l].log_none_missed, c, l);
    assert.equal(tr[l].log_no_filter, undefined, `${l}: the glued word is gone`);
  }
  const src = read('screens/LogScreen.js');
  assert.doesNotMatch(src, /log_no_filter/);
  assert.match(src, /log_none_taken/);
  assert.match(src, /log_none_skipped/);
  assert.match(src, /log_none_missed/);
});

const BUTTON = { en: 'Dose complete', es: 'Dosis completada', pt: 'Dose concluída', fr: 'Dose effectuée', de: 'Dosis erledigt', it: 'Dose completata' };
const LIST = { en: 'Completed doses', es: 'Dosis completadas', pt: 'Doses concluídas', fr: 'Doses effectuées', de: 'Erledigte Dosen', it: 'Dosi completate' };

test('2. Today: the tapped button says one dose, the done list says the doses (6 languages)', () => {
  for (const l of Object.keys(BUTTON)) {
    assert.equal(tr[l].today_taken, BUTTON[l], l);
    assert.equal(tr[l].today_taken_list, LIST[l], l);
  }
  const src = read('screens/TodayScreen.js');
  assert.match(src, /<Text style=\{\[s\.takenTitle, s\.takenGrow\]\}>\{t\('today_taken_list'\)\}<\/Text>/);
  assert.match(src, /<Text style=\{s\.takenTitle\}>\{t\('today_taken_list'\)\}<\/Text>/, 'the closed list too');
  assert.doesNotMatch(src, /takenTitle[^>]*>\{takenLabel\}/, 'the button word never titles the list');
});

test('3. the 7-day streak line is formal in Portuguese', () => {
  assert.equal(tr.pt.today_streak_fire, 'Ótima sequência!');
  assert.equal(tr.en.today_streak_fire, 'On fire!');
});

// Founder 2026-10-28 ("Aprovo"): "Seu histórico de doses vai aparecer aqui assim que você começar a
// registrar" belongs only to a truly empty Dose log; an empty filter over a full history shows the
// title alone.
test('4. the "your history will appear here" line shows only when the Dose log is truly empty', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /\{listState === 'empty' && filter === 'All' && <Text style=\{s\.emptySub\}>\{t\('log_empty_sub'\)\}<\/Text>\}/);
});
