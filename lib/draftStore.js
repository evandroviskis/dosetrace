// Drafts: text the user typed and has not saved yet, kept per item while the app is open
// (S-26 BK-14 + registry A-77, founder decision 2026-10-01: "keep the draft per item until
// saved or the app closes"). Tapping another item, folding or unfolding (the screen
// remounts) or leaving a screen and coming back shows the text again. On Save, or on an
// explicit Cancel that discards on purpose, the screen clears that item's draft.
//
// In memory only: never written to disk and never synced (the founder chose app-lifetime).
// The app calls clearAllDrafts() on an intentional sign-out, next to resetAllSelections().
// Pure CommonJS so plain Node tests can load it.
//
// Keys (one per item):
//   protocolNote:<protocolId>          the protocol screen's note: { text, base } (base = the
//                                      saved note it was typed over; see noteDraftValue)
//   progress:rcWeigh                   reality check start sheet: start weight, start day
//   progress:todayWeigh                Log today's weight sheet (weight, body fat, waist, open)
//   progress:target                    the target sheet (open while this exists)
//   progress:pastWeighIn               the past weigh-in sheet (date, weight, body fat, open)
//   progress:weighInEdit               the Fix a weigh-in sheet (open while this exists)
//   logSite:<logId>                    the Dose log site editor: the picked spots / typed site
//   foodChat:answer:<rowId>:<index>    the food chat's follow-up answer for one question

const drafts = new Map();

// Values are kept by value: a caller changing its object later never changes the draft.
function copy(v) {
  if (v && typeof v === 'object') return Array.isArray(v) ? v.slice() : { ...v };
  return v;
}

function getDraft(key) {
  return drafts.has(key) ? copy(drafts.get(key)) : undefined;
}

// null / undefined clears. An empty string is kept: erasing a saved note is a draft too.
function setDraft(key, value) {
  if (value == null) { drafts.delete(key); return; }
  drafts.set(key, copy(value));
}

function clearDraft(key) {
  drafts.delete(key);
}

function clearAllDrafts() {
  drafts.clear();
}

// For form fields that start empty: a blank value (null, '', or an object whose values are
// all null / '' / false) is no draft and clears it; anything typed is kept.
function isBlank(v) {
  if (v == null || v === '' || v === false) return true;
  if (typeof v === 'object' && !Array.isArray(v)) return Object.values(v).every((x) => x == null || x === '' || x === false);
  return false;
}

function keepDraft(key, value) {
  if (isBlank(value)) clearDraft(key);
  else setDraft(key, value);
}

// ── The protocol note (A-77, re-check 2026-11-11) ──
// More than one page can show the same protocol (My Protocols and Today's right page on the
// Fold), each with its own copy of the protocol. The draft remembers the saved note it was
// typed over (base), so a page whose copy catches up later never takes the new, unsaved
// text for an outdated one. Only a saved note different from the base replaces the draft.
const noteOf = (n) => n || '';

// What the note field shows: the draft, else the saved note. A plain string is an older draft.
function noteDraftText(draft, storedNote) {
  if (draft == null) return noteOf(storedNote);
  return typeof draft === 'string' ? draft : draft.text;
}

// The draft after typing `text`: the first keystroke takes the saved note as its base.
function noteDraftValue(prev, text, storedNote) {
  const base = prev && typeof prev === 'object' ? prev.base : noteOf(storedNote);
  return { text, base };
}

// True when the saved note moved away from the one the draft was typed over.
function noteDraftOutdated(draft, storedNote) {
  if (draft == null) return false;
  if (typeof draft !== 'object') return true; // an older plain draft: replaced, as before
  return draft.base !== noteOf(storedNote);
}

module.exports = { getDraft, setDraft, clearDraft, clearAllDrafts, keepDraft, noteDraftText, noteDraftValue, noteDraftOutdated };
