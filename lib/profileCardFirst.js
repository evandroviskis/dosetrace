'use strict';
// A-169 (found 2026-10-22): Settings' profile card on its first frame. It showed "??" and "—" for
// about a second after a cold start, until getCachedUser() answered. Now the first frame is drawn
// from the session the auth client already holds (lib/supabase peekCachedUser) and the shared
// Premium state (lib/premiumState) — the same values fetchUser() then sets, so nothing jumps. With
// either unknown, the card is the A-135 quiet skeleton: never "??", a dash for a name, or a guessed
// plan. Pure (runs under node --test).

// The profile fields the card shows, read the way SettingsScreen fetchUser() reads them.
function profileFields(user) {
  const m = (user && user.user_metadata) || {};
  const pg = m.primary_goal || '';
  return { displayName: m.display_name || '', primaryGoals: pg ? pg.split(',').filter(Boolean) : [] };
}

// user: the cached session user (or null); snap: lib/premiumState's snapshot { uid, known, premium }.
// The plan counts only when it was read for THIS user.
function firstProfile(user, snap) {
  const u = user || null;
  const premiumKnown = !!(u && snap && snap.known && snap.uid === u.id);
  return { user: u, ...profileFields(u), premium: premiumKnown ? !!snap.premium : false, premiumKnown };
}

// 'card' once Settings' own reads settled (exactly the card as before, whatever they read), or on
// the first frame when the cached user and its plan are both known; otherwise 'skeleton'.
function profileCardView({ loaded, user, premiumKnown }) {
  if (loaded) return 'card';
  return user && premiumKnown ? 'card' : 'skeleton';
}

module.exports = { profileFields, firstProfile, profileCardView };
