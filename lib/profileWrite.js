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

module.exports = { afterMetadataWrite };
