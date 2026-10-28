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

// Founder 2026-10-28 ("Aprovo, pode trocar para Concluir dose de 14:00"): the timed take button says
// the same verb as the other take buttons, not "Tomar". One line, may shrink to 0.8 (SF Pro 17 bold:
// the longest, "Completa dose delle 14:00", is 217 pt; the button text has ~198 pt on a 375 pt iPhone).
const TIMED = { en: 'Complete {time} dose', es: 'Completar dosis de las {time}', pt: 'Concluir dose de {time}', fr: 'Valider la dose de {time}', de: 'Dosis um {time} erledigen', it: 'Completa dose delle {time}' };
test('5. the timed take button says the action with the same verb (6 languages) and is never cut', () => {
  for (const [l, v] of Object.entries(TIMED)) assert.equal(tr[l].today_take_time, v, l);
  // Council 2026-10-28 (senior engineer, QA): the text sat in a row that never limited its width, so
  // the shrink never ran and a long label ran past the pill; one line would also cut it on Android.
  // It may now shrink (0.8) and take a second line — between words, never inside one.
  const src = read('screens/TodayScreen.js');
  assert.match(src, /<Text style=\{\[s\.doseBtnPrimaryText, s\.doseBtnLabel, ok && \{ color: colors\.successSoftText \}\]\} numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>/);
  assert.match(src, /doseBtnLabel: \{ flexShrink: 1, textAlign: 'center' \}/);
});

// Council UX 2026-10-28 (delegated by the founder: "O restante você pode resolver"): one verb per action
// inside each language. French had "Passer" on the skip buttons but "sautée" in the log; the natural
// French for skipping a dose is "sauter une dose", so the buttons say "Sauter" / "Sauter la dose" and the
// take button "Valider" (like "Valider la dose de {time}"). Spanish reads the hour with its article:
// "Completar dosis de las {time}".
test('6. one verb per action in French; Spanish says "de las" before the hour', () => {
  const fr = tr.fr;
  assert.equal(fr.today_skip, 'Sauter');
  assert.equal(fr.today_pending_skip, 'Sauter la dose');
  assert.equal(fr.today_skip_title, 'Sauter la dose ?');
  assert.equal(fr.today_skip_confirm, 'Sauter la dose du jour de {name} ?');
  assert.equal(fr.today_mark_taken, 'Valider');
  assert.match(fr.log_status_skipped, /sautée/);
  assert.equal(tr.es.today_take_time, 'Completar dosis de las {time}');
});

// Council 2026-10-28 (QA): the streak badge never wraps inside its border; the pending card's buttons
// take a second line instead of an ellipsis on narrow Android screens.
test('7. the streak badge keeps one line; the pending buttons may take two', () => {
  assert.match(read('screens/components/TodayTracker.js'), /<Text style=\{s\.fire\} numberOfLines=\{1\}>\{t\('today_streak_fire'\)\}<\/Text>/);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>\{t\('today_pending_skip'\)\}/);
  assert.match(today, /numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>\{t\('today_pending_take'\)\}/);
});
