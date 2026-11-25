'use strict';
// Profile synced (docs/specs/profile-synced.md PS-6): the step after a user_metadata write in the one
// supabase.auth.updateUser wrapper (lib/supabase.js). Only a write the auth server ACCEPTED is
// recorded in the account_profile table (lib/profile noteProfileWrite): a refused one (offline, or
// A-119's DT001 on a phone that is no longer the account's) changes nothing anywhere, and the screen
// says "not saved" exactly as before. Mirror first: while 1.3.0 / 1.3.1 are in the stores,
// user_metadata must hold every profile value they and the server functions read. A failure of the
// table step never changes the write's answer. Pure CommonJS (node --test).
function afterMetadataWrite(res, data, note) {
  if (!res || res.error || !data || typeof data !== 'object') return false;
  const user = res.data && res.data.user;
  if (!user || !user.id || typeof note !== 'function') return false;
  try { note(user, data); return true; } catch { return false; }
}

// The body of the one updateUser wrapper (lib/supabase.js runs exactly this). d: { guard(attributes)
// → false refuses (A-119 OD-7), raw(attributes, options) (auth-js's own updateUser), note(user, data)
// (the table step, PS-6), keptBefore(keys) → a snapshot of the Edit profile edit kept on this phone for
// those keys, or null; clearAccepted(user, keys, snapshot) }.
// Gate B review 2026-11-24 (PS-24): EVERY accepted profile write — the calculator, onboarding, the 18+
// step, the birth month fix, the sign-in name fill, Edit profile and its flush — supersedes the kept edit
// of the same keys: the snapshot is taken right before sending, and on acceptance a kept key leaves only
// while it still holds the snapshot value (an edit kept while the write was out is newer and stays).
async function metadataWrite(attributes, options, d) {
  const data = attributes && attributes.data && typeof attributes.data === 'object' ? attributes.data : null;
  if (data && d.guard) {
    let allowed = true;
    try { allowed = await d.guard(attributes); } catch { allowed = true; }
    if (allowed === false) return { data: { user: null }, error: { code: 'DT001', message: 'device_not_active', status: 409 } };
  }
  let before = null;
  if (data && d.keptBefore) { try { before = d.keptBefore(Object.keys(data)); } catch { before = null; } }
  const res = await d.raw(attributes, options);
  if (data) {
    afterMetadataWrite(res, data, d.note);
    if (before && d.clearAccepted) afterMetadataWrite(res, data, (user) => d.clearAccepted(user, Object.keys(data), before));
  }
  return res;
}

module.exports = { afterMetadataWrite, metadataWrite };
