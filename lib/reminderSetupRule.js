'use strict';
// A-112 SP-5: the "Make sure your reminders arrive" screen opens by itself once per phone, on Android,
// for a user with a protocol that has a reminder time who has not seen it on this phone. Pure.
function shouldOpenSetup({ os, seen, activeWithTime }) {
  return os === 'android' && !seen && activeWithTime > 0;
}

// RS-4 (docs/specs/reminder-setup-conversation.md): before the conversation opens an Android screen it
// keeps { item, at } on this phone. If Android closes DoseTrace meanwhile, the next start brings the
// person back to that item (cold return) — only while it is fresh (30 minutes); anything else is
// forgotten. → the item id or null.
const RESUME_MAX_MS = 30 * 60 * 1000;
function resumeItem(raw, nowMs = Date.now()) {
  if (!raw) return null;
  let v = null;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v.item !== 'string' || !Number.isFinite(v.at)) return null;
  const age = nowMs - v.at;
  return age >= 0 && age <= RESUME_MAX_MS ? v.item : null;
}

module.exports = { shouldOpenSetup, resumeItem, RESUME_MAX_MS };
