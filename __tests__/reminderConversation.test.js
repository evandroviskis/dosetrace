'use strict';
// docs/specs/reminder-setup-conversation.md (RS-1..RS-14, signed by the founder 2026-11-05: "1 sim,
// 2 ícone, 3 …por enquanto"; picture docs/design/reminder-setup-conversation.html). "Make sure your
// reminders arrive" becomes a guided conversation: one setting at a time, why it matters, the exact
// Android screen, the phone read again on return. The rules are pure (lib/reminderConversation);
// the screen (components/ReminderConversation) only renders them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const C = require('../lib/reminderConversation');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations;
const { renderText } = require('../lib/assistantText');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const exists = (p) => fs.existsSync(path.join(__dirname, '..', p));
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NOW = Date.UTC(2026, 10, 5, 12);
const DAY = 86400000;

// A Samsung phone with every Android item still to do (the picture's example: the Fold, 5 items).
const fold = { os: 'android', manufacturer: 'samsung', permission: 'denied', doseChannelImportance: 3, batteryOptimized: true,
  exactAlarms: false, hibernationExempt: false, remindersOn: true, silent: false, activeWithTime: 2,
  lastRefresh: { at: NOW - 3600e3, ok: true }, nowMs: NOW, scheduledCount: 40, dueInWindow: 40, syncedOnce: true, deepSleepCheckedAt: null };
const allOk = { ...fold, permission: 'granted', batteryOptimized: false, exactAlarms: true, hibernationExempt: true, deepSleepCheckedAt: NOW - DAY };
const pixel = { ...fold, manufacturer: 'Google' };
const iphone = { os: 'ios', permission: 'denied', remindersOn: true, silent: false, activeWithTime: 1, scheduledCount: 12, syncedOnce: true, nowMs: NOW };
const tEn = (k) => T.en[k];
const tPt = (k) => T.pt[k];
const text = (t, m) => (m.parts || [m]).map((p) => renderText(t, p.key, p.params)).join(' ');
const kinds = (conv) => conv.messages.map((m) => m.kind);
const lastApp = (conv) => [...conv.messages].reverse().find((m) => m.kind === 'app');
const chipIds = (conv, h) => C.chips(conv, h).map((c) => c.id);

// ── RS-1: a conversation: app bubbles, the person's choices, chips only, the mark on each step's first message ──
test('RS-1: the conversation is app messages and the person\'s choices; answers only by chips; the mark sits on the first message of each step only', () => {
  let conv = C.startConversation(fold);
  assert.deepEqual(kinds(conv), ['app', 'app']);
  assert.equal(conv.messages[0].mark, true, 'the first opening message carries the DoseTrace mark');
  assert.ok(!conv.messages[1].mark, 'the second does not');
  ({ conv } = C.choose(conv, 'start', fold));
  const user = conv.messages.find((m) => m.kind === 'user');
  assert.equal(user.key, 'rcv_start', 'the choice shows as the person\'s bubble');
  const step = conv.messages.filter((m) => m.kind === 'app' && m.item === 'notifications');
  assert.equal(step[0].mark, true); assert.equal(step[0].titleKey, 'rc_notif'); assert.equal(step[0].icon, 'bell');
  assert.ok(step.slice(1).every((m) => !m.mark));
  const p = C.progress(conv);
  assert.deepEqual(p, { n: 0, total: 5 }, '"N de M": the Samsung Fold has 5 items');
});

test('RS-1: the screen draws the picture — Fechar, title, "N de M" and a thin bar; raised app bubbles, ink user bubbles, chips; no text field; the app icon as the mark', () => {
  const src = read('components/ReminderConversation.js');
  parse(src, { sourceType: 'module', plugins: ['jsx'] });
  assert.match(src, /t\('ap_close'\)/);
  assert.match(src, /t\('rcv_title'\)/);
  assert.match(src, /rcv_progress/);
  assert.match(src, /app: \{[^}]*backgroundColor: c\.raised/);
  assert.match(src, /user: \{[^}]*backgroundColor: c\.act/);
  assert.match(src, /barFill: \{[^}]*backgroundColor: c\.ok/);
  assert.doesNotMatch(src, /TextInput/, 'no text field: answers only by chips');
  assert.match(src, /require\('\.\.\/assets\/icon\.png'\)/, 'the DoseTrace mark is the app icon');
  assert.doesNotMatch(src, /avatar|photo/i, 'no person, no photo');
});

// ── RS-2: opening; OK items are a green line; all OK → the summary ─────────────────────────────
test('RS-2: it opens on the two opening messages with "Começar" / "Agora não"', () => {
  const conv = C.startConversation(fold);
  assert.equal(conv.phase, 'intro');
  assert.equal(text(tPt, conv.messages[0]), 'Vou ajudar você a deixar o celular pronto para os lembretes de dose chegarem na hora, mesmo com o app fechado.');
  assert.equal(text(tPt, conv.messages[1]), 'São 5 ajustes, um de cada vez. Eu abro o lugar certo de cada um e confiro quando você voltar.');
  assert.deepEqual(C.chips(conv, fold).map((c) => [c.id, c.key, !!c.primary]), [['start', 'rcv_start', true], ['not_now', 'ob_not_now', false]]);
  assert.equal(T.pt.rcv_start, 'Começar'); assert.equal(T.pt.ob_not_now, 'Agora não');
  // One setting: the singular.
  const one = C.startConversation({ ...allOk, batteryOptimized: true });
  assert.equal(one.messages[1].key, 'rcv_intro_2', 'counts every item of the phone, not only the pending ones');
});

test('RS-2: items already OK are not walked — one green line each, then the first item that needs the person', () => {
  const h = { ...fold, permission: 'granted', exactAlarms: true }; // notifications + alarms OK; battery first to do
  let { conv } = C.choose(C.startConversation(h), 'start', h);
  const done = conv.messages.filter((m) => m.kind === 'done');
  assert.deepEqual(done.map((m) => m.key), ['rcv_ok_notifications', 'rcv_ok_alarms']);
  assert.equal(text(tPt, done[0]), 'Notificações permitidas');
  assert.equal(conv.current, 'battery');
  assert.equal(conv.phase, 'step');
  assert.deepEqual(C.progress(conv), { n: 2, total: 5 });
});

test('RS-2 / RS-9: every readable item already OK → it opens straight on the summary', () => {
  const conv = C.startConversation(allOk);
  assert.equal(conv.phase, 'summary');
  assert.deepEqual(kinds(conv), ['head', 'summary', 'schedule']);
  assert.equal(conv.messages[0].mark, true);
  // An item the app cannot read (alarms unknown) does not make it walk.
  assert.equal(C.startConversation({ ...allOk, exactAlarms: null }).phase, 'summary');
  // Samsung deep sleep not confirmed yet DOES (it counts: SP-10).
  assert.equal(C.startConversation({ ...allOk, deepSleepCheckedAt: null }).phase, 'intro');
});

// ── RS-3: one item at a time, approved order, the exact screen ─────────────────────────────────
test('RS-3: the approved order — notifications, Dose reminders category (when off), alarms, battery, hibernation, Samsung deep sleep, then the other kinds\' categories (when off)', () => {
  const h = { ...fold, doseChannelImportance: R.IMPORTANCE_NONE, foodOn: true, vialOn: true, checkinChannelImportance: R.IMPORTANCE_NONE, vialChannelImportance: R.IMPORTANCE_NONE };
  assert.deepEqual(C.convItemIds(h), ['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'deep_sleep', 'channel_checkin', 'channel_vial']);
  assert.deepEqual(C.convItemIds(fold), ['notifications', 'alarms', 'battery', 'hibernation', 'deep_sleep'], 'the category only when off; no refresh step');
  assert.deepEqual(C.convItemIds(pixel), ['notifications', 'alarms', 'battery', 'hibernation'], 'deep sleep is Samsung only');
  // Walk it: every step is a title with its icon, one sentence why, then "<action>" / "Agora não".
  let conv = C.choose(C.startConversation(h), 'start', h).conv;
  const seen = [];
  for (let guard = 0; guard < 12 && conv.phase === 'step'; guard++) {
    seen.push(conv.current);
    const first = conv.messages.find((m) => m.kind === 'app' && m.item === conv.current);
    assert.ok(first.titleKey && first.icon && first.key.startsWith('rcv_why_'), conv.current);
    const ids = chipIds(conv, h);
    assert.equal(ids[0], 'act', conv.current);
    assert.ok(ids.includes('not_now'), `${conv.current}: "Agora não" at every step (RS-7)`);
    ({ conv } = C.choose(conv, 'act', h));
    conv = C.returned(conv, h); // nothing changed
    if (conv.current === 'deep_sleep') ({ conv } = C.choose(conv, 'skip', h));
    else ({ conv } = C.choose(conv, 'skip', h));
  }
  assert.deepEqual(seen, ['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'deep_sleep', 'channel_checkin', 'channel_vial']);
  assert.equal(conv.phase, 'summary');
});

test('RS-3: every action opens exactly the screen openReminderFix opens today; notifications first try the system dialog', () => {
  const h = { ...fold, doseChannelImportance: R.IMPORTANCE_NONE, foodOn: true, vialOn: true, checkinChannelImportance: R.IMPORTANCE_NONE, vialChannelImportance: R.IMPORTANCE_NONE };
  const fixes = {};
  let conv = C.choose(C.startConversation(h), 'start', h).conv;
  for (let guard = 0; guard < 12 && conv.phase === 'step'; guard++) {
    const r = C.choose(conv, 'act', h);
    fixes[conv.current] = r.effect;
    conv = C.choose(C.returned(r.conv, h), 'skip', h).conv;
  }
  assert.deepEqual(Object.fromEntries(Object.entries(fixes).map(([k, e]) => [k, [e.type, e.fix, !!e.ask]])), {
    notifications: ['open', 'notifications', true], channel: ['open', 'channel', false], alarms: ['open', 'alarms', false],
    battery: ['open', 'battery', false], hibernation: ['open', 'hibernation', false], deep_sleep: ['open', 'deepSleep', false],
    channel_checkin: ['open', 'channel_checkin', false], channel_vial: ['open', 'channel_vial', false],
  });
  // The screen: the dialog first (askNotificationPermission), DoseTrace's notification settings when Android will not show it.
  const src = read('components/ReminderConversation.js');
  assert.match(src, /effect\.ask[\s\S]{0,120}askNotificationPermission\(\)[\s\S]{0,160}openReminderFix\(effect\.fix\)/);
  // "Permitir" while the dialog can still show; "Abrir o ajuste" once Android stored an answer.
  const undet = { ...fold, permission: 'undetermined' };
  assert.equal(C.chips(C.choose(C.startConversation(undet), 'start', undet).conv, undet)[0].key, 'rcv_allow');
  assert.equal(C.chips(C.choose(C.startConversation(fold), 'start', fold).conv, fold)[0].key, 'rcv_open_setting');
  assert.equal(T.pt.rcv_allow, 'Permitir'); assert.equal(T.pt.rcv_open_setting, 'Abrir o ajuste');
});

// ── RS-4: back from Android: read again, confirm or offer again ────────────────────────────────
test('RS-4: back from Android with the item now OK → its green line and the next item starts by itself', () => {
  let conv = C.choose(C.startConversation(fold), 'start', fold).conv;
  ({ conv } = C.choose(conv, 'act', fold));
  assert.equal(conv.phase, 'away');
  assert.deepEqual(C.chips(conv, fold), [], 'no chips while the person is in Android');
  const fixed = { ...fold, permission: 'granted' };
  conv = C.returned(conv, fixed);
  const tail = conv.messages.slice(-2);
  assert.equal(tail[0].kind, 'done'); assert.equal(text(tPt, tail[0]), 'Notificações permitidas');
  assert.equal(conv.current, 'alarms');
  assert.equal(text(tPt, tail[1]), 'Com este ajuste ligado, o lembrete toca na hora exata, e não até 1 hora depois.');
  assert.deepEqual(C.progress(conv), { n: 1, total: 5 });
  // A second "back" (the app came to the front again) changes nothing.
  assert.equal(C.returned(conv, fixed), conv);
});

test('RS-4: still not OK → "<item> ainda <state>", "Parece que não mudou…" with the same instruction, "Abrir de novo" / "Pular este"; skip goes on and the item stays pending', () => {
  const h = { ...fold, permission: 'granted', exactAlarms: true };
  let conv = C.choose(C.startConversation(h), 'start', h).conv;
  assert.equal(conv.current, 'battery');
  ({ conv } = C.choose(conv, 'act', h));
  conv = C.returned(conv, h);
  const warn = conv.messages.filter((m) => m.kind === 'warn').pop();
  assert.equal(text(tPt, warn), 'A bateria ainda está otimizada');
  const again = lastApp(conv);
  assert.equal(text(tPt, again), 'Parece que não mudou. Quer tentar de novo? Lá, toque em Bateria e escolha Sem restrições.');
  assert.deepEqual(C.chips(conv, h).map((c) => [c.id, c.key]), [['act', 'rcv_again'], ['skip', 'rcv_skip']]);
  assert.equal(T.pt.rcv_again, 'Abrir de novo'); assert.equal(T.pt.rcv_skip, 'Pular este');
  // "Abrir de novo" opens the same screen again.
  assert.equal(C.choose(conv, 'act', h).effect.fix, 'battery');
  // "Pular este" goes on; the phone is unchanged, so the item stays pending (Today, Settings: setupSteps).
  ({ conv } = C.choose(conv, 'skip', h));
  assert.equal(conv.current, 'hibernation');
  assert.equal(R.setupSteps(h).rows.find((r) => r.id === 'battery').state, 'warn');
  for (const l of LANGS) for (const k of ['rcv_retry', 'rcv_still_battery', 'rcv_where_battery']) assert.ok(T[l][k], `${l} ${k}`);
});

test('RS-4: the screen reads the phone again on return, warm (AppState) and cold (resume after Android closed the app)', () => {
  const src = read('components/ReminderConversation.js');
  assert.match(src, /AppState\.addEventListener\('change'/);
  assert.match(src, /readReminderHealth\(\)/);
  assert.match(src, /C\.returned\(/);
  // The return is read only when the person is really back (pure rule).
  assert.equal(C.returnReady({ away: true, settled: true, appState: 'active' }), true);
  assert.equal(C.returnReady({ away: true, settled: false, appState: 'active' }), false, 'the dialog has not answered yet');
  assert.equal(C.returnReady({ away: true, settled: true, appState: 'background' }), false, 'still in Android');
  assert.equal(C.returnReady({ away: false, settled: true, appState: 'active', opened: false }), true, 'nothing could open: read now');
  assert.equal(C.returnReady({ away: false, settled: true, appState: 'active', opened: true, waitedMs: 300 }), false, 'Android is still taking over');
  assert.equal(C.returnReady({ away: false, settled: true, appState: 'active', opened: true, waitedMs: 1600 }), true, 'a dialog that never left the app');
  // Cold: the item is kept on this phone before Android opens; Today brings the person back to it.
  const { resumeItem } = require('../lib/reminderSetupRule');
  assert.equal(resumeItem(JSON.stringify({ item: 'battery', at: NOW - 60e3 }), NOW), 'battery');
  assert.equal(resumeItem(JSON.stringify({ item: 'battery', at: NOW - 31 * 60e3 }), NOW), null, 'older than 30 minutes: forgotten');
  assert.equal(resumeItem('garbage', NOW), null);
  assert.equal(resumeItem(null, NOW), null);
  const setup = read('lib/reminderSetup.js');
  assert.match(setup, /RESUME_KEY = 'dosetrace_reminder_conv_resume'/);
  assert.match(setup, /navigation\.navigate\('ReminderCheck', \{ resume \}\)/);
  assert.match(src, /saveResume\(/);
  assert.match(src, /clearResume\(/);
  // Resumed: no opening messages again; the item is read at once.
  const back = C.startConversation({ ...fold, permission: 'granted' }, { resume: 'notifications' });
  assert.equal(back.messages.find((m) => m.kind === 'done').key, 'rcv_ok_notifications');
  assert.equal(back.current, 'alarms');
  assert.ok(!back.messages.some((m) => m.key === 'rcv_intro_1'));
});

// ── RS-5: what the app cannot read ─────────────────────────────────────────────────────────────
test('RS-5: an item the app cannot read never gets a green check: a neutral "Confira lá que ficou…" line and it goes on', () => {
  const h = { ...fold, exactAlarms: null, hibernationExempt: null, permission: 'granted', batteryOptimized: false, deepSleepCheckedAt: NOW - DAY, manufacturer: 'Google' };
  // Nothing readable to do → the summary; an unreadable alarm alone does not walk.
  assert.equal(C.startConversation(h).phase, 'summary');
  // Walking because battery is optimized: the unknown alarms step is walked and gets a neutral line.
  const w = { ...h, batteryOptimized: true };
  let conv = C.choose(C.startConversation(w), 'start', w).conv;
  assert.equal(conv.current, 'alarms');
  ({ conv } = C.choose(conv, 'act', w));
  conv = C.returned(conv, w);
  const note = conv.messages.filter((m) => m.kind === 'note').pop();
  assert.equal(text(tPt, note), 'Confira lá que ficou ligado');
  assert.ok(!conv.messages.some((m) => m.kind === 'done' && m.item === 'alarms'), 'no green check it did not earn');
  assert.equal(conv.current, 'battery', 'and it goes on');
  // The hibernation switch, unreadable: "desligado".
  conv = C.choose(C.returned(C.choose(conv, 'act', w).conv, { ...w, batteryOptimized: false }), 'act', w).conv;
  conv = C.returned(conv, w);
  assert.equal(text(tPt, conv.messages.filter((m) => m.kind === 'note').pop()), 'Confira lá que ficou desligado');
});

test('RS-5 / SP-10: Samsung deep sleep keeps "Abrir" / "Já conferi"; "Já conferi" saves the date; back from Android it stays on the step', () => {
  const h = { ...allOk, deepSleepCheckedAt: null };
  let conv = C.choose(C.startConversation(h), 'start', h).conv;
  assert.equal(conv.current, 'deep_sleep');
  const step = conv.messages.filter((m) => m.item === 'deep_sleep' && m.kind === 'app');
  assert.equal(text(tPt, step[0]), 'Um ajuste da Samsung que eu não consigo ler. Em Bateria, toque em Limites de uso em segundo plano › Aplicativos em suspensão profunda. O DoseTrace não pode estar nessa lista.');
  assert.deepEqual(C.chips(conv, h).map((c) => [c.id, c.key]), [['act', 'rc_fix_open'], ['checked', 'rc_deep_sleep_checked_btn'], ['not_now', 'ob_not_now']]);
  const opened = C.choose(conv, 'act', h);
  assert.equal(opened.effect.fix, 'deepSleep');
  conv = C.returned(opened.conv, h);
  assert.equal(text(tPt, conv.messages.filter((m) => m.kind === 'note').pop()), 'Confira lá que o DoseTrace não está na lista');
  assert.equal(conv.current, 'deep_sleep', 'it cannot read it: the person confirms');
  assert.deepEqual(chipIds(conv, h), ['checked', 'act', 'skip']);
  const r = C.choose(conv, 'checked', h);
  assert.deepEqual(r.effect, { type: 'checked' });
  conv = C.afterChecked(r.conv, { ...h, deepSleepCheckedAt: NOW });
  assert.equal(conv.phase, 'summary');
  assert.match(read('components/ReminderConversation.js'), /markDeepSleepChecked\(\)/);
});

// ── RS-6: battery, version B ───────────────────────────────────────────────────────────────────
test('RS-6: battery opens DoseTrace\'s own Android page and says where to tap; no battery-exemption permission, no system dialog', () => {
  const h = { ...fold, permission: 'granted', exactAlarms: true };
  const conv = C.choose(C.startConversation(h), 'start', h).conv;
  const msgs = conv.messages.filter((m) => m.item === 'battery' && m.kind === 'app');
  assert.equal(text(tPt, msgs[0]), 'O Android pausa apps para economizar bateria, e isso pode atrasar seus lembretes.');
  assert.equal(text(tPt, msgs[1]), 'Vou abrir a página do DoseTrace. Lá, toque em Bateria e escolha Sem restrições.');
  assert.deepEqual(msgs[1].parts[1].bold, ['battery', 'unrestricted'], 'the two words to tap are bold, as drawn');
  assert.equal(C.chips(conv, h)[0].key, 'rc_fix_open');
  assert.equal(C.choose(conv, 'act', h).effect.fix, 'battery');
  // The words are the ones the list used (one term per concept).
  for (const l of LANGS) {
    const s = text((k) => T[l][k], msgs[1]);
    assert.ok(s.includes(T[l].rc_battery) && s.includes(T[l].rc_battery_ok), `${l}: ${s}`);
  }
  // openReminderFix('battery') is the app's own page; nothing native was added.
  const n = read('lib/notifications.js');
  assert.match(n.slice(n.indexOf('export async function openBatteryOptimizationSettings')), /APPLICATION_DETAILS_SETTINGS/);
  assert.doesNotMatch(read('app.json'), /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
  assert.doesNotMatch(n, /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS|IGNORE_BATTERY_OPTIMIZATION_SETTINGS/);
});

// ── RS-7: "Agora não" / Fechar close, nothing else ─────────────────────────────────────────────
test('RS-7: "Agora não" at any step closes; nothing is changed; Fechar does the same', () => {
  const intro = C.startConversation(fold);
  assert.deepEqual(C.choose(intro, 'not_now', fold).effect, { type: 'close' });
  const step = C.choose(intro, 'start', fold).conv;
  assert.deepEqual(C.choose(step, 'not_now', fold).effect, { type: 'close' });
  const src = read('components/ReminderConversation.js');
  assert.match(src, /onPress=\{\(\) => onClose\(\)\}/, 'Fechar closes like "Agora não"');
  const screen = read('screens/ReminderCheckScreen.js');
  assert.match(screen, /onClose=\{\(\) => navigation\.goBack\(\)\}/);
});

// ── RS-8: onboarding ───────────────────────────────────────────────────────────────────────────
test('RS-8: onboarding — phone items only, its last chip "Continuar" (all OK) or "Configurar depois"; both continue as today', () => {
  const h = { ...fold, activeWithTime: 0, scheduledCount: 0, permission: 'granted' };
  let conv = C.startConversation(h, { mode: 'onboarding' });
  assert.deepEqual(C.choose(conv, 'not_now', h).effect, { type: 'continue' }, '"Agora não" goes on with the onboarding');
  conv = C.choose(conv, 'start', h).conv;
  for (let g = 0; g < 8 && conv.phase === 'step'; g++) conv = C.choose(conv, 'skip', h).conv;
  assert.equal(conv.phase, 'summary');
  assert.deepEqual(kinds(conv), kinds(conv).filter((k) => k !== 'schedule'), 'no schedule, no test');
  assert.ok(!kinds(conv).includes('schedule'));
  assert.deepEqual(C.chips(conv, h).map((c) => [c.id, c.key]), [['later', 'ob_setup_later']]);
  assert.deepEqual(C.choose(conv, 'later', h).effect, { type: 'continue' });
  const ok = { ...allOk, activeWithTime: 0 };
  assert.deepEqual(C.chips(C.startConversation(ok, { mode: 'onboarding' }), ok).map((c) => [c.id, c.key]), [['continue', 'ob_continue']]);
  // The rows of the summary in onboarding: the phone items only (no automatic refresh).
  assert.ok(!C.summaryRows(ok, { mode: 'onboarding' }).some((r) => r.id === 'refresh'));
  const o = read('screens/OnboardingFlowScreen.js');
  assert.match(o, /<ReminderConversation [^>]*mode="onboarding"/);
  assert.match(o, /onContinue=\{\(\) => toAuth\('create'\)\}/);
  assert.match(o, /await markSetupSeen\(\)/);
});

// ── RS-9: the summary ──────────────────────────────────────────────────────────────────────────
test('RS-9: the summary — every item with its state as read now, the next reminder and count, the automatic refresh, "Concluir" and the test reminder', () => {
  const conv = C.startConversation(allOk);
  assert.equal(text(tPt, conv.messages[0]), 'Tudo certo. Seu celular está pronto.');
  assert.deepEqual(C.summaryRows(allOk).map((r) => r.id), ['notifications', 'alarms', 'battery', 'hibernation', 'refresh', 'deep_sleep']);
  assert.deepEqual(C.chips(conv, allOk).map((c) => [c.id, c.key, !!c.primary]), [['finish', 'rcv_finish', true], ['test', 'rc_test_btn', false]]);
  assert.equal(T.pt.rcv_finish, 'Concluir');
  assert.deepEqual(C.choose(conv, 'finish', allOk).effect, { type: 'close' });
  const r = C.choose(conv, 'test', allOk);
  assert.deepEqual(r.effect, { type: 'test' });
  // The same blocked rule as today: a red row means the test cannot arrive — say so.
  assert.equal(C.testBlocked({ ...allOk, permission: 'denied' }), true);
  assert.equal(C.testBlocked({ ...allOk, scheduledCount: 0 }), false, 'an empty schedule does not stop the test');
  const sent = C.testResult(r.conv, { ok: true, blocked: false });
  assert.equal(lastApp(sent).key, 'rc_test_sent');
  assert.equal(lastApp(C.testResult(r.conv, { ok: true, blocked: true })).key, 'rc_test_blocked');
  // Something still to do: the head says how many, never "Tudo certo".
  assert.equal(text(tPt, C.summaryHead({ ...allOk, batteryOptimized: true })), 'Ainda falta 1 ajuste. Você pode voltar aqui quando quiser.');
  // The screen renders the schedule as before (silent / off / none / next + count, the protocol's display name).
  const src = read('components/ReminderConversation.js');
  for (const k of ['rc_silent_on', 'rc_reminders_off', 'rc_none', 'rc_none_sub', 'rcv_next_line', 'rc_count', 'rc_refresh_until', 'rc_deep_sleep_checked', 'sendTestReminder()']) assert.ok(src.includes(k), k);
  assert.match(src, /health\.next\.protocol \? protocolDisplayName\(health\.next\.protocol, t\) : health\.next\.title/);
  assert.match(src, /fillDate\(t\('rc_deep_sleep_checked'\), formatDate\(new Date\(c\.at\), language, 'dayMonth'\)\)/);
});

test('RS-9: the summary rows keep every state the list showed (block in risk, warn in attention, unreadable with its text)', () => {
  const src = read('components/ReminderConversation.js');
  assert.match(src, /c\.state === 'block'\) return colors\.risk/);
  assert.match(src, /c\.state === 'warn'\) return colors\.attention/);
  assert.match(src, /rowTitleKey\(c\.id, health\.manufacturer\)/);
  // The ROW table of the list moved here (DV-098 categories, A-106 alarms, RG-7 names).
  const ROW = C.ROW;
  assert.deepEqual(ROW.alarms, { icon: 'clock', title: 'rc_alarms', ok: 'rc_alarms_ok', warn: 'rc_alarms_warn', open: 'rc_alarms_sub' });
  assert.deepEqual(ROW.channel_checkin, { icon: 'food', title: 'notif_channel_checkin', ok: 'rc_channel_on_android', block: 'rc_channel_block' });
  assert.deepEqual(ROW.channel_vial, { icon: 'type_vial', title: 'notif_channel_vials', ok: 'rc_channel_on_android', block: 'rc_channel_block' });
  // The list's button words went with it (rebuild = replace); the steps' chips replace them.
  for (const l of LANGS) for (const k of ['rc_fix_turn_on', 'rc_fix_adjust', 'rc_fix_turn_off', 'rc_setup_intro', 'rc_setup_done', 'rc_sched_title', 'rc_intro', 'rc_next']) assert.equal(T[l][k], undefined, `${l}.${k}`);
  assert.equal(C.stateTextKey({ id: 'battery', state: 'warn' }), 'rc_battery_warn');
  assert.equal(C.stateTextKey({ id: 'alarms', state: 'open' }), 'rc_alarms_sub');
  assert.equal(C.stateTextKey({ id: 'notifications', state: 'block' }), 'rc_notif_block');
});

// RS-9 (coordinator 2026-11-05, answer 3): the list let the person fix any row from that screen — the
// summary keeps that: one "Ajustar <item>" chip under the card per item that is not OK; it resumes the
// walk at that item and, after the return, goes back to the summary (not on through the rest).
test('RS-9: the summary offers "Ajustar <item>" for every item not OK; it walks that one item and comes back to the summary', () => {
  assert.deepEqual(C.fixChips(C.startConversation(allOk), allOk), [], 'all OK: no fix chips');
  const h = { ...allOk, batteryOptimized: true, deepSleepCheckedAt: null, foodOn: true, checkinChannelImportance: R.IMPORTANCE_NONE };
  // Walk once, skipping everything → the summary.
  let conv = C.choose(C.startConversation(h), 'start', h).conv;
  for (let g = 0; g < 8 && conv.phase === 'step'; g++) conv = C.choose(conv, 'skip', h).conv;
  assert.equal(conv.phase, 'summary');
  const fixes = C.fixChips(conv, h);
  assert.deepEqual(fixes.map((x) => x.id), ['fix:battery', 'fix:deep_sleep', 'fix:channel_checkin']);
  assert.equal(text(tPt, fixes[0]), 'Ajustar Bateria');
  assert.equal(text(tPt, fixes[1]), 'Ajustar Aplicativos em suspensão profunda');
  assert.equal(text(tPt, fixes[2]), 'Ajustar Check-ins e registro de comida');
  // Tap "Ajustar Bateria": the person's bubble, then the normal step (why + action + Agora não).
  let r = C.choose(conv, 'fix:battery', h);
  conv = r.conv;
  assert.equal(conv.phase, 'step'); assert.equal(conv.current, 'battery');
  assert.equal(text(tPt, conv.messages.filter((m) => m.kind === 'user').pop()), 'Ajustar Bateria');
  assert.equal(conv.messages.filter((m) => m.item === 'battery' && m.kind === 'app').slice(-2)[0].key, 'rcv_why_battery');
  assert.deepEqual(chipIds(conv, h), ['act', 'not_now']);
  // Back from Android, fixed → green line, then the summary again (not deep sleep next).
  conv = C.choose(conv, 'act', h).conv;
  const fixed = { ...h, batteryOptimized: false };
  conv = C.returned(conv, fixed);
  assert.equal(conv.messages.filter((m) => m.kind === 'done').pop().key, 'rcv_ok_battery');
  assert.equal(conv.phase, 'summary');
  assert.deepEqual(C.fixChips(conv, fixed).map((x) => x.id), ['fix:deep_sleep', 'fix:channel_checkin']);
  // Still not OK → retry; "Pular este" goes back to the summary too.
  conv = C.choose(C.choose(conv, 'fix:channel_checkin', fixed).conv, 'act', fixed).conv;
  conv = C.returned(conv, fixed);
  assert.equal(conv.phase, 'retry');
  conv = C.choose(conv, 'skip', fixed).conv;
  assert.equal(conv.phase, 'summary');
  // Deep sleep: "Já conferi" → back to the summary, no more chip for it.
  conv = C.choose(conv, 'fix:deep_sleep', fixed).conv;
  r = C.choose(conv, 'checked', fixed);
  const checked = { ...fixed, deepSleepCheckedAt: NOW };
  conv = C.afterChecked(r.conv, checked);
  assert.equal(conv.phase, 'summary');
  assert.deepEqual(C.fixChips(conv, checked).map((x) => x.id), ['fix:channel_checkin']);
  // An item gone wrong while the summary was open (iPhone: notifications switched off) gets its chip.
  const ios = C.startConversation({ ...iphone, permission: 'granted' });
  assert.deepEqual(C.fixChips(ios, iphone).map((x) => x.id), ['fix:notifications']);
  const back = C.choose(ios, 'fix:notifications', iphone);
  assert.equal(back.conv.current, 'notifications');
  assert.equal(C.choose(back.conv, 'act', iphone).effect.ask, true);
  // The words in 6 languages; the screen draws the chips under the latest summary card.
  for (const l of LANGS) assert.ok(T[l].rcv_fix && T[l].rcv_fix.includes('{name}'), l);
  const src = read('components/ReminderConversation.js');
  assert.match(src, /C\.fixChips\(conv, health\)/);
});

// ── RS-10: iPhone ──────────────────────────────────────────────────────────────────────────────
test('RS-10: iPhone — notifications off: it starts on the notifications step (no opening) and ends on the summary; on: the summary', () => {
  let conv = C.startConversation(iphone);
  assert.equal(conv.phase, 'step');
  assert.equal(conv.current, 'notifications');
  assert.ok(!conv.messages.some((m) => m.key === 'rcv_intro_1'));
  assert.deepEqual(C.progress(conv), { n: 0, total: 1 });
  const r = C.choose(conv, 'act', iphone);
  assert.deepEqual([r.effect.fix, r.effect.ask], ['notifications', true], 'iOS asks once, then DoseTrace in the phone\'s Settings');
  conv = C.returned(r.conv, { ...iphone, permission: 'granted' });
  assert.equal(conv.phase, 'summary');
  assert.deepEqual(C.summaryRows({ ...iphone, permission: 'granted' }).map((x) => x.id), ['notifications']);
  assert.equal(C.startConversation({ ...iphone, permission: 'granted' }).phase, 'summary');
  assert.equal(C.startConversation({ ...iphone, permission: null }).phase, 'summary', 'unknown is never a step');
});

// ── RS-11: accessibility ───────────────────────────────────────────────────────────────────────
test('RS-11: bubbles read in order, chips are buttons with their labels, a new message is announced; text wraps, never cut', () => {
  const src = read('components/ReminderConversation.js');
  assert.match(src, /accessibilityRole="button"[^>]*accessibilityLabel=\{t\(chip\.key\)\}|accessibilityLabel=\{t\(chip\.key\)\}[^>]*accessibilityRole="button"/);
  assert.match(src, /AccessibilityInfo\.announceForAccessibility\(/);
  assert.doesNotMatch(src, /numberOfLines/, 'never cut');
  assert.match(src, /chips: \{[^}]*flexWrap: 'wrap'/);
  assert.match(src, /importantForAccessibility="no-hide-descendants"|accessibilityElementsHidden/, 'the mark is decoration');
  // The new lines to announce are the app's, in order (pure).
  const before = C.startConversation(fold);
  const after = C.choose(before, 'start', { ...fold, permission: 'granted' }).conv;
  const said = C.newSpoken(before, after).map((m) => m.key);
  assert.deepEqual(said, ['rcv_ok_notifications', 'rcv_why_alarms']);
});

// ── RS-12: texts ───────────────────────────────────────────────────────────────────────────────
const NEW_KEYS = ['rcv_title', 'rcv_progress', 'rcv_intro_1', 'rcv_intro_2', 'rcv_intro_2_one', 'rcv_start', 'rcv_allow', 'rcv_open_setting',
  'rcv_again', 'rcv_skip', 'rcv_finish', 'rcv_retry', 'rcv_battery_open', 'rcv_deep_sleep_path', 'rcv_check_on', 'rcv_check_off', 'rcv_check_deep_sleep',
  'rcv_all_set', 'rcv_some_left', 'rcv_some_left_one', 'rcv_next_line',
  ...['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'deep_sleep', 'channel_checkin', 'channel_vial'].map((i) => `rcv_why_${i}`),
  ...['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'channel_kind'].map((i) => `rcv_ok_${i}`),
  ...['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'channel_kind'].map((i) => `rcv_still_${i}`),
  ...['notifications', 'channel', 'alarms', 'battery', 'hibernation'].map((i) => `rcv_where_${i}`)];

test('RS-12: every new text in the 6 languages with the same placeholders', () => {
  for (const k of NEW_KEYS) {
    const ph = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
    for (const l of LANGS) {
      assert.ok(typeof T[l][k] === 'string' && T[l][k].trim(), `${l}.${k}`);
      assert.equal(ph(T[l][k]), ph(T.en[k]), `${l}.${k} placeholders`);
    }
  }
});

test('RS-12: Portuguese is the picture\'s, formal; one term per concept; Samsung\'s own names; no emoji', () => {
  assert.equal(T.pt.rcv_title, 'Lembretes');
  assert.equal(T.pt.rcv_progress, '{n} de {total}');
  for (const k of NEW_KEYS) for (const l of LANGS) {
    assert.doesNotMatch(T[l][k], /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${l}.${k}`);
  }
  for (const k of NEW_KEYS) assert.doesNotMatch(T.pt[k], /\b(a gente|dá para|deu para|pra)\b/i, `pt.${k} formal`);
  // The deep-sleep path is Samsung's words (samsungSettingNames.test.js).
  const limits = { en: 'Background usage limits', pt: 'Limites de uso em segundo plano', es: 'Límites de uso en segundo plano', fr: 'Limites utilisation arrière-plan', de: 'Grenzen der Hintergrundnutzung', it: 'Limiti per l’uso in background' };
  for (const l of LANGS) {
    assert.ok(T[l].rcv_deep_sleep_path.startsWith(limits[l]), l);
    assert.ok(T[l].rcv_deep_sleep_path.endsWith(T[l].rc_deep_sleep), l);
  }
  // The titles are today's row names.
  const h = { ...fold, doseChannelImportance: R.IMPORTANCE_NONE };
  const conv = C.choose(C.startConversation(h), 'start', h).conv;
  assert.equal(conv.messages.find((m) => m.item === 'notifications' && m.titleKey).titleKey, 'rc_notif');
  const tit = C.stepTitle('hibernation', fold);
  assert.equal(tit, 'rc_hibernation_samsung', 'Samsung\'s own name');
  assert.equal(C.stepTitle('hibernation', pixel), 'rc_hibernation');
});

test('RS-12: theme tokens only, no emoji, icons from the app set', () => {
  for (const f of ['components/ReminderConversation.js', 'screens/ReminderCheckScreen.js', 'lib/reminderConversation.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(s, /'white'|'black'|rgba\(/, f);
    assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${f}: no emoji`);
  }
  const { FEATURE_ICON_XML } = (() => { const src = read('components/featureIconsData.js'); return { FEATURE_ICON_XML: Object.fromEntries([...src.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => [m[1], 1])) }; })();
  for (const id of Object.keys(C.ITEM)) assert.ok(FEATURE_ICON_XML[C.ITEM[id].icon], `${id}: ${C.ITEM[id].icon}`);
});

// ── RS-13: the list is gone ────────────────────────────────────────────────────────────────────
test('RS-13: the old list is gone (rebuild = replace): no file, no import, no rendering path', () => {
  assert.equal(exists('components/ReminderSetupList.js'), false);
  for (const f of ['screens/ReminderCheckScreen.js', 'screens/OnboardingFlowScreen.js', 'screens/SettingsScreen.js', 'screens/TodayScreen.js', 'App.js']) {
    assert.doesNotMatch(read(f), /ReminderSetupList/, f);
  }
  assert.match(read('screens/ReminderCheckScreen.js'), /<ReminderConversation /);
});

test('the bold segments of a message (pure)', () => {
  const t = (k) => ({ x: 'Lá, toque em {battery} e escolha {unrestricted}.' })[k];
  assert.deepEqual(C.segments(t, 'x', { battery: 'Bateria', unrestricted: 'Sem restrições' }, ['battery', 'unrestricted']), [
    { text: 'Lá, toque em ', bold: false }, { text: 'Bateria', bold: true }, { text: ' e escolha ', bold: false }, { text: 'Sem restrições', bold: true }, { text: '.', bold: false },
  ]);
  assert.deepEqual(C.segments(t, 'x', { battery: 'B', unrestricted: 'U' }), [{ text: 'Lá, toque em B e escolha U.', bold: false }]);
});
