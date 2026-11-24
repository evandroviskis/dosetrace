'use strict';
// docs/specs/adherence-report.md AR-17..AR-21 (founder 2026-11-24): the profile name can be a nickname, and a
// report for a doctor never carries it. The profile keeps "Como você quer ser chamado ou chamada" (display_name,
// shown in the app) and gets an optional "Nome completo" (user_metadata key report_name, never full_name, which
// Google writes by itself). Both are read and written only through lib/profileName.js, so feat/profile-synced
// can move the storage underneath without touching the screens (coordination 2026-11-24).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('AR-18: getNickname / getReportName read the two names; report_name starts empty and is never display_name', () => {
  const { getNickname, getReportName, REPORT_NAME_KEY } = require('../lib/profileName');
  assert.equal(REPORT_NAME_KEY, 'report_name');
  const u = { email: 'a@b.c', user_metadata: { display_name: 'O brabo', full_name: 'Google Name' } };
  assert.equal(getNickname(u), 'O brabo');
  assert.equal(getReportName(u), '', 'never the nickname, never Google full_name, never the e-mail');
  assert.equal(getReportName({ user_metadata: { report_name: '  Marina Costa Silva ' } }), 'Marina Costa Silva');
  assert.equal(getReportName(null), '');
  assert.equal(getNickname(undefined), '');
});

test('AR-18: Edit profile sends report_name only when the person changed it (never clears it from an untouched field)', () => {
  const { reportNameFields, nicknameFields } = require('../lib/profileName');
  assert.deepEqual(reportNameFields('', ''), {});
  assert.deepEqual(reportNameFields('Marina Costa', 'Marina Costa'), {});
  assert.deepEqual(reportNameFields(' Marina Costa ', 'Marina Costa'), {});
  assert.deepEqual(reportNameFields('Marina Costa Silva', 'Marina Costa'), { report_name: 'Marina Costa Silva' });
  assert.deepEqual(reportNameFields('', 'Marina Costa'), { report_name: null }, 'erased by the person herself');
  assert.deepEqual(nicknameFields(' O brabo '), { display_name: 'O brabo' });
});

test('AR-17b: the nickname follows the full name with the first name — only an empty nickname, until she edits it', () => {
  const { firstNameOf, nicknameFollows, nicknameAfterFullName } = require('../lib/profileName');
  assert.equal(firstNameOf('Evandro Santos'), 'Evandro');
  assert.equal(firstNameOf('  Marina   Costa Silva '), 'Marina');
  assert.equal(firstNameOf(''), '');
  assert.equal(firstNameOf(null), '');
  // a new profile (no nickname yet): follows while she types the full name
  assert.equal(nicknameFollows(''), true);
  let following = nicknameFollows('');
  let nick = '';
  for (const typed of ['E', 'Evandro', 'Evandro ', 'Evandro Santos']) nick = nicknameAfterFullName({ following, nickname: nick, fullName: typed });
  assert.equal(nick, 'Evandro');
  // she edits the nickname herself → it stops following
  following = false; nick = 'Vando';
  assert.equal(nicknameAfterFullName({ following, nickname: nick, fullName: 'Evandro Santos Silva' }), 'Vando');
  // an existing nickname is never rewritten by typing a full name
  assert.equal(nicknameFollows('O brabo'), false);
  assert.equal(nicknameAfterFullName({ following: nicknameFollows('O brabo'), nickname: 'O brabo', fullName: 'Evandro Santos' }), 'O brabo');
});

test('AR-17b: Edit profile wires the follow: the full-name field fills the nickname, editing the nickname stops it', () => {
  const s = read('screens/SettingsScreen.js');
  assert.match(s, /nicknameFollowsRef\.current = nicknameFollows\(/);
  assert.match(s, /onChangeText=\{onFullNameChange\}/);
  assert.match(s, /onChangeText=\{onNicknameChange\}/);
  const full = s.slice(s.indexOf('function onFullNameChange'), s.indexOf('function onFullNameChange') + 400);
  assert.match(full, /nicknameAfterFullName\(/);
  assert.match(full, /setNicknameAuto\(/);
  const nick = s.slice(s.indexOf('function onNicknameChange'), s.indexOf('function onNicknameChange') + 300);
  assert.match(nick, /nicknameFollowsRef\.current = false/);
  assert.match(nick, /setNicknameAuto\(false\)/);
});

test('AR-18/AR-19: saveReportName sends ONLY report_name (a merge write), trimmed; an empty name writes nothing', async () => {
  const { saveReportName } = require('../lib/profileName');
  const sent = [];
  const updateUser = async (data) => { sent.push(data); return { data: { user: { user_metadata: { display_name: 'x', report_name: data.report_name } } }, error: null }; };
  const r = await saveReportName('  Marina Costa Silva ', { updateUser });
  assert.deepEqual(sent, [{ report_name: 'Marina Costa Silva' }]);
  assert.equal(r.ok, true);
  assert.deepEqual(await saveReportName('   ', { updateUser }), { ok: false });
  assert.equal(sent.length, 1);
  // refused (offline): resolves { error } → not ok, never throws
  const refused = await saveReportName('Ana', { updateUser: async () => ({ error: new Error('offline') }) });
  assert.equal(refused.ok, false);
  const thrown = await saveReportName('Ana', { updateUser: async () => { throw new Error('x'); } });
  assert.equal(thrown.ok, false);
});

test('AR-18: never filled from Apple or Google, never written as full_name', () => {
  const sb = read('lib/supabase.js');
  assert.doesNotMatch(sb, /report_name/);
  for (const f of ['screens/SettingsScreen.js', 'screens/BodyScreen.js', 'lib/profileName.js']) assert.doesNotMatch(read(f), /full_name\s*:/, f);
});

test('AR-18: the screens touch the names only through lib/profileName (no user_metadata.display_name / report_name in screens)', () => {
  for (const f of ['screens/SettingsScreen.js', 'screens/BodyScreen.js', 'screens/TodayScreen.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /\.display_name\b|\.report_name\b|display_name:|report_name:/, f);
  }
  const s = read('screens/SettingsScreen.js');
  assert.match(s, /getNickname\(/);
  assert.match(s, /getReportName\(/);
  assert.match(s, /\.\.\.nicknameFields\(displayName\)/);
  assert.match(s, /\.\.\.reportNameFields\(reportName, loadedReportName\.current\)/);
});

test('AR-17: Edit profile shows the nickname with "Aparece no app." and the optional full name with its hint', () => {
  const s = read('screens/SettingsScreen.js');
  const ep = s.slice(s.indexOf('{/* EDIT PROFILE MODAL */}'), s.indexOf("t('profile_birth_month')}</Text>", s.indexOf('{/* EDIT PROFILE MODAL */}')));
  for (const k of ['profile_nickname', 'profile_nickname_hint', 'profile_report_name', 'profile_report_name_placeholder', 'profile_report_name_hint']) assert.ok(ep.includes(`t('${k}')`), k);
  // Founder 2026-11-24: "Nome completo" first, then the nickname.
  assert.ok(ep.indexOf("t('profile_report_name')") < ep.indexOf("t('profile_nickname')"), 'full name first');
  assert.equal(translations.pt.profile_nickname, 'Como você quer ser chamado ou chamada');
  assert.equal(translations.en.profile_nickname, 'What should we call you?');
  assert.equal(translations.es.profile_nickname, '¿Cómo quieres que te llamemos?');
  assert.equal(translations.fr.profile_nickname, 'Comment souhaitez-vous être appelé(e) ?');
  assert.equal(translations.de.profile_nickname, 'Wie möchtest du genannt werden?');
  assert.equal(translations.it.profile_nickname, 'Come vuoi essere chiamato o chiamata?');
  // Founder 2026-11-24 (picture 19a9d92f, chair): the newer copy.
  assert.equal(translations.pt.profile_nickname_hint, 'É o nome que aparece no app.');
  assert.equal(translations.pt.profile_report_name, 'Nome completo (opcional)');
  assert.equal(translations.pt.profile_report_name_hint, 'Aparece só nos relatórios que você exportar para enviar a alguém, como o Relatório de adesão. Nunca aparece no app.');
  assert.equal(translations.pt.profile_nickname_autofill, 'Preenchido com o seu primeiro nome. Você pode apagar e escrever um apelido.');
  for (const l of LANGS) assert.ok(translations[l].profile_nickname_autofill, l);
  // the auto-fill line replaces the hint while the nickname holds what the auto-fill wrote
  assert.match(ep, /nicknameAuto \? t\('profile_nickname_autofill'\) : t\('profile_nickname_hint'\)/);
  // the full name is optional: not in the required list
  const save = s.slice(s.indexOf('async function saveProfile'), s.indexOf('const profileData'));
  assert.doesNotMatch(save, /report_name|reportName/);
});

test('AR-19: the sheet before a report without a full name — two steps, the save, then the report', async () => {
  const { reportNameSheet } = require('../lib/reportNameSheet');
  const t = (k) => translations.pt[k];
  const shown = [];
  const generated = [];
  const saved = [];
  const ask = reportNameSheet({ t, show: (c) => shown.push(c), onGenerate: (n) => generated.push(n), onSave: async (n) => { saved.push(n); return { ok: true }; } });
  assert.equal(ask.title, 'O relatório vai sem o seu nome');
  assert.equal(ask.body, 'Você ainda não informou o seu nome completo. O nome que aparece no app nunca entra no relatório. Para quem receber saber de quem é, adicione o seu nome completo.');
  const byLabel = (c, l) => c.buttons.find((b) => b.label === l);
  assert.equal(byLabel(ask, 'Adicionar meu nome').kind, 'primary');
  // "Gerar sem nome" → the report with no name
  byLabel(ask, 'Gerar sem nome').onPress();
  assert.deepEqual(generated, [null]);
  // "Adicionar meu nome" → the field step
  byLabel(ask, 'Adicionar meu nome').onPress();
  const add = shown[0];
  assert.equal(add.title, 'Seu nome completo');
  assert.ok(add.input);
  assert.equal(add.hint, 'Fica salvo no seu perfil e aparece só nos relatórios que você exportar. Você pode mudar em Editar perfil.');
  const gen = byLabel(add, 'Gerar relatório');
  assert.equal(gen.needsInput, true, 'only with a name typed');
  await gen.onPress('  Marina Costa Silva ');
  assert.deepEqual(saved, ['Marina Costa Silva']);
  assert.deepEqual(generated, [null, 'Marina Costa Silva']);
  // "Voltar" → the first sheet again
  byLabel(add, 'Voltar').onPress();
  assert.equal(shown[1], ask);
  // a refused save still makes the report with the typed name (what she typed is not lost)
  const g2 = [];
  const ask2 = reportNameSheet({ t, show: (c) => shown.push(c), onGenerate: (n) => g2.push(n), onSave: async () => ({ ok: false }) });
  byLabel(ask2, 'Adicionar meu nome').onPress();
  await byLabel(shown[shown.length - 1], 'Gerar relatório').onPress('Ana');
  assert.deepEqual(g2, ['Ana']);
});

test('AR-19: DTSheet holds a text field when a config asks for one; a needsInput button stays off while it is empty', () => {
  const s = read('screens/components/ProtocolParts.js');
  const fn = s.slice(s.indexOf('export function DTSheet'), s.indexOf('export function DTActionSheet'));
  assert.match(fn, /shown\.input \? \(/);
  assert.match(fn, /<TextInput/);
  assert.match(fn, /b\.needsInput && !String\(inputValue\)\.trim\(\)/);
  assert.match(fn, /KeyboardAvoidingView/);
  assert.match(fn, /placeholderTextColor=\{c\.ink3\}/);
});

test('AR-19: Settings asks before a report without a full name, and with one goes straight on', () => {
  const s = read('screens/SettingsScreen.js');
  const fn = s.slice(s.indexOf('async function handleAdherenceReport'), s.indexOf('async function makeAdherenceReport'));
  assert.match(fn, /getReportName\(user\)/);
  assert.match(fn, /reportNameSheet\(/);
  assert.match(fn, /saveReportName/);
  // Sync now rebuilds with the same name, never asks again
  const sync = s.slice(s.indexOf('async function reportSyncNow'), s.indexOf('async function reportSyncNow') + 500);
  assert.match(sync, /makeAdherenceReport\(reportNameRef\.current\)/);
});

test('AR-20: the labs / vaccines PDF carries the full name in its header, with the same sheet first', () => {
  const { buildRecordsHTML } = require('../lib/exportRecords');
  const labels = { labsHeading: 'L', vaccinesHeading: 'V', colDate: 'D', colMarker: 'M', colValue: 'V', colUnit: 'U', colVaccine: 'V', colGiven: 'G', colNextDue: 'N', colNotes: 'N', noLabs: '-', noVaccines: '-' };
  const base = { labels, title: 'Exames', exportedOn: 'Exportado em 24/11/2026', disclaimer: 'x' };
  const withName = buildRecordsHTML({ biomarkers: [], vaccines: [] }, { ...base, nameLine: 'Nome: Ana <Silva>' });
  assert.ok(withName.includes('<div class="name">Nome: Ana &lt;Silva&gt;</div>'));
  const without = buildRecordsHTML({ biomarkers: [], vaccines: [] }, base);
  assert.doesNotMatch(without, /class="name"/);
  const b = read('screens/BodyScreen.js');
  const ex = b.slice(b.indexOf('async function doExport'), b.indexOf('function formatDate(dateStr)'));
  assert.match(ex, /getReportName\(/);
  assert.match(ex, /reportNameSheet\(/);
  assert.match(ex, /nameLine:/);
  // the CSV does not change
  assert.doesNotMatch(ex.slice(ex.indexOf("if (kind === 'csv')"), ex.indexOf('} else {', ex.indexOf("if (kind === 'csv')"))), /nameLine/);
});

test('AR-21: Download my data keeps both names under their own keys', () => {
  const { profileForExport } = require('../lib/exportFile');
  const p = profileForExport({ user_metadata: { display_name: 'O brabo', report_name: 'Marina Costa Silva', gender: 'f' } });
  assert.equal(p.display_name, 'O brabo');
  assert.equal(p.report_name, 'Marina Costa Silva');
});

test('AR-24: the name sheet and profile strings in 6 languages; fr vous, pt formal', () => {
  const keys = ['profile_nickname', 'profile_nickname_hint', 'profile_report_name', 'profile_report_name_placeholder', 'profile_report_name_hint', 'report_name_sheet_title', 'report_name_sheet_body', 'report_name_add', 'report_name_skip', 'report_name_field_title', 'report_name_field_hint', 'report_name_generate'];
  for (const l of LANGS) for (const k of keys) assert.ok(translations[l][k], `${l}.${k}`);
  assert.match(translations.fr.report_name_sheet_body, /\bvous\b|\bVous\b|votre/);
});
