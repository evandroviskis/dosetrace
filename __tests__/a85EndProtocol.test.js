'use strict';
// A-85 option A (founder 2026-10-30 19:59, docs/design/a85-end-protocol.html columns 2, 3 and 4; spec
// docs/specs/still-going-end-date.md SG-16). The empty-vial prompt: "Later" (closes only), "Log new
// vial", and "End protocol" (risk colour) under them, which asks first ("End {name}?" — the course-end
// words without the Continue part, Cancel / End). The protocol page: "End protocol" at the end of the
// page, only for an active protocol, the same question, then back to the list. Every End goes through
// the ONE End sequence (lib/endProtocolFlow endProtocolFully → lib/protocolEnd endNow). Android back on
// the prompt = Later (close only), never End. The handlers run for real with fakes
// (helpers/extractFn loadFn); the layout is read from the source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFn, sliceBlock, read } = require('./helpers/extractFn');
const { translations } = (() => {
  const src = read('i18n/translations.js').replace(/^export const /gm, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { translations };`)();
})();
const NV = require('../lib/newVial');

const TODAY = read('screens/TodayScreen.js');
const PROT = read('screens/ProtocolsScreen.js');
const VIALW = read('screens/components/NewVialPrompt.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function branch(src, from, to) { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); }
function style(src, key) { const m = src.match(new RegExp(`\\n\\s+${key}: \\{[^}]*\\}`)); assert.ok(m, `style ${key}`); return m[0]; }

// ── the strings ×6 ──────────────────────────────────────────────────────────────────────────────
const NEW_KEYS = ['today_vial_later', 'end_protocol', 'end_protocol_confirm_title', 'end_protocol_confirm_body'];

test('A-85 strings: the new texts exist in all 6 languages with the same placeholders; the approved Portuguese', () => {
  const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
  for (const l of LANGS) {
    for (const k of NEW_KEYS) {
      assert.ok(typeof translations[l][k] === 'string' && translations[l][k].trim(), `${l}.${k}`);
      assert.equal(ph(translations[l][k]), ph(translations.en[k]), `${l}.${k} placeholders`);
    }
    // the confirmation reuses Cancel and the course-end "End" (one term per concept)
    assert.ok(translations[l].cancel && translations[l].today_course_end_end, `${l} reused keys`);
    // "Protocol finished" is gone from the app (replaced by Later)
    assert.equal(translations[l].today_vial_finished, undefined, `${l}.today_vial_finished removed`);
  }
  assert.equal(translations.pt.today_vial_later, 'Depois');
  assert.equal(translations.en.today_vial_later, 'Later');
  assert.equal(translations.pt.end_protocol, 'Encerrar protocolo');
  assert.equal(translations.pt.end_protocol_confirm_title, 'Encerrar {name}?');
  assert.equal(translations.pt.end_protocol_confirm_body, 'Encerrar leva o protocolo para Encerrados, com todas as doses no histórico. Os lembretes dele param.');
  assert.equal(translations.pt.cancel, 'Cancelar');
  assert.equal(translations.pt.today_course_end_end, 'Encerrar');
  // the confirmation keeps the course-end words (End → Ended, doses kept) in every language
  for (const l of LANGS) {
    const course = translations[l].today_course_end_body;
    const shared = course.slice(course.indexOf(translations[l].today_course_end_end), course.indexOf(translations[l].today_course_end_continue));
    assert.ok(shared.length > 20 && translations[l].end_protocol_confirm_body.startsWith(shared.trim()), `${l}: same words as the course end`);
  }
});

// ── 2 · the prompt: Later (close only), Log new vial, End protocol ──────────────────────────────────
test('A-85 (2): the last-dose window says Later / Log new vial, with End protocol under them; "New vial" is unchanged', () => {
  assert.deepEqual(NV.vialPromptKeys('finished'), { title: 'today_vial_done_title', sub: 'today_vial_done_sub', secondary: 'today_vial_later', primary: 'today_vial_add', end: 'end_protocol' });
  assert.deepEqual(NV.vialPromptKeys('new'), { title: 'protocols_new_vial', sub: 'protocols_new_vial_body', secondary: 'cancel', primary: 'protocols_start_new' });
  // the window: End protocol is drawn under the two buttons, only when the mode has it and the screen ends
  const card = branch(VIALW, '<View style={[s.promptCard, vialKb.sheetStyle]}>', '</Modal>');
  const actions = card.indexOf('<Actions');
  const end = card.indexOf("{keys.end && onEnd ? (");
  assert.ok(actions > 0 && end > actions, 'End protocol under Later / Log new vial');
  assert.match(card, /<TouchableOpacity style=\{s\.promptEndBtn\} onPress=\{askEnd\} accessibilityRole="button">\s*<Text style=\{s\.promptEndText\}>\{t\(keys\.end\)\}<\/Text>/);
  // the risk colour, a text button (no fill), centred, a real touch target
  assert.match(style(VIALW, 'promptEndBtn'), /minHeight: 44, alignItems: 'center', justifyContent: 'center'/);
  assert.doesNotMatch(style(VIALW, 'promptEndBtn'), /backgroundColor/);
  assert.match(style(VIALW, 'promptEndText'), /fontSize: 15, fontWeight: '700', color: c\.risk/);
  // Later is Today's closeVialPrompt, which only closes (never ends anything)
  assert.match(TODAY, /onSecondary=\{closeVialPrompt\}/);
  const close = sliceBlock(TODAY, 'function closeVialPrompt(');
  assert.doesNotMatch(close, /endProtocol|cancelDoseReminder|deactivateVials/);
  // Today hands the window its End; only the last-dose window shows it (keys.end)
  assert.match(TODAY, /<NewVialPrompt[\s\S]*?onSecondary=\{closeVialPrompt\}[\s\S]*?onEnd=\{endFromVialPrompt\}[\s\S]*?\/>/);
});

// ── 3 · the confirmation ───────────────────────────────────────────────────────────────────────────
test('A-85 (3): End protocol asks first — "End {name}?", the body, Cancel (back to the window) / End', () => {
  const askEnd = sliceBlock(VIALW, 'const askEnd = (');
  assert.match(askEnd, /Keyboard\.dismiss\(\);\s*setConfirmEnd\(true\);/);
  assert.doesNotMatch(askEnd, /onEnd\(/, 'the tap never ends by itself');
  const confirm = branch(VIALW, '{confirmEnd ? (', ') : (');
  assert.match(confirm, /<View style=\{s\.promptCard\}>/);
  assert.match(confirm, /<Text style=\{s\.promptTitle\} accessibilityRole="header">\{t\('end_protocol_confirm_title'\)\.replace\('\{name\}', protocolName \|\| ''\)\}<\/Text>/);
  assert.match(confirm, /<Text style=\{s\.promptSub\}>\{t\('end_protocol_confirm_body'\)\}<\/Text>/);
  assert.match(confirm, /secondary=\{t\('cancel'\)\} onSecondary=\{\(\) => setConfirmEnd\(false\)\}/);
  assert.match(confirm, /primary=\{t\('today_course_end_end'\)\} onPrimary=\{\(\) => \{ if \(!latch\.take\(\)\) return; onEnd\(\); \}\}/);
  // each opening starts on the window, never on the question
  assert.match(VIALW, /useEffect\(\(\) => \{\s*if \(!visible\) return;[\s\S]*?setConfirmEnd\(false\);/);
});

test('A-85 (4): Android back on the prompt = Later (close only); on the question = Cancel; never End', () => {
  assert.equal(NV.vialPromptBack(false), 'later');
  assert.equal(NV.vialPromptBack(true), 'window');
  const modal = VIALW.slice(VIALW.indexOf('<Modal visible={!!visible}'), VIALW.indexOf('>', VIALW.indexOf('<Modal visible={!!visible}')));
  assert.match(modal, /onRequestClose=\{onBack\}/);
  const onBack = sliceBlock(VIALW, 'const onBack = (');
  assert.match(onBack, /vialPromptBack\(confirmEnd\) === 'window'\) setConfirmEnd\(false\);\s*else if \(onSecondary\) onSecondary\(\);/);
  assert.doesNotMatch(onBack, /onEnd/);
  // the scrim is not a button: a tap beside the window does nothing (never End)
  const overlay = branch(VIALW, '<KeyboardFrame>\n', '{confirmEnd ? (');
  assert.doesNotMatch(overlay, /onPress/);
});

// ── the ONE End ────────────────────────────────────────────────────────────────────────────────────
function endFlow(calls) {
  return loadFn('lib/endProtocolFlow.js', 'export function endProtocolFully(', 'endProtocolFully', {
    endProtocolNow: (id) => { calls.push(['endNow', id]); return '2026-10-30T12:00:00.000Z'; },
    cancelDoseReminder: async (id) => { calls.push(['cancel', id]); },
    dismissDeliveredDoseReminders: async (id) => { calls.push(['dismiss', id]); },
    AsyncStorage: { removeItem: async (k) => { calls.push(['removeKey', k]); } },
  });
}

test('A-85 / SG-16: the one End sequence — Ended (endNow), every reminder cancelled, banners cleared, the snooze removed', () => {
  const calls = [];
  const end = endFlow(calls)(9);
  assert.equal(end, '2026-10-30T12:00:00.000Z');
  assert.deepEqual(calls, [['endNow', 9], ['cancel', 9], ['dismiss', 9], ['removeKey', 'dosetrace_tx_check_9']]);
  // no screen ends a protocol by itself any more: endProtocolNow is called only by the one sequence
  for (const f of ['screens/TodayScreen.js', 'screens/ProtocolsScreen.js']) {
    assert.doesNotMatch(read(f), /endProtocolNow\(/, `${f} calls endProtocolNow directly`);
  }
  // "Encerrar" on "Ciclo concluído" goes through it too
  assert.match(sliceBlock(TODAY, 'function endCourse('), /endProtocolFully\(p\.id\);\s*closeProtocolQuestion\(\);/);
});

test('A-85 (2/3): confirming End in the vial prompt runs the one End, closes the prompt, reloads and syncs', () => {
  const calls = [];
  const fn = loadFn('screens/TodayScreen.js', 'function endFromVialPrompt(', 'endFromVialPrompt', {
    continuationProtocol: { id: 4 },
    endProtocolFully: endFlow(calls),
    closeVialPrompt: () => calls.push(['closePrompt']),
    fetchProtocols: () => calls.push(['fetch']),
    requestSync: () => calls.push(['sync']),
  });
  fn();
  assert.deepEqual(calls, [['endNow', 4], ['cancel', 4], ['dismiss', 4], ['removeKey', 'dosetrace_tx_check_4'], ['closePrompt'], ['fetch'], ['sync']]);
  const none = [];
  loadFn('screens/TodayScreen.js', 'function endFromVialPrompt(', 'endFromVialPrompt', {
    continuationProtocol: null, endProtocolFully: endFlow(none), closeVialPrompt: () => none.push(['closePrompt']), fetchProtocols() {}, requestSync() {},
  })();
  assert.deepEqual(none, [], 'no protocol: nothing happens');
});

// ── 4 · the protocol page ──────────────────────────────────────────────────────────────────────────
test('A-85 (4): the protocol page has End protocol at the end, only for an active protocol, raised with the risk colour', () => {
  const detail = sliceBlock(PROT, 'export function ProtocolDetail(');
  assert.match(detail, /const endShown = !!onEndProtocol && p\.active === 1 && !p\.deleted_at;/);
  const btn = detail.indexOf('{endShown ? (');
  assert.ok(btn > detail.indexOf('<NoteFrame') && btn > detail.indexOf('<ProtocolVialBlock'), 'after the vial and the note: the end of the page');
  assert.ok(btn < detail.indexOf('{deleteProtocol ? ('), 'above Delete');
  assert.match(detail, /<TouchableOpacity style=\{s\.endRowBtn\} onPress=\{\(\) => onEndProtocol\(p\)\} accessibilityRole="button">\s*<Text style=\{s\.endRowText\}>\{t\('end_protocol'\)\}<\/Text>/);
  assert.match(style(PROT, 'endRowBtn'), /backgroundColor: c\.raised, borderRadius: 22, minHeight: 56, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center'/);
  assert.match(style(PROT, 'endRowText'), /fontSize: 17, fontWeight: '700', color: c\.risk, textAlign: 'center'/);
  // the Protocols tab passes it; Today's Fold page (doses beside it, no Delete either) does not
  assert.match(branch(PROT, 'const renderDetail = (', '/>'), /onEndProtocol=\{askEndProtocol\}/);
  assert.doesNotMatch(branch(TODAY, '<ProtocolDetail', '/>'), /onEndProtocol/);
});

test('A-85 (4) rule: End shows only on an active protocol (never Ended, never Recently deleted)', () => {
  const detail = sliceBlock(PROT, 'export function ProtocolDetail(');
  const line = detail.match(/const endShown = ([^;]+);/)[1];
  // eslint-disable-next-line no-new-func
  const shown = (p, onEndProtocol) => new Function('p', 'onEndProtocol', `return ${line};`)(p, onEndProtocol);
  const fn = () => {};
  assert.equal(shown({ active: 1, deleted_at: null }, fn), true);
  assert.equal(shown({ active: 0, deleted_at: null, ended_at: '2026-10-01' }, fn), false, 'Ended');
  assert.equal(shown({ active: 0, deleted_at: '2026-10-01' }, fn), false, 'Recently deleted');
  assert.equal(shown({ active: 1, deleted_at: null }, null), false, 'no handler (Today page)');
});

function protHandlers(calls, sheets) {
  const deps = {
    t: (k) => translations.pt[k],
    protocolDisplayName: (p) => p.name,
    setScreenSheet: (c) => sheets.push(c),
    endProtocolFully: endFlow(calls),
    closeProtocol: () => calls.push(['closeProtocol']),
    fetchProtocols: () => calls.push(['fetch']),
    notifyDataChanged: (x) => calls.push(['notify', x]),
    requestSync: () => calls.push(['sync']),
  };
  deps.endProtocolHere = loadFn('screens/ProtocolsScreen.js', 'function endProtocolHere(', 'endProtocolHere', deps);
  return deps;
}

test('A-85 (3/4): the page asks "Encerrar {name}?" (Cancelar / Encerrar); Encerrar = the one End, then the list', () => {
  const calls = [];
  const sheets = [];
  const deps = protHandlers(calls, sheets);
  loadFn('screens/ProtocolsScreen.js', 'function askEndProtocol(', 'askEndProtocol', deps)({ id: 12, name: 'Testosterone Cypionate', active: 1 });
  assert.equal(calls.length, 0, 'asking ends nothing');
  const sh = sheets[0];
  assert.equal(sh.title, 'Encerrar Testosterone Cypionate?');
  assert.equal(sh.body, 'Encerrar leva o protocolo para Encerrados, com todas as doses no histórico. Os lembretes dele param.');
  assert.deepEqual(sh.buttons.map((b) => [b.label, b.kind]), [['Cancelar', 'secondary'], ['Encerrar', 'primary']]);
  assert.equal(sh.buttons[0].onPress, undefined, 'Cancelar only closes');
  sh.buttons[1].onPress();
  assert.deepEqual(calls, [['endNow', 12], ['cancel', 12], ['dismiss', 12], ['removeKey', 'dosetrace_tx_check_12'], ['closeProtocol'], ['fetch'], ['notify', 'protocol'], ['sync']]);
});

test('A-85: the same last-dose window on the protocol page (after Edit vial) ends through the same path', () => {
  const nv = branch(PROT, '<NewVialPrompt\n        visible={!!newVialFor}', '/>');
  assert.match(nv, /onEnd=\{endFromNewVialWindow\}/);
  const calls = [];
  const deps = protHandlers(calls, []);
  deps.newVialFor = { id: 3 };
  deps.setNewVialFor = (x) => calls.push(['window', x]);
  loadFn('screens/ProtocolsScreen.js', 'function endFromNewVialWindow(', 'endFromNewVialWindow', deps)();
  assert.deepEqual(calls, [['window', null], ['endNow', 3], ['cancel', 3], ['dismiss', 3], ['removeKey', 'dosetrace_tx_check_3'], ['closeProtocol'], ['fetch'], ['notify', 'protocol'], ['sync']]);
});

test('A-85: the one End module imports the real writers (no copy of the End)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/endProtocolFlow.js'), 'utf8');
  assert.match(src, /import \{ endProtocolNow \} from '\.\/database';/);
  assert.match(src, /import \{ cancelDoseReminder, dismissDeliveredDoseReminders \} from '\.\/notifications';/);
  assert.match(TODAY, /import \{ endProtocolFully \} from '\.\.\/lib\/endProtocolFlow';/);
  assert.match(PROT, /import \{ endProtocolFully \} from '\.\.\/lib\/endProtocolFlow';/);
});
