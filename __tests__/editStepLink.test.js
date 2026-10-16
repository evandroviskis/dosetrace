'use strict';
// Council fix 2 (founder 2026-10-16, docs/decisions.md "founder answers to the council delta"):
// Today's "+ Add bottle" opens My Protocols with { openProtocolId, editStep: 3 }. When that protocol
// was not in the list once My Protocols had loaded (ended or deleted on the other phone meanwhile),
// editStep was never cleared: it stayed in the route params and opened ANOTHER protocol's Edit sheet
// later (the next time the list changed and openId pointed elsewhere). The rule (lib/editStepLink.js):
//   - the protocol is in the list -> open its Edit sheet at the step, clear the param;
//   - not in the list, and the list was loaded after the link arrived -> clear the param, open nothing;
//   - not in the list yet, and no load since the link arrived -> wait (a stale list may lack it).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const { editStepLinkAction } = require('../lib/editStepLink');

const P = [{ id: 7, name: 'Creatine' }, { id: 9, name: 'Zinc' }];

test('council fix 2: the protocol is in the list -> open it at the step', () => {
  const r = editStepLinkAction({ step: 3, id: 9, protocols: P, loaded: false });
  assert.equal(r.action, 'open');
  assert.equal(r.protocol.id, 9);
  assert.equal(editStepLinkAction({ step: 3, id: '9', protocols: P, loaded: true }).protocol.id, 9, 'ids compare as text');
});

test('council fix 2: the protocol is missing after the list loaded -> clear, open nothing', () => {
  const r = editStepLinkAction({ step: 3, id: 42, protocols: P, loaded: true });
  assert.equal(r.action, 'clear');
  assert.equal(r.protocol, null);
  assert.equal(editStepLinkAction({ step: 3, id: null, protocols: P, loaded: true }).action, 'clear', 'no id at all: clear');
  assert.equal(editStepLinkAction({ step: 3, id: 42, protocols: [], loaded: true }).action, 'clear', 'empty list after load: clear');
});

test('council fix 2: missing before any load since the link arrived -> wait', () => {
  assert.equal(editStepLinkAction({ step: 3, id: 42, protocols: [], loaded: false }).action, 'wait');
  assert.equal(editStepLinkAction({ step: 3, id: 42, protocols: P, loaded: false }).action, 'wait', 'a stale list may lack a new protocol');
});

test('council fix 2: no step -> nothing to do', () => {
  assert.equal(editStepLinkAction({ step: null, id: 9, protocols: P, loaded: true }).action, 'none');
  assert.equal(editStepLinkAction({ step: undefined, id: 9, protocols: P, loaded: true }).action, 'none');
});

test('council fix 2: My Protocols decides with editStepLinkAction and clears the param on open AND on a missing protocol', () => {
  const PROT = read('screens/ProtocolsScreen.js');
  assert.match(PROT, /import \{ editStepLinkAction, takeEditFocus \} from '\.\.\/lib\/editStepLink';/);
  const i = PROT.indexOf('const decision = editStepLinkAction(');
  assert.ok(i > 0, 'the effect uses the pure decision');
  const block = PROT.slice(i, PROT.indexOf('}, [route.params?.editStep', i));
  assert.match(block, /decision\.action === 'wait'/);
  // A-115 "A" (2026-10-16): the focus target is cleared with the step and handed to openEdit
  // (__tests__/a115NoticeContrast.test.js).
  assert.match(block, /navigation\.setParams\(\{ editStep: undefined, focusField: undefined \}\)/);
  assert.match(block, /if \(decision\.action === 'open'\) openEdit\(decision\.protocol, step, decision\.focus\);/);
  // "loaded" = a protocols fetch finished after the link arrived (fetchGen past the generation seen).
  assert.match(PROT, /setFetchGen\(\(g\) => g \+ 1\)/);
  assert.match(PROT, /\}, \[route\.params\?\.editStep, protocols, fetchGen\]\);/);
});
