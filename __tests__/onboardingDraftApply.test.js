'use strict';
// OB-22 / OB-23 (OP-2): the onboarding's draft protocol going into the account after SIGNED_IN, through
// the manual form's one save (lib/protocolSave), exactly once. lib/onboardingDraftApply with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/onboardingDraft');
const A = require('../lib/onboardingDraftApply');
const { protocolPayload, rtuVialFields } = require('../lib/protocolForm');
const { parseDecimal, dosesPerVial } = require('../lib/doseMath');
const { pastStartAsk, pastStartWrites } = require('../lib/pastDoses');

const NOW = Date.parse('2026-11-20T15:00:00.000Z');
const PROTOCOL = { name: 'Tirzepatida', base: 'tirzepatide', forms: { recon: 'lyo_tirzepatide' }, form: 'recon', amount: '10', unit: 'mg', water: '2', dose: '2,5', doseUnit: 'mg', freq: 'daily', time: '08:00', startMode: 'today' };

function memStorage() {
  const m = new Map();
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); }, removeItem: async (k) => { m.delete(k); } };
}
async function setup({ draftPatch = {}, active = 0, premium = false, crashAfterInsert = false } = {}) {
  const st = memStorage();
  const store = D.createDraftStore(st);
  await store.save({ help: ['syringe'], language: 'pt', protocol: PROTOCOL, handoffAt: '2026-11-20T14:50:00.000Z', ...draftPatch }, '2026-11-20T14:40:00.000Z');
  const rows = { protocols: [], vials: [], after: [] };
  const db = new Map();
  const deps = {
    store, limit: 3,
    activeCount: () => active + rows.protocols.length,
    premium: async () => premium,
    findSince: (uid, name, since) => { const r = rows.protocols.find((p) => p.name === name && p.created_at >= since); return r ? r.id : null; },
    withTransaction: (fn) => fn(),
    frequencyLabel: () => 'daily',
    save: {
      insertProtocol: (row) => { if (crashAfterInsert && rows.protocols.length) throw new Error('crash'); const id = rows.protocols.length + 1; const r = { id, created_at: new Date(NOW).toISOString(), ...row }; rows.protocols.push(r); db.set(id, r); if (crashAfterInsert) throw new Error('killed after the insert'); return id; },
      insertVial: (row) => { rows.vials.push(row); return 50; },
      protocolPayload, parseDecimal, dosesPerVial, rtuVialFields,
    },
    past: { getProtocolById: (id) => db.get(id), getVialById: () => null, updateProtocol() {}, updateVial() {}, pastStartAsk, pastStartWrites, historyQuestion: () => true },
    after: (id) => rows.after.push(id),
  };
  return { st, store, rows, deps };
}

test('OB-22: a new account built in this flow gets the protocol written once, through the form\'s save, then the draft is gone', async () => {
  const { st, rows, deps } = await setup();
  const user = { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' };
  const r = await A.applyDraft({ user, nowMs: NOW }, deps);
  assert.equal(r.action, 'inserted');
  assert.equal(rows.protocols.length, 1);
  assert.equal(rows.protocols[0].user_id, 'u1');
  assert.equal(rows.protocols[0].dose, 2.5, 'read in the language it was typed in');
  assert.equal(rows.vials.length, 1, 'the vial too');
  assert.deepEqual(rows.after, [r.newId], 'reminders scheduled like the form (afterProtocolChange)');
  assert.equal(st.m.has(D.DRAFT_KEY), false);
  assert.deepEqual(r.help, ['syringe'], 'the first choice goes back for the landing (OB-9)');
  const again = await A.applyDraft({ user, nowMs: NOW }, deps);
  assert.equal(again.action, 'none');
  assert.equal(rows.protocols.length, 1, 'never twice');
});

test('OB-22: a save cut off after the insert is found on the next sign-in, never written twice', async () => {
  const { st, rows, deps } = await setup({ crashAfterInsert: true });
  const user = { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' };
  await assert.rejects(A.applyDraft({ user, nowMs: NOW }, deps));
  assert.equal(rows.protocols.length, 1);
  assert.ok(st.m.has(D.DRAFT_KEY), 'kept: the next sign-in finishes it');
  const r = await A.applyDraft({ user, nowMs: NOW + 1000 }, deps);
  assert.equal(r.action, 'inserted');
  assert.equal(rows.protocols.length, 1, 'found, not inserted again');
  assert.equal(st.m.has(D.DRAFT_KEY), false);
});

test('OB-23 / OP-2: an existing account is asked — nothing written until she keeps it; discard clears', async () => {
  const { st, rows, deps } = await setup();
  const old = { id: 'u2', created_at: '2025-03-01T00:00:00.000Z' };
  const r = await A.applyDraft({ user: old, nowMs: NOW }, deps);
  assert.equal(r.action, 'ask');
  assert.equal(rows.protocols.length, 0, 'never a silent duplicate');
  assert.equal(r.draft.protocol.name, 'Tirzepatida');
  const kept = await A.keepDraft({ user: old, nowMs: NOW, draft: r.draft }, deps);
  assert.equal(kept.action, 'inserted');
  assert.equal(rows.protocols.length, 1);
  const { st: st2, rows: rows2, deps: deps2 } = await setup();
  const r2 = await A.applyDraft({ user: old, nowMs: NOW }, deps2);
  await A.discardDraft(deps2);
  assert.equal(st2.m.has(D.DRAFT_KEY), false);
  assert.equal(rows2.protocols.length, 0);
  assert.equal(r2.action, 'ask');
  assert.ok(st.m.size === 0);
});

test('OB-23: at the free limit the draft is never kept on the free plan (Premium or discard)', async () => {
  const { rows, deps } = await setup({ active: 3 });
  const old = { id: 'u2', created_at: '2025-03-01T00:00:00.000Z' };
  const r = await A.applyDraft({ user: old, nowMs: NOW }, deps);
  assert.equal(r.action, 'limit');
  assert.equal(rows.protocols.length, 0);
  await assert.rejects(A.keepDraft({ user: old, nowMs: NOW, draft: r.draft }, deps), /limit/, 'keep re-checks the limit');
  const prem = await setup({ active: 3, premium: true });
  assert.equal((await A.applyDraft({ user: old, nowMs: NOW }, prem.deps)).action, 'ask');
});

test('OB-20: "Montar depois" — no protocol, the help choices still land; an expired draft is dropped', async () => {
  const { st, rows, deps } = await setup({ draftPatch: { skipped: true, protocol: null } });
  const r = await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, deps);
  assert.equal(r.action, 'none');
  assert.deepEqual(r.help, ['syringe']);
  assert.equal(rows.protocols.length, 0);
  assert.equal(st.m.has(D.DRAFT_KEY), false, 'used once');
  const exp = await setup();
  const late = NOW + (D.DRAFT_TTL_DAYS + 1) * 86400000;
  const r2 = await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: late }, exp.deps);
  assert.equal(r2.action, 'none');
  assert.equal(exp.rows.protocols.length, 0);
});

test('OB-9: the landing target for each first choice', () => {
  assert.deepEqual(A.landingTarget({ kind: 'labs' }), { screen: 'MainTabs', params: { screen: 'Body', params: { initialSection: 'labs' } } });
  assert.deepEqual(A.landingTarget({ kind: 'protocol' }, { protocolId: 7 }), { screen: 'MainTabs', params: { screen: 'Protocols', params: { openProtocolId: 7 } } });
  assert.deepEqual(A.landingTarget({ kind: 'protocols' }), { screen: 'MainTabs', params: { screen: 'Protocols' } });
  assert.deepEqual(A.landingTarget({ kind: 'today' }), { screen: 'MainTabs', params: { screen: 'Today' } });
  assert.deepEqual(A.landingTarget({ kind: 'curve' }), { screen: 'SerumCurve' });
  assert.equal(A.landingTarget(null), null);
});

test('council 2026-11-20 (item 12): more past doses than the vial holds gets the manual form\'s vial follow-up (Editar frasco / Novo frasco), landing on Protocols', async () => {
  for (const [flag, target] of [['openEditVial', 'editVial'], ['openNewVialWindow', 'newVial']]) {
    const { deps } = await setup({ draftPatch: { protocol: { ...PROTOCOL, startMode: 'started', startedOn: '2026-10-20', pastAnswer: 'yes' } } });
    deps.past = { ...deps.past, pastStartAsk: () => ({ n: 30 }), pastStartWrites: () => ({ [flag]: true }) };
    const r = await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, deps);
    assert.equal(r.action, 'inserted');
    assert.equal(r.followUp, target, flag);
    assert.deepEqual(A.landingTarget({ kind: 'today' }, { protocolId: r.newId, followUp: r.followUp }),
      { screen: 'MainTabs', params: { screen: 'Protocols', params: { search: { target, protocolId: r.newId } } } }, 'the follow-up wins over the first choice');
  }
  const { deps } = await setup();
  const plain = await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, deps);
  assert.equal(plain.followUp, null);
  const fs = require('node:fs');
  const OA = fs.readFileSync(require('node:path').join(__dirname, '..', 'lib', 'onboardingApp.js'), 'utf8');
  assert.match(OA, /landingTarget\(landing, \{ protocolId: result\.newId, followUp: result\.followUp \}\)/);
  assert.match(OA, /landingTarget\(\{ kind: 'protocol' \}, \{ protocolId: r\.newId, followUp: r\.followUp \}\)/);
});

test('council 2026-11-20 (item 20): a start she answered days before the account (Começo hoje / Outro dia) that is now past asks the app\'s past-doses question on the protocol; never assumed', async () => {
  const frozenThen = { ...PROTOCOL, startMode: 'today', startOn: '2026-11-17' }; // answered on the 17th, account on the 20th
  const { deps } = await setup({ draftPatch: { protocol: frozenThen } });
  const r = await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, deps);
  assert.equal(r.action, 'inserted');
  assert.equal(r.followUp, 'pastDoses');
  assert.deepEqual(A.landingTarget({ kind: 'today' }, { protocolId: r.newId, followUp: r.followUp }),
    { screen: 'MainTabs', params: { screen: 'Protocols', params: { search: { target: 'pastDoses', protocolId: r.newId } } } });
  const today = await setup({ draftPatch: { protocol: { ...PROTOCOL, startMode: 'today', startOn: '2026-11-20' } } });
  assert.equal((await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, today.deps)).followUp, null, 'still today: nothing to ask');
  const started = await setup({ draftPatch: { protocol: { ...PROTOCOL, startMode: 'started', startedOn: '2026-11-10', startOn: '2026-11-10', pastAnswer: 'no' } } });
  assert.notEqual((await A.applyDraft({ user: { id: 'u1', created_at: '2026-11-20T14:55:00.000Z' }, nowMs: NOW }, started.deps)).followUp, 'pastDoses', 'already started: she answered it in the onboarding');
  const PS = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
  assert.match(PS, /case 'pastDoses': openProtocolById\(p\.id\); setTimeout\(\(\) => askPastStart\(getProtocolById\(p\.id\) \|\| p, currentVialOf\(p\.id\)\), 400\); break;/);
  assert.match(PS, /function askPastStart\(protocolData, newVial\) \{/);
  assert.match(PS, /if \(protocolData\) askPastStart\(protocolData, newVialId != null \? getVialById\(newVialId\) : null\);/, 'the manual form uses the same question');
  assert.match(PS, /\['protocol', 'calc', 'vial', 'newVial', 'editVial', 'schedule', 'pastDoses'\]\.includes\(sp\.target\)/);
});
