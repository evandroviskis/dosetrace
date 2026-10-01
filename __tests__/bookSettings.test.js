'use strict';
// S-26 book layout (docs/specs/book-layout.md, founder-signed 2026-10-01): the Settings tab.
// BK-7: left page = profile + the group list, right page = the chosen group (Notifications
// by default). Phone and folded keep today's collapsible list (BK-2). Source tests over
// screens/SettingsScreen.js plus direct tests of its pure group rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SettingsScreen.js'), 'utf8');
const { translations } = require('../i18n/translations.js');
const { defaultSelection } = require('../lib/bookLayout');

function region(start, end) {
  const a = SRC.indexOf(start);
  assert.ok(a >= 0, `missing: ${start}`);
  const b = SRC.indexOf(end, a + start.length);
  assert.ok(b > a, `missing after ${start}: ${end}`);
  return SRC.slice(a, b);
}
const count = (src, re) => (src.match(re) || []).length;

// The pure rules live at the top of the screen; load them without React Native.
const rules = (() => {
  const a = SRC.indexOf('const SETTINGS_GROUPS = [');
  const fold = SRC.indexOf('function foldCollapsed(');
  const b = SRC.indexOf('\n}\n', fold) + 3;
  assert.ok(a >= 0 && fold > a && b > fold, 'the pure group rules are one block');
  // eslint-disable-next-line no-new-func
  return new Function(`${SRC.slice(a, b)}\nreturn { SETTINGS_GROUPS, groupVisible, bookGroup, foldCollapsed };`)();
})();

const PHONE = region('function renderPhone()', 'function renderBook()');
const BOOK = region('function renderBook()', '  return (\n    <SafeAreaView style={s.container}>');
const MAIN = region('  return (\n    <SafeAreaView style={s.container}>', 'const makeStyles');
const GRAD = SRC.slice(SRC.indexOf('const settingsGraduated = (c) => ({'));

test('BK-1/BK-2: BookPanes renders only under `book`; one column renders the phone list', () => {
  assert.match(SRC, /import BookPanes, \{ useBook, useBookSelection \} from '\.\.\/components\/BookPanes'/);
  assert.match(SRC, /const book = useBook\(\);/);
  assert.match(MAIN, /\{book \? renderBook\(\) : renderPhone\(\)\}/);
  assert.equal(count(SRC, /<BookPanes\b/g), 1, 'one BookPanes');
  assert.match(BOOK, /<BookPanes left=\{left\} right=\{right\} rightKey=\{open\} \/>/);
  assert.doesNotMatch(PHONE, /BookPanes|select\(|bookGroup|bookNav/, 'the phone path knows nothing of the book');
});

test('BK-2: the phone path keeps today\'s collapsible, remembered groups in today\'s order', () => {
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.key), ['notifications', 'privacy', 'support', 'deleted', 'account']);
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.labelKey),
    ['settings_notifications', 'settings_data_privacy', 'settings_support', 'settings_recently_deleted', 'settings_account_prefs']);
  // Title outside the scroll, profile, Premium, each group = header + body when open, version.
  assert.match(PHONE, /<Text style=\{s\.headerTitle\}>\{t\('settings_title'\)\}<\/Text>[\s\S]*<ScrollView ref=\{phoneScrollRef\}/);
  const order = ['renderProfileCard()', 'renderPremiumCard()', 'renderSectionHeader(g.labelKey, g.key)', '!collapsed[g.key] && renderGroupBody(g.key)', 'renderVersionFooter()'];
  let at = -1;
  for (const piece of order) {
    const i = PHONE.indexOf(piece);
    assert.ok(i > at, `${piece} in order`);
    at = i;
  }
  assert.match(PHONE, /SETTINGS_GROUPS\.filter\(g => groupVisible\(g\.key, deletedProtocols\.length\)\)/);
  // The open/closed state is still remembered under the same key, toggled by the header.
  assert.match(SRC, /const ALL_COLLAPSED = \{ notifications: true, privacy: true, support: true, deleted: true, account: true \};/);
  assert.match(region('function toggleSection(key)', 'function renderSectionHeader'), /AsyncStorage\.setItem\('dosetrace_settings_collapsed', JSON\.stringify\(next\)\)/);
  assert.match(region('function renderSectionHeader(', 'useFocusEffect('), /onPress=\{\(\) => toggleSection\(sectionKey\)\}/);
  // Recently deleted only while something can be restored (as before).
  assert.equal(rules.groupVisible('deleted', 0), false);
  assert.equal(rules.groupVisible('deleted', 1), true);
  assert.equal(rules.groupVisible('account', 0), true);
});

test('BK-7: Notifications is the default right page; an unknown or hidden choice falls back to it', () => {
  assert.match(SRC, /useBookSelection\('Settings', 'notifications'\)/);
  assert.equal(defaultSelection('Settings'), 'notifications', 'same default as the shared rules');
  assert.equal(rules.bookGroup(undefined, 0), 'notifications');
  assert.equal(rules.bookGroup('nope', 3), 'notifications');
  assert.equal(rules.bookGroup('account', 0), 'account');
  assert.equal(rules.bookGroup('privacy', 0), 'privacy');
  assert.equal(rules.bookGroup('deleted', 2), 'deleted');
  assert.equal(rules.bookGroup('deleted', 0), 'notifications', 'the last deleted protocol was restored');
  assert.match(BOOK, /const open = bookGroup\(sel, deletedProtocols\.length\);/);
});

test('BK-7: every group body, the profile, Premium and the version come from ONE render each, used by both layouts', () => {
  const bodies = { notifications: 'renderNotificationsBody', privacy: 'renderPrivacyBody', support: 'renderSupportBody', deleted: 'renderDeletedBody', account: 'renderAccountBody' };
  const map = region('const GROUP_BODIES = {', '};');
  for (const [key, fn] of Object.entries(bodies)) {
    assert.equal(count(SRC, new RegExp(`function ${fn}\\(\\)`, 'g')), 1, `${fn} defined once`);
    assert.match(map, new RegExp(`${key}: ${fn},`), `${key} → ${fn}`);
  }
  for (const shared of ['renderGroupBody(', 'renderProfileCard()', 'renderPremiumCard()', 'renderVersionFooter()']) {
    assert.ok(PHONE.includes(shared), `phone uses ${shared}`);
    assert.ok(BOOK.includes(shared), `book uses ${shared}`);
  }
  // No group JSX is duplicated in either layout.
  for (const [name, src] of [['phone', PHONE], ['book', BOOK]]) {
    assert.doesNotMatch(src, /<View style=\{s\.group\}>|toggleNotificationPref|handleSignOut|handleDeleteAccount|s\.profileCard|s\.premiumCard/, `${name} draws no group of its own`);
  }
  // Each action is wired exactly once in the whole screen.
  for (const action of ["toggleNotificationPref('dose_reminders'", 'onPress={handleSignOut}', 'onPress={handleDeleteAccount}', 'onPress={handleExportData}', 'restoreProtocol(p.id)', 'setShowLanguagePicker(true)', 'setShowEditProfile(true)']) {
    assert.equal(SRC.split(action).length - 1, 1, `${action} wired once`);
  }
  // Premium stays for free users only.
  assert.match(region('function renderPremiumCard()', 'function renderVersionFooter()'), /if \(premium\) return null;/);
});

test('BK-7/BK-8: the left page lists the groups, the open one outlined in ink; the right page is that group, open, under its title', () => {
  assert.match(BOOK, /SETTINGS_GROUPS\.filter\(g => groupVisible\(g\.key, deletedProtocols\.length\)\)\.map/);
  assert.match(BOOK, /style=\{\[s\.bookNavRow, on && s\.bookNavRowOn\]\}/);
  assert.match(BOOK, /accessibilityState=\{\{ selected: on \}\}/);
  assert.match(BOOK, /onPress=\{\(\) => select\(g\.key\)\}/);
  assert.match(BOOK, /\{t\(g\.labelKey\)\}/);
  assert.match(BOOK, /<Text style=\{s\.rowArrow\}>›<\/Text>/, 'chevron');
  // Right page: always open (no collapsed check), heading = the group title.
  const right = BOOK.slice(BOOK.indexOf('const right = ('));
  assert.match(right, /<Text style=\{s\.bookPageTitle\}[^>]*>\{t\(openGroup\.labelKey\)\}<\/Text>/);
  assert.match(right, /\{renderGroupBody\(open\)\}/);
  assert.doesNotMatch(BOOK, /collapsed/);
  // Selection = 1.5 pt ink outline on raised (DESIGN.md), tokens only.
  assert.match(GRAD, /bookNavRow: \{[^}]*backgroundColor: c\.raised[^}]*borderWidth: 1\.5[^}]*borderColor: 'transparent'/);
  assert.match(GRAD, /bookNavRowOn: \{ borderColor: c\.ink \}/);
  assert.match(GRAD, /bookPageTitle: \{[^}]*color: c\.ink\b/);
});

test('BK-10: folding opens the group the user chose without touching the other remembered sections', () => {
  const remembered = { notifications: true, privacy: false, support: true, deleted: true, account: true };
  const next = rules.foldCollapsed(remembered, { sel: 'account', explicit: true, deletedCount: 0 });
  assert.deepEqual(next, { notifications: true, privacy: false, support: true, deleted: true, account: false });
  assert.notEqual(next, remembered, 'a new object (state update)');
  assert.deepEqual(remembered.account, true, 'the input is not mutated');
  // A default nobody chose, an unknown key, a hidden group or an already-open group: unchanged.
  assert.equal(rules.foldCollapsed(remembered, { sel: 'notifications', explicit: false, deletedCount: 0 }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'nope', explicit: true, deletedCount: 0 }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'deleted', explicit: true, deletedCount: 0 }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'privacy', explicit: true, deletedCount: 0 }), remembered);
  assert.deepEqual(rules.foldCollapsed(remembered, { sel: 'deleted', explicit: true, deletedCount: 2 }).deleted, false);
  // Wiring: on the book → one-column edge, a functional merge persisted under the same key.
  const eff = region('// BK-10, folding: the group the user had open', 'function scrollToSection(');
  assert.match(eff, /if \(wasBook\.current && !book\)/);
  assert.match(eff, /setCollapsed\(prev => \{\s*const next = foldCollapsed\(prev, \{ sel: target, explicit, deletedCount: deletedProtocols\.length \}\);/);
  assert.match(eff, /AsyncStorage\.setItem\('dosetrace_settings_collapsed', JSON\.stringify\(next\)\)/);
  assert.match(eff, /scrollToSection\(target\)/, 'the list scrolls to the opened group');
  assert.match(region('function renderSectionHeader(', 'useFocusEffect('), /onLayout=\{\(e\) => onSectionHeaderLayout\(sectionKey, e\)\}/);
  // Unfolding keeps the selection: nothing clears it.
  assert.doesNotMatch(SRC, /clearSelection|resetAllSelections/);
});

test('BK-10/BK-11: sheets live outside both layouts, so a fold or unfold keeps them open with what was typed', () => {
  const sheets = MAIN.slice(MAIN.indexOf('{book ? renderBook() : renderPhone()}'));
  for (const sheet of ['visible={showLanguagePicker}', 'visible={showEditProfile}', 'visible={showCountryPicker}', 'visible={showDisclaimer}', 'visible={showPrivacy}', 'visible={showTerms}']) {
    assert.ok(sheets.includes(sheet), `${sheet} after the layout switch`);
    assert.ok(!PHONE.includes(sheet) && !BOOK.includes(sheet), `${sheet} not inside a layout`);
  }
  // Nothing is keyed on the layout; typed profile values are screen state.
  assert.doesNotMatch(SRC, /key=\{book|key=\{String\(book/);
  assert.match(SRC, /const \[displayName, setDisplayName\] = useState\(''\);/);
  assert.match(SRC, /const \[countrySearch, setCountrySearch\] = useState\(''\);/);
  // Full-screen sheets keep one centred column (BK-11).
  assert.equal(count(SRC, /presentationStyle="pageSheet"/g), 3);
  assert.match(GRAD, /modalBody: \{[^}]*maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center'/);
});

test('Gate B source guard: no sign-out, delete or sync code in the new book logic', () => {
  const rulesSrc = SRC.slice(SRC.indexOf('const SETTINGS_GROUPS = ['), SRC.indexOf('export default function SettingsScreen'));
  const newLogic = [rulesSrc, region('// S-26 book layout: two pages', 'function renderSectionHeader('), PHONE, BOOK];
  for (const src of newLogic) {
    assert.doesNotMatch(src, /signOut|markIntentionalSignOut|clearLocalDatabase|executeAccountDeletion|finishAccountDeletion|delete-user|supabase|forceSync|stopSyncEngine|removePushToken|permanentlyDeleteProtocol/);
  }
  // The handlers are defined once and reached only from their Account rows.
  for (const fn of ['async function handleSignOut()', 'function handleDeleteAccount()', 'async function executeAccountDeletion()', 'async function finishAccountDeletion()']) {
    assert.equal(SRC.split(fn).length - 1, 1, `${fn} once`);
  }
  const account = region('function renderAccountBody()', 'const GROUP_BODIES');
  assert.match(account, /onPress=\{handleSignOut\}/);
  assert.match(account, /onPress=\{handleDeleteAccount\}/);
});

test('BK-9/BK-12: theme tokens only, no emoji, no new strings; the pages draw nothing in the gutter', () => {
  const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
  const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|'(white|black)'|rgba?\(/;
  for (const [name, src] of [['book page', BOOK], ['phone page', PHONE], ['book styles', GRAD.slice(GRAD.indexOf('bookNav:'), GRAD.indexOf('bookRightBody:') + 40)]]) {
    assert.doesNotMatch(src, EMOJI, `${name}: emoji`);
    assert.doesNotMatch(src, COLOR_LITERAL, `${name}: color literal`);
    assert.doesNotMatch(src, /position: 'absolute'/, `${name}: nothing placed over the fold`);
  }
  // Every literal string key used by Settings exists in all six languages.
  const keys = [...new Set([...SRC.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]))];
  assert.ok(keys.length > 50);
  for (const lang of Object.keys(translations)) {
    for (const k of keys) assert.ok(translations[lang][k], `${lang}.${k}`);
  }
  assert.equal(Object.keys(translations).length, 6);
});
