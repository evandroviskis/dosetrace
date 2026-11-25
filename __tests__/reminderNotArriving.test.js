'use strict';
// docs/specs/reminder-not-arriving.md (RN-1..RN-14, founder 2026-11-24 "Aprovo os três pontos" on the
// picture docs/design/lembretes-nao-chegam.html). The reminder check is found by the person's own
// question, first in Notificações on both phones; the closed card says when something blocks; and the
// conversation no longer ends on "all set": it invites the test, asks if it arrived, and walks the
// settings the app cannot read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const C = require('../lib/reminderConversation');
const R = require('../lib/reminderHealth');
const S = require('../lib/appSearch');
const T = require('../i18n/translations.js').translations;
const { renderText } = require('../lib/assistantText');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NOW = Date.UTC(2026, 10, 24, 12);
const DAY = 86400000;
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); return src.slice(i, j < 0 ? undefined : j); };

const fold = { os: 'android', manufacturer: 'samsung', permission: 'granted', doseChannelImportance: 3, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, silent: false, activeWithTime: 2,
  lastRefresh: { at: NOW - 3600e3, ok: true }, nowMs: NOW, scheduledCount: 40, dueInWindow: 40, syncedOnce: true, deepSleepCheckedAt: NOW - DAY };
const iphone = { os: 'ios', permission: 'granted', remindersOn: true, silent: false, activeWithTime: 1, scheduledCount: 43, dueInWindow: 43, syncedOnce: true, nowMs: NOW };
const tPt = (k) => T.pt[k];
const text = (t, m) => (m.parts || [m]).map((p) => renderText(t, p.key, p.params)).join(' ');
const chipKeys = (conv, h) => C.chips(conv, h).map((c) => c.key);
const tail = (conv, n) => conv.messages.slice(-n);
const ptChips = (conv, h) => chipKeys(conv, h).map((k) => T.pt[k]);

// Send the test from the summary and land its result (the screen does this after sendTestReminder()).
function sendTest(conv, h, result = { ok: true, blocked: false }) {
  const r = C.choose(conv, 'test', h);
  assert.deepEqual(r.effect, { type: 'test' });
  return C.testResult(r.conv, result);
}

// ── RN-1 / RN-2: the row ────────────────────────────────────────────────────────────────────────
test('RN-1: the row is named "A notificação não está chegando?" in 6 languages, and the old names are gone', () => {
  assert.equal(T.pt.settings_rc_title, 'A notificação não está chegando?');
  const want = { en: 'Notifications not arriving?', es: '¿No te llegan las notificaciones?', fr: "Les notifications n'arrivent pas ?", de: 'Benachrichtigungen kommen nicht an?', it: 'Le notifiche non arrivano?' };
  for (const l of Object.keys(want)) assert.equal(T[l].settings_rc_title, want[l], l);
  for (const l of LANGS) {
    assert.equal(T[l].settings_setup_title, undefined, `${l}: one name, the old Android name is gone`);
    assert.equal(T[l].rc_setup_title, undefined, `${l}: the old screen name is gone`);
  }
  // No code still asks for the old names.
  for (const f of ['screens/SettingsScreen.js', 'components/ReminderConversation.js', 'screens/ReminderCheckScreen.js', 'screens/TodayScreen.js', 'screens/OnboardingFlowScreen.js']) {
    assert.doesNotMatch(read(f), /settings_setup_title|rc_setup_title/, f);
  }
  // The conversation's header is read under the same name on both phones.
  assert.match(read('components/ReminderConversation.js'), /accessibilityLabel=\{t\('settings_rc_title'\)\}>\{t\('rcv_title'\)\}/);
});

test('RN-1: it is the FIRST row of Notificações on iPhone and Android (one row, no platform branch), help icon, warning while blocked', () => {
  const s = read('screens/SettingsScreen.js');
  parse(s, { sourceType: 'module', plugins: ['jsx'] });
  const body = between(s, 'function renderNotificationsBody()', 'function renderPrivacyBody()');
  const row = body.indexOf("t('settings_rc_title')");
  assert.ok(row > 0, 'the row is in the Notificações body');
  assert.ok(row < body.indexOf("t('settings_dose_reminders')"), 'before the first switch');
  assert.equal(body.split("navigation.navigate('ReminderCheck')").length - 1, 1, 'one row opens the check');
  assert.equal(body.split("t('settings_rc_title')").length - 1, 1, 'one row, both phones');
  const before = body.slice(0, row);
  assert.doesNotMatch(before.slice(before.lastIndexOf('<TouchableOpacity')), /Platform\.OS (===|!==) 'android' \? \(/, 'not one platform only');
  assert.match(before, /FeatureIcon name=\{rowBlocked \? 'warning' : 'help'\}/);
  assert.match(before, /color=\{rowBlocked \? colors\.risk : colors\.ink\}/);
  // The old iPhone row at the end of the card is gone.
  assert.doesNotMatch(body.slice(body.indexOf("t('settings_persistent')")), /ReminderCheck/, 'nothing after the last switch');
});

test('RN-2: the status line under the row stays as it is on each phone', () => {
  const s = read('screens/SettingsScreen.js');
  const body = between(s, 'function renderNotificationsBody()', 'function renderPrivacyBody()');
  const rowSrc = body.slice(0, body.indexOf("t('settings_dose_reminders')"));
  assert.match(rowSrc, /Platform\.OS === 'android' \? setupRowSub\(\) : t\(reminderBlocks > 0 \? 'settings_rc_sub_block' : 'settings_rc_sub_ok'\)/);
  const sub = between(s, 'function setupRowSub()', '\n  }\n');
  for (const k of ['settings_rc_sub_block', 'rc_setup_progress', 'settings_setup_all_next', 'settings_setup_all']) assert.ok(sub.includes(k), k);
  assert.equal(T.pt.settings_rc_sub_ok, 'Nada está bloqueando');
  assert.equal(T.pt.settings_rc_sub_block, 'Algo está bloqueando seus lembretes');
  // The row is blocked by each phone's own rule (the one its status line uses).
  assert.equal(R.notifRowBlocked({ os: 'android', setupRow: { kind: 'block' }, reminderBlocks: 0 }), true);
  assert.equal(R.notifRowBlocked({ os: 'android', setupRow: { kind: 'warn' }, reminderBlocks: 1 }), false);
  assert.equal(R.notifRowBlocked({ os: 'android', setupRow: null, reminderBlocks: 0 }), false, 'not read yet: no alarm');
  assert.equal(R.notifRowBlocked({ os: 'ios', setupRow: { kind: 'ok' }, reminderBlocks: 1 }), true);
  assert.equal(R.notifRowBlocked({ os: 'ios', setupRow: { kind: 'block' }, reminderBlocks: 0 }), false);
});

// ── RN-3: the search ────────────────────────────────────────────────────────────────────────────
test('RN-3: the app search finds the row under the new name and opens the reminder check', () => {
  const tr = { en: T.en, es: T.es, pt: T.pt, fr: T.fr, de: T.de, it: T.it };
  const idx = S.buildPlaceIndex({ translations: tr, language: 'pt', protocols: [], records: [], flags: {} });
  for (const q of ['notificação não está chegando', 'não está chegando', 'chegando', 'lembrete não chega']) {
    const hit = S.searchPlaces(idx, q)[0];
    assert.ok(hit, q);
    assert.equal(hit.entry, 'D37', q);
    assert.equal(hit.title, 'A notificação não está chegando?', q);
    assert.deepEqual(hit.open, { push: 'ReminderCheck', tab: 'Settings' });
  }
  const en = S.buildPlaceIndex({ translations: tr, language: 'en', protocols: [], records: [], flags: {} });
  assert.equal(S.searchPlaces(en, 'notifications not arriving')[0].entry, 'D37');
});

// ── RN-4: the closed card ───────────────────────────────────────────────────────────────────────
test('RN-4: the closed Notificações card says the block in risk; open, or nothing blocking, it keeps its summary', () => {
  assert.deepEqual(R.notifCardSummary({ closed: true, blocked: true }), { key: 'settings_rc_sub_block', risk: true });
  assert.deepEqual(R.notifCardSummary({ closed: true, blocked: false }), { key: 'settings_sum_notif', risk: false });
  assert.deepEqual(R.notifCardSummary({ closed: false, blocked: true }), { key: 'settings_sum_notif', risk: false }, 'open: the row inside says it');
  assert.equal(T.pt.settings_sum_notif, 'Lembretes, alertas, modo silencioso');
  const s = read('screens/SettingsScreen.js');
  assert.match(s, /const rowBlocked = notifRowBlocked\(\{ os: Platform\.OS, setupRow, reminderBlocks \}\)/);
  // The phone card (closed = !open) and the Fold's left list (closed = not the page shown).
  assert.match(s, /groupSumView\(g, !open\)/);
  assert.match(s, /groupSumView\(g, !on, 2\)/);
  const view = between(s, 'const groupSumView = ', '\n  };\n');
  assert.match(view, /notifCardSummary\(\{ closed, blocked: rowBlocked \}\)/);
  assert.match(view, /<FeatureIcon name="warning" size=\{16\} color=\{colors\.risk\} \/>/);
  assert.match(view, /color: colors\.risk/);
  assert.doesNotMatch(view, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/, 'theme tokens only');
});

// ── RN-5: nothing readable blocks ───────────────────────────────────────────────────────────────
test('RN-5: nothing readable blocks → "Não encontrei nada bloqueando…", the invitation to the test, test first then Concluir', () => {
  for (const h of [iphone, fold]) {
    const conv = C.startConversation(h);
    assert.equal(conv.phase, 'summary');
    assert.equal(text(tPt, conv.messages[0]), 'Não encontrei nada bloqueando os lembretes neste celular.');
    assert.deepEqual(conv.messages.map((m) => m.kind), ['head', 'summary', 'schedule', 'app']);
    assert.equal(text(tPt, conv.messages[3]), 'Para ter certeza, envie um lembrete de teste. Ele chega em 10 segundos, pelo mesmo caminho dos lembretes de dose. Pode fechar o app.');
    assert.deepEqual(C.chips(conv, h).map((c) => [c.id, c.key, !!c.primary]), [['test', 'rc_test_btn', true], ['finish', 'rcv_finish', false]]);
    assert.deepEqual(ptChips(conv, h), ['Enviar um lembrete de teste', 'Concluir']);
  }
  for (const l of LANGS) assert.ok(T[l].rcv_none_found && T[l].rcv_test_invite, l);
  for (const l of LANGS) assert.equal(T[l].rcv_all_set, undefined, `${l}: "all set" is gone (rebuild = replace)`);
  // Onboarding: the same first sentence, no test (no schedule, no invitation).
  const ob = C.startConversation(fold, { mode: 'onboarding' });
  assert.equal(ob.messages[0].key, 'rcv_none_found');
  assert.ok(!ob.messages.some((m) => m.key === 'rcv_test_invite'));
  // Something still to do: today's heads and chips (Concluir first), no invitation.
  const sum = C.startConversation({ ...fold, exactAlarms: null, manufacturer: 'Google' });
  assert.equal(sum.messages[0].key, 'rcv_head_check');
  assert.ok(!sum.messages.some((m) => m.key === 'rcv_test_invite'));
  assert.deepEqual(chipKeys(sum, { ...fold, exactAlarms: null, manufacturer: 'Google' }), ['rcv_finish', 'rc_test_btn']);
});

// ── RN-6 / RN-7: did it arrive? ─────────────────────────────────────────────────────────────────
test('RN-6: after a sent test — the green line, then "O lembrete de teste chegou?" with Chegou / Não chegou', () => {
  const conv = sendTest(C.startConversation(iphone), iphone);
  const [user, sent, q] = tail(conv, 3);
  assert.equal(user.kind, 'user'); assert.equal(T.pt[user.key], 'Enviar um lembrete de teste');
  assert.equal(sent.kind, 'done'); assert.equal(text(tPt, sent), 'Teste enviado. Chega em 10 segundos.');
  assert.equal(q.kind, 'app'); assert.equal(q.mark, true); assert.equal(text(tPt, q), 'O lembrete de teste chegou?');
  assert.equal(conv.phase, 'asked');
  assert.deepEqual(C.chips(conv, iphone).map((c) => [c.id, !!c.primary]), [['arrived', true], ['not_arrived', false]]);
  assert.deepEqual(ptChips(conv, iphone), ['Chegou', 'Não chegou']);
  // A blocked or failed test keeps today's line and does not ask.
  const blocked = sendTest(C.startConversation(iphone), iphone, { ok: true, blocked: true });
  assert.equal(tail(blocked, 1)[0].key, 'rc_test_blocked'); assert.notEqual(blocked.phase, 'asked');
  const failed = sendTest(C.startConversation(iphone), iphone, { ok: false, blocked: false });
  assert.equal(tail(failed, 1)[0].key, 'rc_test_hint'); assert.notEqual(failed.phase, 'asked');
});

test('RN-7: "Chegou" → dose reminders arrive the same way, then Concluir', () => {
  const asked = sendTest(C.startConversation(iphone), iphone);
  const { conv, effect } = C.choose(asked, 'arrived', iphone);
  assert.equal(effect, null);
  const [user, line] = tail(conv, 2);
  assert.equal(T.pt[user.key], 'Chegou');
  assert.equal(text(tPt, line), 'Então os lembretes de dose também chegam por esse mesmo caminho.');
  assert.deepEqual(C.chips(conv, iphone).map((c) => [c.id, c.key]), [['finish', 'rcv_finish']]);
  assert.deepEqual(C.choose(conv, 'finish', iphone).effect, { type: 'close' });
});

// ── RN-8: iPhone, not arrived ───────────────────────────────────────────────────────────────────
test('RN-8: iPhone "Não chegou" → Foco, then Resumo programado, one at a time; never a green check', () => {
  let conv = sendTest(C.startConversation(iphone), iphone);
  ({ conv } = C.choose(conv, 'not_arrived', iphone));
  let [user, intro, focus] = tail(conv, 3);
  assert.equal(T.pt[user.key], 'Não chegou');
  assert.equal(text(tPt, intro), 'Há ajustes do iPhone que o DoseTrace não consegue ler. Vamos conferir um de cada vez.');
  assert.equal(intro.mark, true);
  assert.equal(T.pt[focus.titleKey], 'Foco'); assert.equal(focus.icon, 'moon');
  assert.equal(text(tPt, focus), 'Um Foco ligado pode silenciar o DoseTrace. Em Ajustes › Foco, abra o modo que estiver ligado e confira se o DoseTrace está entre os apps permitidos.');
  assert.equal(conv.phase, 'unread');
  assert.deepEqual(ptChips(conv, iphone), ['Já conferi', 'Pular este']);
  // "Já conferi" → the neutral line, then Resumo programado.
  ({ conv } = C.choose(conv, 'u_checked', iphone));
  const after = conv.messages.slice(-3);
  assert.equal(T.pt[after[0].key], 'Já conferi');
  assert.equal(after[1].kind, 'note'); assert.equal(text(tPt, after[1]), 'Foco conferido por você');
  const sched = after[2];
  assert.equal(T.pt[sched.titleKey], 'Resumo programado'); assert.equal(sched.icon, 'clock'); assert.equal(sched.mark, true);
  assert.equal(text(tPt, sched), 'No Resumo programado, os lembretes só aparecem no horário do resumo. Nas notificações do DoseTrace, a entrega precisa estar em Imediata.');
  assert.deepEqual(ptChips(conv, iphone), ['Abrir o ajuste', 'Já conferi', 'Pular este']);
  // "Abrir o ajuste" opens DoseTrace's page in the iPhone Settings (no resume: it is not a phone item).
  const open = C.choose(conv, 'u_open', iphone);
  assert.deepEqual(open.effect, { type: 'open', fix: 'notifications', item: 'scheduled_summary', ask: false, resume: false });
  assert.equal(open.conv.phase, 'away');
  assert.deepEqual(C.chips(open.conv, iphone), [], 'no chips while the person is in Settings');
  // Back: the neutral line, then the end.
  conv = C.returned(open.conv, iphone);
  const back = conv.messages.slice(-2);
  assert.equal(back[0].kind, 'note'); assert.equal(text(tPt, back[0]), 'Confira lá que ficou em Imediata');
  assert.equal(text(tPt, back[1]), 'Se o próximo teste também não chegar, fale com a equipe do DoseTrace.');
  assert.equal(conv.phase, 'end');
  assert.ok(!conv.messages.some((m) => m.kind === 'done' && /focus|scheduled_summary/.test(m.item || '')), 'RS-5: no green check');
  // "Pular este" goes on without a line.
  let skip = C.choose(sendTest(C.startConversation(iphone), iphone), 'not_arrived', iphone).conv;
  skip = C.choose(skip, 'u_skip', iphone).conv;
  assert.equal(T.pt[tail(skip, 2)[0].key], 'Pular este');
  assert.equal(tail(skip, 1)[0].titleKey, 'rcv_sched_summary');
});

test('RN-8: the screen opens the setting without saving a resume item, and reads the return as for any step', () => {
  const src = read('components/ReminderConversation.js');
  assert.match(src, /if \(mode === 'screen' && effect\.resume !== false\) saveResume\(effect\.item/);
  assert.match(src, /C\.returned\(/);
});

// ── RN-9: Android, not arrived ──────────────────────────────────────────────────────────────────
test('RN-9: Android "Não chegou" → Não perturbe with Já conferi / Pular este', () => {
  let conv = sendTest(C.startConversation(fold), fold);
  assert.equal(conv.phase, 'asked');
  ({ conv } = C.choose(conv, 'not_arrived', fold));
  const [intro, dnd] = tail(conv, 2);
  assert.equal(text(tPt, intro), 'Há um ajuste do Android que o DoseTrace não consegue ler. Os outros ajustes eu já conferi.');
  assert.equal(T.pt[dnd.titleKey], 'Não perturbe'); assert.equal(dnd.icon, 'mute');
  assert.equal(text(tPt, dnd), 'Com o Não perturbe ligado, as notificações ficam em silêncio. Puxe a barra de notificações e confira se ele está desligado, ou permita o DoseTrace nas exceções.');
  assert.deepEqual(ptChips(conv, fold), ['Já conferi', 'Pular este']);
  ({ conv } = C.choose(conv, 'u_checked', fold));
  assert.equal(text(tPt, conv.messages.slice(-2)[0]), 'Não perturbe conferido por você');
  assert.equal(conv.phase, 'end');
});

// ── RN-10: the end ──────────────────────────────────────────────────────────────────────────────
test('RN-10: the end — Enviar outro teste / Fale conosco / Concluir; another test asks again; a second "Não chegou" does not walk again', () => {
  let conv = C.choose(sendTest(C.startConversation(fold), fold), 'not_arrived', fold).conv;
  conv = C.choose(conv, 'u_skip', fold).conv;
  assert.equal(conv.phase, 'end');
  assert.equal(text(tPt, tail(conv, 1)[0]), 'Se o próximo teste também não chegar, fale com a equipe do DoseTrace.');
  assert.deepEqual(C.chips(conv, fold).map((c) => [c.id, !!c.primary]), [['test', true], ['contact', false], ['finish', false]]);
  assert.deepEqual(ptChips(conv, fold), ['Enviar outro teste', 'Fale conosco', 'Concluir']);
  assert.equal(T.pt.settings_contact, 'Fale conosco', 'the same words as Suporte');
  assert.deepEqual(C.choose(conv, 'contact', fold).effect, { type: 'contact' });
  assert.deepEqual(C.choose(conv, 'finish', fold).effect, { type: 'close' });
  // Another test: the same 10-second test, asked again.
  const again = sendTest(conv, fold);
  assert.equal(T.pt[tail(again, 3)[0].key], 'Enviar outro teste');
  assert.equal(again.phase, 'asked');
  const twice = C.choose(again, 'not_arrived', fold).conv;
  assert.equal(twice.phase, 'end');
  assert.equal(text(tPt, tail(twice, 1)[0]), 'O teste não chegou de novo. Fale com a equipe do DoseTrace.');
  assert.ok(!tail(twice, 2).some((m) => m.titleKey === 'rcv_dnd'), 'no second walk');
  // The screen: "Fale conosco" opens the same contact as Ajustes › Suporte.
  const src = read('components/ReminderConversation.js');
  assert.match(src, /effect\.type === 'contact'\) \{ openSupportContact\(\)/);
  assert.match(read('screens/SettingsScreen.js'), /function handleContactSupport\(\) \{\n\s+openSupportContact\(\);/);
  assert.match(read('lib/supportContact.js'), /mailto:hello@dosetrace\.io\?subject=DoseTrace Support/);
});

// ── RN-11: iPhone's Scheduled Summary cannot be read today ──────────────────────────────────────
test('RN-11: iPhone\'s Scheduled Summary is asked, because expo-notifications does not pass scheduledDeliverySetting on', () => {
  const req = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'ios', 'EXNotifications', 'Permissions', 'EXUserFacingNotificationsPermissionsRequester.m');
  if (fs.existsSync(req)) {
    const src = fs.readFileSync(req, 'utf8');
    assert.match(src, /allowsAnnouncements/, 'the permission dictionary is this file');
    assert.doesNotMatch(src, /scheduledDelivery/i, 'not exposed: reading it needs a native change (a build)');
  }
  assert.doesNotMatch(read('lib/notifications.js'), /scheduledDelivery|allowsScheduled/i, 'the app does not pretend to read it');
});

// ── RN-12: texts ────────────────────────────────────────────────────────────────────────────────
const RN_KEYS = ['settings_rc_title', 'rcv_none_found', 'rcv_test_invite', 'rcv_test_q', 'rcv_test_yes', 'rcv_test_no', 'rcv_test_yes_line',
  'rcv_unread_intro_ios', 'rcv_unread_intro_android', 'rcv_focus', 'rcv_why_focus', 'rcv_sched_summary', 'rcv_why_sched_summary', 'rcv_check_immediate',
  'rcv_dnd', 'rcv_why_dnd', 'rcv_checked_by_you', 'rcv_end_contact', 'rcv_again_contact', 'rcv_test_again'];

test('RN-12: every new text in the 6 languages, same placeholders, no emoji, pt formal', () => {
  const ph = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
  for (const k of RN_KEYS) for (const l of LANGS) {
    assert.ok(typeof T[l][k] === 'string' && T[l][k].trim(), `${l}.${k}`);
    assert.equal(ph(T[l][k]), ph(T.en[k]), `${l}.${k} placeholders`);
    assert.doesNotMatch(T[l][k], /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${l}.${k}`);
  }
  for (const k of RN_KEYS) assert.doesNotMatch(T.pt[k], /\b(a gente|dá para|deu para|pra|tá)\b/i, `pt.${k} formal`);
  // fr vous; es / de / it tu / du.
  for (const k of ['rcv_why_focus', 'rcv_why_dnd', 'rcv_end_contact']) {
    assert.doesNotMatch(T.fr[k], /\b(tu|ton|ta|tes)\b/i, `fr.${k} vous`);
    assert.doesNotMatch(T.de[k], /\b(Sie|Ihr|Ihre)\b/, `de.${k} du`);
    assert.doesNotMatch(T.es[k], /\b(usted)\b/i, `es.${k} tú`);
  }
  // The phone's own names.
  assert.deepEqual(LANGS.map((l) => T[l].rcv_focus), ['Focus', 'Concentración', 'Foco', 'Concentration', 'Fokus', 'Full immersion']);
  assert.deepEqual(LANGS.map((l) => T[l].rcv_sched_summary), ['Scheduled Summary', 'Resumen programado', 'Resumo programado', 'Résumé programmé', 'Geplante Zusammenfassung', 'Riepilogo programmato']);
  assert.deepEqual(LANGS.map((l) => T[l].rcv_dnd), ['Do Not Disturb', 'No molestar', 'Não perturbe', 'Ne pas déranger', 'Nicht stören', 'Non disturbare']);
  for (const l of LANGS) {
    assert.ok(T[l].rcv_why_focus.includes(T[l].rcv_focus), `${l}: the Focus sentence names it`);
    assert.ok(T[l].rcv_why_dnd.includes(T[l].rcv_dnd), `${l}: the DND sentence names it`);
  }
  // Icons from the app set.
  const icons = Object.fromEntries([...read('components/featureIconsData.js').matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => [m[1], 1]));
  for (const id of Object.keys(C.UNREAD)) assert.ok(icons[C.UNREAD[id].icon], `${id}: ${C.UNREAD[id].icon}`);
  assert.ok(icons.help, 'the row icon');
});

test('RN-12: theme tokens only and no emoji in the changed files', () => {
  for (const f of ['components/ReminderConversation.js', 'lib/reminderConversation.js', 'lib/supportContact.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(s, /'white'|'black'|rgba\(/, f);
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f}: no emoji`);
  }
  const body = between(read('screens/SettingsScreen.js'), 'function renderNotificationsBody()', "t('settings_dose_reminders')");
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/);
});
