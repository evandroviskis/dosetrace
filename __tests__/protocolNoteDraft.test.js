'use strict';
// A-77 / BK-14 (founder decision 2026-10-01, docs/decisions.md: "Unsaved drafts are kept per
// item until saved or the app closes (across item switches, fold/unfold, leaving the screen);
// a real sign-out clears them"). Re-check of 2026-11-11, founder order.
//
// Bug 1 (protocol note): every protocol page (My Protocols and Today's right page on the Fold)
// kept its own memory of the saved note and threw the shared draft away whenever its copy of
// the protocol changed note. A page whose copy was older than the saved note (the other tab
// saved a note, then the person typed a new one and left without Save) caught up on focus and
// erased the new, unsaved text. The draft now remembers the saved note it was typed over, and
// only a saved note different from that one replaces it.
//
// Bug 2 (Progress, Fix a weigh-in): the "Weigh-in" correction sheet kept its typed values only
// in screen state, so a fold, unfold or leaving Progress dropped them (same class as the other
// Progress forms, which already used lib/draftStore).
//
// Bug 3 (Dose log site editor): the spots picked and the "Somewhere else" text lived only in
// the picker's state; a fold or leaving the Dose log with the picker open lost them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const store = require('../lib/draftStore');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// One protocol page as ProtocolDetail runs it: the text it shows, typing, and the effect that
// runs when its copy of the protocol changes note. Built only from the store's helpers.
function page(key, note) {
  const pg = { note, last: note };
  pg.text = () => store.noteDraftText(store.getDraft(key), pg.note);
  pg.type = (text) => store.setDraft(key, store.noteDraftValue(store.getDraft(key), text, pg.note));
  pg.sees = (next) => {
    pg.note = next;
    if (pg.last !== next) { pg.last = next; if (store.noteDraftOutdated(store.getDraft(key), next)) store.clearDraft(key); }
  };
  return pg;
}

test('A-77: an unsaved protocol note survives another page catching up with the saved note', () => {
  store.clearAllDrafts();
  const key = 'protocolNote:7';
  const today = page(key, 'old');      // Today's right page
  const protocols = page(key, 'old');  // My Protocols, mounted earlier with the same copy
  today.type('new');
  store.clearDraft(key);               // Save on Today (saveProtocolNote clears the draft)
  today.sees('new');
  today.type('new, then more');        // typed again, not saved, the person leaves
  protocols.sees('new');               // My Protocols refreshes on focus
  assert.equal(store.getDraft(key) && store.getDraft(key).text, 'new, then more', 'the unsaved text is still kept');
  assert.equal(protocols.text(), 'new, then more', 'and shows on that page too');
  store.clearAllDrafts();
});

test('A-77: a note saved over the draft (the Edit form) still replaces it', () => {
  store.clearAllDrafts();
  const key = 'protocolNote:8';
  const pg = page(key, 'old');
  pg.type('typed on the page');
  pg.sees('saved in Edit');            // the stored note changed to something else
  assert.equal(store.getDraft(key), undefined, 'the outdated draft is dropped');
  assert.equal(pg.text(), 'saved in Edit');
  // An empty saved note (null) and '' are the same note.
  pg.sees(null);
  pg.type('x');
  pg.sees('');
  assert.equal(store.getDraft(key).text, 'x');
  store.clearAllDrafts();
});

test('A-77: ProtocolDetail uses the base-aware note draft', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /import \{[^}]*\bnoteDraftValue\b[^}]*\bnoteDraftOutdated\b[^}]*\} from '\.\.\/lib\/draftStore'/);
  assert.match(src, /const noteDraft = noteDraftText\(draft, p\.note\);/);
  assert.match(src, /const setNoteDraft = \(text\) => onDraft\(p\.id, noteDraftValue\(draft, text, p\.note\)\);/);
  assert.match(src, /if \(lastNote\.current !== p\.note\) \{ lastNote\.current = p\.note; if \(noteDraftOutdated\(draft, p\.note\)\) onDraft\(p\.id, null\); \}/);
});

test('A-77: the Fix a weigh-in sheet keeps its typed values while open (Progress)', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /const \[weEdit, setWeEdit\] = useState\(\(\) => getDraft\('progress:weighInEdit'\) \|\| null\);/, 'reopens with the typed values after a remount');
  assert.match(src, /if \(weEdit\) setDraft\('progress:weighInEdit', weEdit\);\s*else clearDraft\('progress:weighInEdit'\);\s*\}, \[weEdit\]\);/, 'every change is kept; closing (Cancel, Save, Delete) ends it');
});

test('A-77: the Dose log site editor keeps the picked spots and typed site per dose', () => {
  const modal = read('screens/components/BodyMapModal.js');
  assert.match(modal, /import \{[^}]*\bgetDraft\b[^}]*\} from '\.\.\/\.\.\/lib\/draftStore'/);
  assert.match(modal, /const kept = draftKey \? getDraft\(draftKey\) : null;/, 'reopening that dose shows the kept choice');
  assert.match(modal, /if \(!visible \|\| !draftKey\) return;/, 'only while open, only when the screen asks for it');
  assert.match(modal, /else clearDraft\(draftKey\);/, 'back to the saved site is no draft');
  const log = read('screens/LogScreen.js');
  assert.match(log, /export function siteDraftKey\(logId\) \{\s*return 'logSite:' \+ logId;\s*\}/);
  assert.match(log, /draftKey=\{bodyMapTarget && bodyMapTarget\.logId \? siteDraftKey\(bodyMapTarget\.logId\) : null\}/);
  // Every deliberate way out (Save, Skip, Cancel, Back, Leave) ends the draft.
  const action = log.match(/function siteAction\(action, stored\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(action, /if \(!plan\.close\) return;\s*clearDraft\(siteDraftKey\(tgt\.logId\)\);/);
  // "Stay" (Back in ask mode) does not close, so the draft stays.
  assert.ok(action.indexOf('if (!plan.close) return;') < action.indexOf('clearDraft('));
});

test('A-77: the new drafts are in memory only and go with a real sign-out (clearAllDrafts)', () => {
  store.setDraft('progress:weighInEdit', { date: '2026-11-01', weight: '80' });
  store.setDraft('logSite:12', { type: 'subq', selected: ['abd-r'], other: null });
  store.clearAllDrafts();
  assert.equal(store.getDraft('progress:weighInEdit'), undefined);
  assert.equal(store.getDraft('logSite:12'), undefined);
  const lib = read('lib/draftStore.js');
  assert.match(lib, /progress:weighInEdit/);
  assert.match(lib, /logSite:<logId>/);
});
