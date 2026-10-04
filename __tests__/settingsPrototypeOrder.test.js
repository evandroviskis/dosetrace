'use strict';
// Settings follows the founder-approved Graduated prototype again (founder 2026-10-01: "A tela
// dos settings mudou a sequência novamente e está diferente do protótipo que aprovei no
// redesign"). docs/design/prototype.html settingsScreen(), DESIGN.md "Settings part 1":
//   title → profile → Upgrade (free only) → four group cards, each = name + a one-line summary
//   + a round arrow, rows inside the same card when open (Preferences, Notifications, Data &
//   privacy, Support) → a separate card with Sign out then Delete account → version.
// "Recently deleted" is not in Settings: it sits at the bottom of the Protocols list (phone and
// book), with the restore / delete-forever logic MOVED there (rebuild = replace), and the
// protocol delete confirmation points at it instead of at Settings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const SET = read('screens', 'SettingsScreen.js');
const PRO = read('screens', 'ProtocolsScreen.js');
const { translations } = require('../i18n/translations.js');
const { defaultSelection } = require('../lib/bookLayout');

function region(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, `missing: ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, `missing after ${start}: ${end}`);
  return src.slice(a, b);
}
function inOrder(src, pieces, what) {
  let at = -1;
  for (const p of pieces) {
    const i = src.indexOf(p, at + 1);
    assert.ok(i > at, `${what}: "${p}" must come after the previous piece`);
    at = i;
  }
}

// The pure group rules sit at the top of the Settings screen; load them without React Native.
const rules = (() => {
  const a = SET.indexOf('const SETTINGS_GROUPS = [');
  const fold = SET.indexOf('function foldCollapsed(');
  const b = SET.indexOf('\n}\n', fold) + 3;
  assert.ok(a >= 0 && fold > a && b > fold, 'the pure group rules are one block');
  // eslint-disable-next-line no-new-func
  return new Function(`${SET.slice(a, b)}\nreturn { SETTINGS_GROUPS, bookGroup, foldCollapsed };`)();
})();

const PHONE = region(SET, 'function renderPhone()', 'function renderBook()');
const BOOK = region(SET, 'function renderBook()', '  return (\n    <SafeAreaView style={s.container}>');

test('Settings groups: Preferences, Notifications, Data & privacy, Support — each with its one-line summary', () => {
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.key), ['account', 'notifications', 'privacy', 'support']);
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.labelKey),
    ['settings_preferences', 'settings_notifications', 'settings_data_privacy', 'settings_support']);
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.sumKey),
    ['settings_sum_prefs', 'settings_sum_notif', 'settings_sum_privacy', 'settings_sum_support']);
  const en = translations.en;
  assert.equal(en.settings_preferences, 'Preferences');
  assert.equal(en.settings_sum_prefs, 'Appearance, time format, language');
  assert.equal(en.settings_sum_notif, 'Reminders, alerts, silent mode');
  assert.equal(en.settings_sum_privacy, 'Legal, analytics, your data');
  assert.equal(en.settings_sum_support, 'FAQ, contact, rate');
  for (const lang of Object.keys(translations)) {
    for (const k of ['settings_preferences', 'settings_sum_prefs', 'settings_sum_notif', 'settings_sum_privacy', 'settings_sum_support']) {
      assert.ok(translations[lang][k], `${lang}.${k}`);
      if (lang !== 'en' && k !== 'settings_sum_support') assert.notEqual(translations[lang][k], en[k], `${lang}.${k} is translated`);
    }
    // A group inside Settings is not called "Settings".
    assert.notEqual(translations[lang].settings_preferences, translations[lang].settings_title, `${lang}: Preferences ≠ the screen title`);
  }
});

test('phone order: title → profile → Premium → the four group cards → Sign out / Delete account card → version', () => {
  inOrder(PHONE, [
    "{t('settings_title')}",
    'renderProfileCard()',
    'renderPremiumCard()',
    'SETTINGS_GROUPS.map(g => renderGroupCard(g))',
    'renderAccountActions()',
    'renderVersionFooter()',
  ], 'phone');
  // Every group is shown (nothing hides a group any more) and Premium stays free-only.
  assert.doesNotMatch(PHONE, /SETTINGS_GROUPS\.filter/);
  assert.match(region(SET, 'function renderPremiumCard()', 'function renderVersionFooter()'), /if \(premium\) return null;/);
});

test('a group card = name + summary + a round arrow in one card; the rows open inside the same card', () => {
  const card = region(SET, 'function renderGroupCard(g)', '\n  }\n');
  assert.match(card, /<View key=\{g\.key\} style=\{s\.setCard\}>/, 'one card per group');
  assert.match(card, /onPress=\{\(\) => toggleSection\(g\.key\)\}/);
  assert.match(card, /accessibilityState=\{\{ expanded: open \}\}/);
  inOrder(card, ['{t(g.labelKey)}', '{t(g.sumKey)}', 'style={s.setChev}', "<GroupChevron dir={open ? 'up' : 'down'}", 'open && renderGroupBody(g.key)'], 'group card');
  // Still remembered open/closed under the same key, all closed at first; no "deleted" group.
  assert.match(SET, /const ALL_COLLAPSED = \{ account: true, notifications: true, privacy: true, support: true \};/);
  assert.match(region(SET, 'function toggleSection(key)', 'function scrollToSection'), /AsyncStorage\.setItem\('dosetrace_settings_collapsed', JSON\.stringify\(next\)\)/);
  // Prototype .setcard / .setchev: raised card, the arrow in a round well, ink. Tokens only.
  const g = SET.slice(SET.indexOf('const settingsGraduated = (c) => ({'));
  assert.match(g, /setCard: \{[^}]*backgroundColor: c\.raised[^}]*borderRadius: 22/);
  assert.match(g, /setChev: \{[^}]*width: 36[^}]*height: 36[^}]*borderRadius: 18[^}]*backgroundColor: c\.well/);
  assert.match(g, /setSum: \{[^}]*color: c\.ink2/);
  assert.match(SET, /function GroupChevron\(\{ dir, color \}\)/);
  assert.match(card, /<GroupChevron dir=\{open \? 'up' : 'down'\} color=\{colors\.ink\} \/>/);
});

test('Sign out and Delete account sit in their own card, outside every group (Sign out first, Delete in the danger color)', () => {
  const actions = region(SET, 'function renderAccountActions()', '\n  }\n');
  inOrder(actions, ['onPress={handleSignOut}', "t('settings_signout')", 'onPress={handleDeleteAccount}', "t('settings_delete')"], 'actions card');
  assert.match(actions, /<FeatureIcon name="trash" size=\{28\} color=\{colors\.risk\} \/>/);
  assert.match(actions, /color: colors\.risk/);
  const bodies = region(SET, 'function renderAccountBody()', 'const GROUP_BODIES');
  const allBodies = region(SET, 'function renderNotificationsBody()', 'const GROUP_BODIES');
  for (const src of [bodies, allBodies]) {
    assert.doesNotMatch(src, /handleSignOut|handleDeleteAccount|settings_signout|'settings_delete'/, 'no group holds Sign out / Delete account');
  }
  // Each wired exactly once in the whole screen; the book's left page shows the same card.
  assert.equal(SET.split('onPress={handleSignOut}').length - 1, 1);
  assert.equal(SET.split('onPress={handleDeleteAccount}').length - 1, 1);
  inOrder(BOOK, ['renderProfileCard()', 'renderPremiumCard()', 'SETTINGS_GROUPS.map(g =>', 'renderAccountActions()', 'renderVersionFooter()'], 'book left page');
});

test('no "Recently deleted" group in Settings any more (rebuild = replace)', () => {
  for (const gone of ['deletedProtocols', 'fetchDeletedProtocols', 'restoreProtocol', 'confirmPermanentDelete',
    'permanentlyDeleteProtocol', 'getDeletedProtocols', 'renderDeletedBody', 'settings_recently_deleted', 'settings_account_prefs', "'deleted'"]) {
    assert.ok(!SET.includes(gone), `Settings still mentions ${gone}`);
  }
  for (const lang of Object.keys(translations)) {
    assert.equal(translations[lang].settings_recently_deleted, undefined, `${lang}: unused key removed`);
    assert.equal(translations[lang].settings_account_prefs, undefined, `${lang}: unused key removed`);
  }
});

test('book: the default right page is Preferences (first group); an unknown choice falls back to it; BK-10 fold keeps working', () => {
  assert.match(SET, /useBookSelection\('Settings', 'account'\)/);
  assert.equal(defaultSelection('Settings'), 'account');
  assert.equal(rules.bookGroup(undefined), 'account');
  assert.equal(rules.bookGroup('nope'), 'account');
  assert.equal(rules.bookGroup('deleted'), 'account', 'the old Recently deleted group is gone');
  assert.equal(rules.bookGroup('support'), 'support');
  const remembered = { account: true, notifications: false, privacy: true, support: true };
  assert.deepEqual(rules.foldCollapsed(remembered, { sel: 'support', explicit: true }),
    { account: true, notifications: false, privacy: true, support: false });
  assert.equal(rules.foldCollapsed(remembered, { sel: 'account', explicit: false }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'deleted', explicit: true }), remembered);
});

// ── Protocols: Recently deleted at the bottom of the list ─────────────────────────────
const ast = parse(PRO, { sourceType: 'module', plugins: ['jsx'] });
const slice = (n) => PRO.slice(n.start, n.end);
function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn));
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
const screen = ast.program.body.find((n) => n.type === 'ExportDefaultDeclaration').declaration;
function innerFn(name) {
  const found = [];
  walk(screen, (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) found.push(n); });
  assert.equal(found.length, 1, `${name} defined once in ProtocolsScreen`);
  return slice(found[0]);
}

test('Protocols list: a "Recently deleted" section at the bottom, only when something was deleted (phone list and book left page)', () => {
  const sec = region(PRO, 'const deletedSection = ', '\n  );\n');
  assert.match(sec, /deletedProtocols\.length > 0 \?/, 'shown only when something is deleted');
  inOrder(sec, [
    "{t('protocols_recently_deleted')}",
    'deletedProtocols.map(',
    'backgroundColor: displayColor(p.color) || colors.ink3',
    'protocolName(p)',
    'deletedAgo(p)', // t('protocols_deleted_ago') (multi-select 2026-10-03: shared by both row kinds)
    'onPress={() => restoreProtocol(p.id)}',
    "{t('protocols_restore')}",
    'onPress={() => confirmPermanentDelete(p)}',
    "accessibilityLabel={t('settings_delete_forever')}",
    '<FeatureIcon name="trash" size={22} color={colors.risk} />',
  ], 'Recently deleted row');
  // Phone: after the cards in the list (and under the empty state when no protocol is left).
  const phone = PRO.slice(PRO.indexOf('{view === \'list\' && protocols.length > 0 && listCards}'));
  assert.ok(phone.indexOf('deletedSection') > 0 && phone.indexOf('deletedSection') < phone.indexOf("{view === 'detail' && renderDetail(openProtocol, false)}"),
    'phone: Recently deleted right after the list cards');
  assert.match(PRO, /\{\(view === 'list' \|\| \(view === 'heroes' && protocols\.length === 0\)\) && deletedSection\}/);
  // Book: the left page ends with it.
  const left = region(PRO, 'left={', 'right={');
  inOrder(left, ['{protocols.length > 0 && listCards}', '{deletedSection}'], 'book left page');
  // Loaded with the list (focus, after a delete, after a restore).
  assert.match(innerFn('fetchProtocols'), /fetchDeletedProtocols\(\)/);
  assert.match(innerFn('fetchDeletedProtocols'), /setDeletedProtocols\(getDeletedProtocols\(u\.id\) \|\| \[\]\)/);
  // Tokens only in the new section and its styles.
  const styles = region(PRO, '  delList:', 'deleteForeverBtn:');
  for (const src of [sec, styles]) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u);
  }
});

test('Protocols: Restore and Delete forever are the functions moved from Settings, and they still do what they did', async () => {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  let sheet = null;
  const make = new Function(
    'restoreProtocolDB', 'getNewestVialForProtocol', 'updateVial', 'getProtocolById', 'scheduleDoseReminder',
    'fetchProtocols', 'notifyDataChanged', 'requestSync', 'permanentlyDeleteProtocol', 'setScreenSheet', 't', 'protocolName',
    'T', 'cancelDoseReminder', 'dismissDeliveredDoseReminders', 'setTrashSel', 'isOverFreeLimit',
    `${innerFn('restoreProtocol')}\n${innerFn('confirmPermanentDelete')}\n${innerFn('confirmPurge')}\nreturn { restoreProtocol, confirmPermanentDelete };`,
  );
  const f = make(
    (...a) => { calls.push(['restoreDB', ...a]); return 'active'; }, (id) => (id === 7 ? { id: 70 } : null), rec('updateVial'), (id) => ({ id, name: 'BPC-157' }),
    (p) => { calls.push(['schedule', p.id]); return Promise.resolve(); },
    rec('fetchProtocols'), rec('notify'), rec('requestSync'), rec('permanentDelete'), (cfg) => { sheet = cfg; },
    (k) => ({ protocols_purge_title_single: 'Delete this protocol forever?', protocols_purge_body_single: 'Its dose history, vials and reminders are removed from all your devices.', settings_delete_forever: 'Delete forever', cancel: 'Cancel' }[k] || k),
    (p) => p.name,
    require('../lib/trashSelection'),
    (id) => { calls.push(['cancelReminders', id]); return Promise.resolve(); },
    (id) => { calls.push(['dismissBanners', id]); return Promise.resolve(); },
    (v) => calls.push(['setTrashSel', v]),
    async () => false, // under the free limit (A-89)
  );
  await f.restoreProtocol(7);
  assert.deepEqual(calls, [['restoreDB', 7, { allowActive: true }], ['updateVial', 70, { active: 1 }], ['schedule', 7], ['fetchProtocols'], ['notify', 'protocol'], ['requestSync']]);
  calls.length = 0;
  f.confirmPermanentDelete({ id: 9, name: 'TB-500' });
  assert.equal(calls.length, 0, 'nothing is deleted before the confirm');
  // Since 2026-10-03 the single trash uses the multi-select sheet for one protocol (the purge
  // also removes its dose history and vials everywhere — trashPurge.test.js).
  assert.equal(sheet.title, 'Delete this protocol forever?');
  assert.equal(sheet.body, 'Its dose history, vials and reminders are removed from all your devices.');
  assert.deepEqual(sheet.buttons.map((b) => [b.label, b.kind]), [['Cancel', 'secondary'], ['Delete forever', 'danger']]);
  sheet.buttons[1].onPress();
  assert.deepEqual(calls, [['permanentDelete', 9], ['cancelReminders', 9], ['dismissBanners', 9], ['setTrashSel', null], ['fetchProtocols'], ['notify', 'protocol'], ['requestSync']]);
  // The database functions come from lib/database (one implementation, now used here only).
  assert.match(PRO, /restoreProtocol as restoreProtocolDB/);
  assert.match(PRO, /\bgetDeletedProtocols\b/);
  assert.match(PRO, /\bpermanentlyDeleteProtocol\b/);
});

test('protocol delete confirmation: recoverable for 7 days from Recently deleted, at the bottom of the list (not "from Settings")', () => {
  assert.match(innerFn('deleteProtocol'), /body: t\('protocols_delete_confirm_settings'\)/);
  assert.equal(translations.en.protocols_delete_confirm_settings,
    'This protocol will be recoverable for 7 days from Recently deleted, at the bottom of your list.');
  for (const lang of Object.keys(translations)) {
    const v = translations[lang].protocols_delete_confirm_settings;
    assert.ok(v && /7/.test(v), `${lang}: keeps the 7 days`);
    assert.ok(!v.includes(translations[lang].settings_title), `${lang}: no longer sends the user to Settings`);
    assert.ok(v.includes(translations[lang].protocols_recently_deleted), `${lang}: names the section heading`);
  }
});
