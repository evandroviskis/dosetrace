'use strict';
// Council fix 2 (founder 2026-10-16): Today's "+ Add bottle" opens My Protocols with
// { openProtocolId, editStep }. What My Protocols does with the editStep param:
//  - 'open':  the protocol is in the list -> its Edit sheet opens at that step; the param is cleared.
//  - 'clear': it is not in the list and the list was loaded after the link arrived (ended or deleted
//             meanwhile) -> the param is cleared and nothing opens. Left in place it once opened
//             ANOTHER protocol's Edit sheet later.
//  - 'wait':  not in the list yet and no load since the link arrived (a stale list may lack it).
//  - 'none':  no editStep.
// Pure CommonJS, tested in __tests__/editStepLink.test.js.
function editStepLinkAction({ step, id, protocols, loaded } = {}) {
  if (step == null) return { action: 'none', protocol: null };
  const found = id == null ? null : (protocols || []).find((x) => String(x.id) === String(id)) || null;
  if (found) return { action: 'open', protocol: found };
  return { action: loaded ? 'clear' : 'wait', protocol: null };
}

module.exports = { editStepLinkAction };
