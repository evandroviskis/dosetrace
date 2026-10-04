'use strict';
// Entries of a protocol deleted forever on ANOTHER device (decided by logic 2026-10-04): a dose log
// or vial written here before this phone learned of the Delete forever. The server refuses it and
// the sync keeps it pending (never deleted silently: R-A), so it would block every non-forced
// sign-out — and the profile gate and the 18+ sheet have no "Sign out anyway". The user is asked,
// once per new count: Discard (removes ONLY those rows, on this phone) or Keep for now.
// Pure (no React Native): the screens wire it through lib/accountActions.
const { finishLocalPurge } = require('./syncCore');

const TABLES = ['dose_logs', 'vials'];
// A pending row whose protocol (by local id or cloud id) is deleted forever here.
const WHERE = `t.sync_status = 'pending' AND t.user_id = ? AND EXISTS (
  SELECT 1 FROM protocols p WHERE p.purged_at IS NOT NULL
    AND (p.id = t.protocol_id OR (t.protocol_remote_id IS NOT NULL AND p.remote_id = t.protocol_remote_id)))`;

function owners(userIds) {
  return [...new Set((userIds || []).filter(Boolean))];
}

function countOrphanedPending(db, userIds) {
  let n = 0;
  for (const u of owners(userIds)) {
    for (const tb of TABLES) n += db.getFirstSync(`SELECT COUNT(*) AS n FROM ${tb} t WHERE ${WHERE}`, [u]).n;
  }
  return n;
}

// Only on the user's Discard. → how many rows were removed.
function discardOrphanedPending(db, userIds) {
  let removed = 0;
  const protocols = new Set();
  for (const u of owners(userIds)) {
    for (const tb of TABLES) {
      const rows = db.getAllSync(`SELECT t.id, t.protocol_id, t.protocol_remote_id FROM ${tb} t WHERE ${WHERE}`, [u]);
      for (const r of rows) {
        const p = db.getFirstSync('SELECT id FROM protocols WHERE purged_at IS NOT NULL AND (id = ? OR remote_id = ?) LIMIT 1', [r.protocol_id ?? null, r.protocol_remote_id || null]);
        if (p) protocols.add(p.id);
        removed += db.runSync(`DELETE FROM ${tb} WHERE id = ? AND sync_status = 'pending'`, [r.id]).changes || 0;
      }
    }
  }
  // The hidden protocol was kept only for those rows: it leaves now (unless others still wait).
  for (const id of protocols) finishLocalPurge(db, id);
  return removed;
}

const ORPHAN_PROMPT_KEY = 'orphanedPromptShown';
function orphanPromptKey(userId) { return `${ORPHAN_PROMPT_KEY}:${userId}`; }
// Once per count: Keep for now remembers the count; a new refused entry asks again.
function shouldPromptOrphans(count, lastShown) {
  return count > 0 && count > (Number(lastShown) || 0);
}

// The DoseTrace sheet (DTSheet config). prefix: the blocked sign-out's own words, first.
function orphanedSheet({ t, count, onKeep, onDiscard, prefix = null, title = null }) {
  if (!count) return null;
  const words = count === 1 ? t('orphaned_body_one') : t('orphaned_body_many').replace('{n}', String(count));
  return {
    icon: 'warning',
    title: title || t('orphaned_title'),
    body: prefix ? `${prefix}\n\n${words}` : words,
    buttons: [
      { label: t('orphaned_keep'), kind: 'secondary', onPress: onKeep },
      { label: t('orphaned_discard'), kind: 'danger', onPress: onDiscard },
    ],
    onDismiss: onKeep,
  };
}

module.exports = { countOrphanedPending, discardOrphanedPending, shouldPromptOrphans, orphanPromptKey, orphanedSheet, ORPHAN_PROMPT_KEY };
