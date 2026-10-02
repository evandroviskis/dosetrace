'use strict';
// S-26 book layout (docs/specs/book-layout.md, founder-signed 2026-10-01): the Settings tab.
// BK-7: left page = profile + the group list, right page = the chosen group (Preferences,
// the first group of the founder-approved prototype, by default — 2026-10-01; it was
// Notifications while Notifications was first). Phone and folded keep the collapsible list
// (BK-2), now as the prototype's group cards. Source tests over screens/SettingsScreen.js
// plus direct tests of its pure group rules. The prototype order itself is pinned in
// __tests__/settingsPrototypeOrder.test.js.
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
  return new Function(`${SRC.slice(a, b)}\nreturn { SETTINGS_GROUPS, bookGroup, foldCollapsed };`)();
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

test('BK-2: the phone path keeps the collapsible, remembered groups, in the prototype\'s order', () => {
  // Order changed 2026-10-01 to the founder-approved prototype (Preferences first; Recently
  // deleted moved to the Protocols list; Sign out / Delete account in their own card).
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.key), ['account', 'notifications', 'privacy', 'support']);
  assert.deepEqual(rules.SETTINGS_GROUPS.map((g) => g.labelKey),
    ['settings_preferences', 'settings_notifications', 'settings_data_privacy', 'settings_support']);
  // Title outside the scroll, profile, Premium, each group = one card (header + body when open),
  // the Sign out / Delete account card, version.
  assert.match(PHONE, /<Text style=\{s\.headerTitle\}>\{t\('settings_title'\)\}<\/Text>[\s\S]*<ScrollView ref=\{phoneScrollRef\}/);
  const order = ['renderProfileCard()', 'renderPremiumCard()', 'SETTINGS_GROUPS.map(g => renderGroupCard(g))', 'renderAccountActions()', 'renderVersionFooter()'];
  let at = -1;
  for (const piece of order) {
    const i = PHONE.indexOf(piece);
    assert.ok(i > at, `${piece} in order`);
    at = i;
  }
  assert.match(region('function renderGroupCard(g)', 'function renderAccountActions()'), /\{open && renderGroupBody\(g\.key\)\}/);
  // The open/closed state is still remembered under the same key, toggled by the header.
  assert.match(SRC, /const ALL_COLLAPSED = \{ account: true, notifications: true, privacy: true, support: true \};/);
  assert.match(region('function toggleSection(key)', 'function scrollToSection'), /AsyncStorage\.setItem\('dosetrace_settings_collapsed', JSON\.stringify\(next\)\)/);
  assert.match(region('function renderGroupCard(g)', 'function renderAccountActions()'), /onPress=\{\(\) => toggleSection\(g\.key\)\}/);
});

test('BK-7: Preferences is the default right page; an unknown choice falls back to it', () => {
  assert.match(SRC, /useBookSelection\('Settings', 'account'\)/);
  assert.equal(defaultSelection('Settings'), 'account', 'same default as the shared rules');
  assert.equal(rules.bookGroup(undefined), 'account');
  assert.equal(rules.bookGroup('nope'), 'account');
  assert.equal(rules.bookGroup('notifications'), 'notifications');
  assert.equal(rules.bookGroup('privacy'), 'privacy');
  assert.equal(rules.bookGroup('deleted'), 'account', 'Recently deleted is no longer a Settings group');
  assert.match(BOOK, /const open = bookGroup\(sel\);/);
});

test('BK-7: every group body, the profile, Premium and the version come from ONE render each, used by both layouts', () => {
  const bodies = { account: 'renderAccountBody', notifications: 'renderNotificationsBody', privacy: 'renderPrivacyBody', support: 'renderSupportBody' };
  const map = region('const GROUP_BODIES = {', '};');
  for (const [key, fn] of Object.entries(bodies)) {
    assert.equal(count(SRC, new RegExp(`function ${fn}\\(\\)`, 'g')), 1, `${fn} defined once`);
    assert.match(map, new RegExp(`${key}: ${fn},`), `${key} → ${fn}`);
  }
  for (const shared of ['renderProfileCard()', 'renderPremiumCard()', 'renderAccountActions()', 'renderVersionFooter()']) {
    assert.ok(PHONE.includes(shared), `phone uses ${shared}`);
    assert.ok(BOOK.includes(shared), `book uses ${shared}`);
  }
  // The group rows: the phone through its group card, the book's right page directly.
  assert.ok(PHONE.includes('renderGroupCard(g)'));
  assert.match(region('function renderGroupCard(g)', 'function renderAccountActions()'), /renderGroupBody\(g\.key\)/);
  assert.ok(BOOK.includes('renderGroupBody(open)'));
  // No group JSX is duplicated in either layout. The bodies are rows only; the phone puts
  // them in the group card (renderGroupCard), the book's right page in one plain group card.
  for (const [name, src] of [['phone', PHONE], ['book', BOOK]]) {
    assert.doesNotMatch(src, /toggleNotificationPref|handleSignOut|handleDeleteAccount|s\.profileCard|s\.premiumCard/, `${name} draws no group of its own`);
    assert.ok(src.includes('renderAccountActions()'), `${name} uses the one Sign out / Delete account card`);
  }
  assert.doesNotMatch(PHONE, /<View style=\{s\.group\}>/);
  assert.equal(count(BOOK, /<View style=\{s\.group\}>/g), 1);
  assert.match(BOOK, /<View style=\{s\.group\}>\{renderGroupBody\(open\)\}<\/View>/);
  // Each action is wired exactly once in the whole screen (Restore moved to the Protocols list).
  for (const action of ["toggleNotificationPref('dose_reminders'", 'onPress={handleSignOut}', 'onPress={handleDeleteAccount}', 'onPress={handleExportData}', 'setShowLanguagePicker(true)', 'setShowEditProfile(true)']) {
    assert.equal(SRC.split(action).length - 1, 1, `${action} wired once`);
  }
  // Premium stays for free users only.
  assert.match(region('function renderPremiumCard()', 'function renderVersionFooter()'), /if \(premium\) return null;/);
});

test('BK-7/BK-8: the left page lists the groups, the open one outlined in ink; the right page is that group, open, under its title', () => {
  assert.match(BOOK, /SETTINGS_GROUPS\.map\(g => \{/);
  assert.match(BOOK, /\{t\(g\.sumKey\)\}/, 'each group shows its summary on the left page too');
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
  const remembered = { account: true, notifications: true, privacy: false, support: true };
  const next = rules.foldCollapsed(remembered, { sel: 'account', explicit: true });
  assert.deepEqual(next, { account: false, notifications: true, privacy: false, support: true });
  assert.notEqual(next, remembered, 'a new object (state update)');
  assert.deepEqual(remembered.account, true, 'the input is not mutated');
  // A default nobody chose, an unknown key (incl. the old "deleted" group) or an already-open
  // group: unchanged.
  assert.equal(rules.foldCollapsed(remembered, { sel: 'notifications', explicit: false }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'nope', explicit: true }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'deleted', explicit: true }), remembered);
  assert.equal(rules.foldCollapsed(remembered, { sel: 'privacy', explicit: true }), remembered);
  // Wiring: on the book → one-column edge, a functional merge persisted under the same key.
  const eff = region('// BK-10, folding: the group the user had open', 'function scrollToSection(');
  assert.match(eff, /if \(wasBook\.current && !book\)/);
  assert.match(eff, /setCollapsed\(prev => \{\s*const next = foldCollapsed\(prev, \{ sel: target, explicit \}\);/);
  assert.match(eff, /AsyncStorage\.setItem\('dosetrace_settings_collapsed', JSON\.stringify\(next\)\)/);
  assert.match(eff, /scrollToSection\(target\)/, 'the list scrolls to the opened group');
  assert.match(region('function renderGroupCard(g)', 'function renderAccountActions()'), /onLayout=\{\(e\) => onSectionHeaderLayout\(g\.key, e\)\}/);
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
  const newLogic = [rulesSrc, region('// S-26 book layout: two pages', 'useFocusEffect('), PHONE, BOOK];
  for (const src of newLogic) {
    assert.doesNotMatch(src, /signOut|markIntentionalSignOut|clearLocalDatabase|executeAccountDeletion|finishAccountDeletion|delete-user|supabase|forceSync|stopSyncEngine|removePushToken|permanentlyDeleteProtocol/);
  }
  // The handlers are defined once and reached only from their own card (prototype: Sign out /
  // Delete account under the groups, no longer inside the Preferences group).
  for (const fn of ['async function handleSignOut()', 'function handleDeleteAccount()', 'async function executeAccountDeletion()', 'async function finishAccountDeletion()']) {
    assert.equal(SRC.split(fn).length - 1, 1, `${fn} once`);
  }
  const account = region('function renderAccountActions()', '// BK-2: one column');
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
