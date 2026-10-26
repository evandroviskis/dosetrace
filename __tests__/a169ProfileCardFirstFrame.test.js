'use strict';
// A-169 (found 2026-10-22 on the iPhone simulator): Settings' profile card showed "??" (placeholder
// initials) and "—" instead of the name for about a second on the first open after a cold start,
// until getCachedUser() answered. Now the card's first frame is drawn from the session the auth
// client already holds (lib/supabase peekCachedUser) and the shared Premium state; with nothing
// known yet it is the A-135 quiet skeleton (same bars, same pulse) — never "??" or a dash standing
// for a name. Once Settings' own reads settle, the card is exactly what it was before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));
const mod = () => require('../lib/profileCardFirst');

const USER = {
  id: 'u1',
  email: 'sam@example.com',
  user_metadata: { display_name: 'Sam Carter', primary_goal: 'body_composition,longevity' },
};

test('A-169: the pure first-frame rule exists', () => {
  assert.ok(exists('lib/profileCardFirst.js'), 'lib/profileCardFirst.js');
  const m = mod();
  assert.equal(typeof m.firstProfile, 'function');
  assert.equal(typeof m.profileCardView, 'function');
});

test('A-169: first frame WITH a cached session — the real name, email, goals and plan at once', () => {
  const { firstProfile, profileCardView } = mod();
  const f = firstProfile(USER, { uid: 'u1', known: true, premium: true });
  assert.equal(f.user, USER);
  assert.equal(f.displayName, 'Sam Carter');
  assert.deepEqual(f.primaryGoals, ['body_composition', 'longevity']);
  assert.equal(f.premium, true);
  assert.equal(f.premiumKnown, true);
  assert.equal(profileCardView({ loaded: false, user: f.user, premiumKnown: f.premiumKnown }), 'card');
  // The same values fetchUser() sets from the same user (no jump at the swap).
  const free = firstProfile(USER, { uid: 'u1', known: true, premium: false });
  assert.equal(free.premium, false);
  assert.equal(profileCardView({ loaded: false, user: free.user, premiumKnown: free.premiumKnown }), 'card');
});

test('A-169: first frame WITHOUT a cached session — the skeleton, never "??" or a dash', () => {
  const { firstProfile, profileCardView } = mod();
  for (const u of [null, undefined]) {
    const f = firstProfile(u, { uid: null, known: false, premium: false });
    assert.equal(f.user, null);
    assert.equal(f.displayName, '');
    assert.deepEqual(f.primaryGoals, []);
    assert.equal(profileCardView({ loaded: false, user: f.user, premiumKnown: f.premiumKnown }), 'skeleton');
  }
});

test('A-169: a plan not yet known for THIS user is never guessed ("Free plan" for a paying user)', () => {
  const { firstProfile, profileCardView } = mod();
  const unknown = firstProfile(USER, { uid: 'u1', known: false, premium: false });
  assert.equal(unknown.premiumKnown, false);
  assert.equal(profileCardView({ loaded: false, user: unknown.user, premiumKnown: unknown.premiumKnown }), 'skeleton');
  // Another account's answer never counts for this one.
  const other = firstProfile(USER, { uid: 'u2', known: true, premium: true });
  assert.equal(other.premiumKnown, false);
  assert.equal(other.premium, false);
  assert.equal(profileCardView({ loaded: false, user: other.user, premiumKnown: other.premiumKnown }), 'skeleton');
  assert.equal(firstProfile(USER, null).premiumKnown, false);
});

test('A-169: after load the card is the card, whatever was read (unchanged from before)', () => {
  const { profileCardView } = mod();
  assert.equal(profileCardView({ loaded: true, user: null, premiumKnown: false }), 'card');
  assert.equal(profileCardView({ loaded: true, user: USER, premiumKnown: false }), 'card');
  assert.equal(profileCardView({ loaded: true, user: USER, premiumKnown: true }), 'card');
});

test('A-169: missing metadata reads as empty, like fetchUser()', () => {
  const { firstProfile } = mod();
  const f = firstProfile({ id: 'u1', email: 'a@b.c' }, { uid: 'u1', known: true, premium: false });
  assert.equal(f.displayName, '');
  assert.deepEqual(f.primaryGoals, []);
  const g = firstProfile({ id: 'u1', user_metadata: { primary_goal: ',longevity,' } }, null);
  assert.deepEqual(g.primaryGoals, ['longevity']);
});

// ── the session cache: in memory, written from App.js's synchronous auth listener ────────────────
// (Review 2026-10-26: never an auth listener in lib/supabase — it loads headless and every
// registration refreshes an expired token; __tests__/a169NoHeadlessRefresh.test.js.)
test('A-169: lib/supabase keeps the session user in memory; App.js writes it from its synchronous listener', () => {
  const src = read('lib/supabase.js');
  assert.match(src, /export function peekCachedUser\(\)/, 'peekCachedUser exported');
  assert.match(src, /export function noteSessionUser\(u\) \{ knownUser_ = u \|\| null; \}/, 'a plain setter');
  const app = read('App.js');
  const i = app.indexOf('supabase.auth.onAuthStateChange((_event, session) => {');
  assert.ok(i > 0);
  assert.doesNotMatch(app.slice(i, i + 60), /async/, 'the callback is not async');
  // Every event (SIGNED_OUT included) replaces it, before any event filter: another account never
  // shows on the first frame.
  const head = app.slice(i, app.indexOf("if (_event === 'SIGNED_OUT')", i));
  assert.match(head, /noteSessionUser\(\(session && session\.user\) \|\| null\);/);
  assert.doesNotMatch(head, /await|\.then\(/, 'a plain variable write only (never deadlocks the session)');
});

// ── the screen ─────────────────────────────────────────────────────────────────────────────────
test('A-169: Settings starts from the cached session and the shared Premium state', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /peekCachedUser/, 'reads the session cache');
  assert.match(src, /getPremiumSnapshot/, 'reads the shared Premium state');
  assert.match(src, /firstProfile\(peekCachedUser\(\), getPremiumSnapshot\(\)\)/);
  assert.doesNotMatch(src, /const \[user, setUser\] = useState\(null\)/, 'never starts as no user');
  assert.doesNotMatch(src, /const \[displayName, setDisplayName\] = useState\(''\)/);
  assert.doesNotMatch(src, /const \[primaryGoals, setPrimaryGoals\] = useState\(\[\]\)/);
  assert.doesNotMatch(src, /const \[premium, setPremium\] = useState\(false\)/);
  assert.match(src, /profileCardView\(/, 'the pure rule decides card / skeleton');
});

test('A-169: the card is the skeleton until ready, and the loaded markup is unchanged', () => {
  const src = read('screens/SettingsScreen.js');
  const i = src.indexOf('function renderProfileCard()');
  assert.ok(i > 0);
  const fn = src.slice(i, src.indexOf('function renderPremiumCard()'));
  assert.match(fn, /if \(!cardReady\) return renderProfileSkeleton\(\);/);
  // The loaded card, as before.
  assert.match(fn, /<Text style=\{s\.avatarText\}>\{initials\}<\/Text>/);
  assert.match(fn, /\{displayName \? \(\s*<Text style=\{s\.profileName\}>\{displayName\}<\/Text>\s*\) : null\}/);
  assert.match(fn, /<Text style=\{s\.profileEmail\}>\{user\?\.email \|\| '—'\}<\/Text>/);
  assert.match(fn, /premium \? t\('paywall_premium'\) : t\('settings_free_plan'\)/);
  // Ready once Settings' reads settled (user + plan; the A-120 cap so a hung read never keeps it).
  assert.match(src, /whenAllSettled\(\[premiumRead\]\)\.then\(\(\) => setCardReady\(true\)\)/);
});

test('A-169: the skeleton reuses the A-135 pattern — its bars, dot and pulse, theme tokens only, no text', () => {
  const sk = read('screens/components/TodaySkeleton.js');
  assert.match(sk, /export function usePulse\(\)/);
  assert.match(sk, /export function Bar\(/);
  assert.match(sk, /export const Dot = /);
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /import \{ Bar, Dot, usePulse \} from '\.\/components\/TodaySkeleton';/);
  const i = src.indexOf('function renderProfileSkeleton()');
  assert.ok(i > 0, 'renderProfileSkeleton');
  const fn = src.slice(i, src.indexOf('function renderProfileCard()'));
  assert.match(fn, /style=\{s\.profileCard\}/, 'the real card, in its real colour');
  assert.match(fn, /<Dot size=\{56\} color=\{colors\.well\}/, 'the avatar as a quiet dot');
  assert.match(fn, /<Bar [^>]*color=\{colors\.well\}/, 'bars in c.well on the card');
  assert.doesNotMatch(fn, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/, 'theme tokens only');
  assert.doesNotMatch(fn, /\?\?|'—'|<Text/, 'no text, no "??", no dash');
  assert.match(fn, /accessibilityLabel=\{t\('loading'\)\}/, 'screen readers hear the app\'s "loading" once');
  assert.match(fn, /importantForAccessibility="no-hide-descendants"/);
  // The hook runs on every render, not only while the skeleton shows (rules of hooks).
  assert.match(src, /const profilePulse = usePulse\(\);/);
});
