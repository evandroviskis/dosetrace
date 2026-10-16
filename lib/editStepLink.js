'use strict';
// Council fix 2 (founder 2026-10-16): Today's "+ Add bottle" opens My Protocols with
// { openProtocolId, editStep }. What My Protocols does with the editStep param:
//  - 'open':  the protocol is in the list -> its Edit sheet opens at that step; the param is cleared.
//  - 'clear': it is not in the list and the list was loaded after the link arrived (ended or deleted
//             meanwhile) -> the param is cleared and nothing opens. Left in place it once opened
//             ANOTHER protocol's Edit sheet later.
//  - 'wait':  not in the list yet and no load since the link arrived (a stale list may lack it).
//  - 'none':  no editStep.
// A-115 "A" (founder 2026-10-16, picture a115-notice-contrast): the link may also name a field to
// land on (focusField). On 'open' the sheet scrolls to it and focuses it (keyboard up). Only fields
// listed here, and only when the protocol has that field: 'container' = an oral protocol's bottle
// size on the dose step. Anything else -> focus null (the sheet opens at the step, as before).
// Pure CommonJS, tested in __tests__/editStepLink.test.js and __tests__/a115NoticeContrast.test.js.
const FOCUS_RULES = {
  container: (p) => p && p.type === 'oral',
};
const EDIT_FOCUS_FIELDS = Object.keys(FOCUS_RULES);

function editStepLinkAction({ step, id, protocols, loaded, focus } = {}) {
  if (step == null) return { action: 'none', protocol: null, focus: null };
  const found = id == null ? null : (protocols || []).find((x) => String(x.id) === String(id)) || null;
  if (found) {
    const rule = Object.prototype.hasOwnProperty.call(FOCUS_RULES, focus) ? FOCUS_RULES[focus] : null;
    return { action: 'open', protocol: found, focus: rule && rule(found) ? focus : null };
  }
  return { action: loaded ? 'clear' : 'wait', protocol: null, focus: null };
}

// The Edit sheet keeps { field, id } from the link until the named field lays out. Only that field,
// on the sheet of the protocol the link opened (never a new protocol's form or another protocol's),
// takes it — once (the caller clears it).
function takeEditFocus(pending, field, editingId) {
  if (!pending || pending.field !== field) return false;
  if (editingId == null || pending.id == null) return false;
  return String(pending.id) === String(editingId);
}

module.exports = { editStepLinkAction, takeEditFocus, EDIT_FOCUS_FIELDS };
