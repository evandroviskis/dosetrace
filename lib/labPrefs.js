// DV-006 (1.3.2): My Body's lab stars and test labels — lib/labPrefsStore (the rules, tested in
// __tests__/dv006LabPrefsTable) wired to this app: the local database, the session's metadata, the
// fresh server metadata for the 1.3.1 fallback and the one-time copy, and the sync engine. Never
// called inside onAuthStateChange.
//
// The ONE read / write API for stars and labels (any screen or helper):
//   loadLabPrefs()      → { favorites: [marker], tags: { 'YYYY-MM-DD': [label] } }
//   saveLabStar(m, on)  → { ok, favorites, tags }
//   saveLabTags(apply)  → { ok, favorites, tags }; apply(tags) → tags is a pure operation on the
//                         labels object: setReportTag / dropReportDate (lib/bodyPrefs), moveReportTags
//                         (lib/labDateMove, AD-100), or any other.
// ok false = not saved (the screen undoes that change and says so).
import { supabase, getCachedUser } from './supabase';
import { getDB } from './database';
import { requestSync } from './sync';
import { cloudTableReady } from './syncCore';
import { createLabPrefs } from './labPrefsStore';

async function prefsFor() {
  const user = await getCachedUser();
  if (!user?.id) return null;
  return createLabPrefs({
    db: getDB(),
    userId: user.id,
    meta: async () => user.user_metadata || {},
    readFresh: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user || data.user.id !== user.id) throw error || new Error('no user');
      return data.user.user_metadata || {};
    },
    writeMeta: (data) => supabase.auth.updateUser({ data }),
    ready: () => cloudTableReady(getDB(), 'lab_prefs', user.id),
    requestSync,
  });
}

export async function loadLabPrefs() {
  const p = await prefsFor();
  return p ? p.load() : { favorites: [], tags: {} };
}
export async function saveLabStar(marker, on) {
  const p = await prefsFor();
  return p ? p.star(marker, on) : { ok: false };
}
export async function saveLabTags(apply) {
  const p = await prefsFor();
  return p ? p.tags(apply) : { ok: false };
}
