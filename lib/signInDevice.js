'use strict';
// A-119: the device step of App.js's sign-in work and cold start, as plain logic (behaviour-tested
// in __tests__/a119GateB.test.js "auditor race"; App.js passes the real functions).
//
// Sign-in (DL-102 / OD-3 / OD-14): a sign-in the person made takes the account over; any other
// SIGNED_IN only checks. The sync engine starts AFTER the claim (auditor race: a pass in between asked
// device_status and showed screen 4 / 2 to the phone the person had just signed in on). Screen 2 / 4:
// nothing imported, nothing scheduled. A takeover's rebuild runs in the next pass (Gate B M1), so the
// first import never runs on a phone that owes one.
// d: { explicit, userId, flow, gate(ctx), startSync(), isLocalEmpty(uid), fullImport(), requestSync(), reload() }
// → { dev, held }
async function signInDeviceStep(d) {
  let dev = { go: true };
  try { dev = d.explicit ? await d.flow.afterExplicitSignIn(d.userId) : await d.gate('signin'); } catch { dev = { go: true }; }
  dev = dev || { go: true };
  try { d.startSync(); } catch { /* the next start */ }
  try { if (d.reload) d.reload(); } catch { /* UI only */ }
  const held = dev.go === false && (dev.reason === 'verdict' || dev.reason === 'ask');
  if (held) return { dev, held: true };
  if (dev.go !== false && dev.outcome !== 'rebuilt' && d.isLocalEmpty(d.userId)) await d.fullImport();
  else d.requestSync();
  return { dev, held: false };
}

// Cold start with a session (OD-4 / OD-14 / DL-103): the check before the import; a stored verdict
// answers with no network. d: { gate(ctx), userId, isLocalEmpty(uid), fullImport(), requestSync() }
async function startupDeviceStep(d) {
  let dev = { go: true };
  try { dev = await d.gate('startup'); } catch { dev = { go: true }; }
  dev = dev || { go: true };
  const held = dev.go === false && (dev.reason === 'verdict' || dev.reason === 'ask');
  if (held) return { dev, held: true };
  if (dev.go !== false && d.isLocalEmpty(d.userId)) await d.fullImport();
  else d.requestSync();
  return { dev, held: false };
}

module.exports = { signInDeviceStep, startupDeviceStep };
