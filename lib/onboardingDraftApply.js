'use strict';
// The onboarding's draft protocol into the account (docs/specs/onboarding-protocol.md OB-22 / OB-23):
// App.js runs applyDraft AFTER SIGNED_IN (deferred, never inside onAuthStateChange) and after the
// account's import, so a returning account's data is on the phone before anything is written.
//  - a new account made in this flow: written at once, through the manual form's one save
//    (lib/protocolSave), with the vial and the past-doses answer; then the draft is gone;
//  - an existing account (OP-2): the person is asked to keep or discard it (never a silent duplicate);
//  - at the free limit: never kept on the free plan (discard, or Premium first);
//  - a save cut off half-way (applyingAt) is looked for before writing again (never twice).
// Pure with deps (node --test); lib/onboardingDraftApplyApp.js binds them to the app.
const D = require('./onboardingDraft');
const { insertNewProtocol, applyPastAnswer } = require('./protocolSave');
const { localISO } = require('./localDate');

const dayKey = (ms) => { const d = new Date(ms); return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); };

// deps: { store, limit, activeCount(uid), premium(), findSince(uid, name, iso), withTransaction(fn),
//         frequencyLabel(interval), save: {insertProtocol, insertVial, protocolPayload, parseDecimal,
//         dosesPerVial, rtuVialFields}, past: {getProtocolById, getVialById, updateProtocol, updateVial,
//         pastStartAsk, pastStartWrites, historyQuestion}, after(newId) }
// → { action: 'none' | 'inserted' | 'ask' | 'limit', draft, help, newId? }
async function applyDraft({ user, nowMs }, deps) {
  const draft = await deps.store.load(nowMs);
  if (!draft) return { action: 'none', draft: null, help: [] };
  const help = Array.isArray(draft.help) ? draft.help : [];
  const decision = D.applyDecision({ draft, user, nowMs, activeCount: deps.activeCount(user.id), limit: deps.limit, premium: await deps.premium() });
  if (decision === 'none' || decision === 'drop') {
    await deps.store.clear(); // used once: the landing (help) goes back to the caller
    return { action: 'none', draft, help: decision === 'none' ? help : [] };
  }
  if (decision === 'check') {
    const found = deps.findSince(user.id, draft.protocol.name, draft.applyingAt);
    if (found != null) {
      await deps.store.clear();
      deps.after(found);
      return { action: 'inserted', draft, help, newId: found };
    }
    return keepDraft({ user, nowMs, draft }, deps);
  }
  if (decision === 'insert') return keepDraft({ user, nowMs, draft }, deps);
  return { action: decision, draft, help };
}

// "Guardar" (or a new account): the one save, inside one transaction; the draft is marked first so a
// kill between the insert and the clear is found next time instead of written twice.
async function keepDraft({ user, nowMs, draft }, deps) {
  if (!(await deps.premium()) && deps.activeCount(user.id) >= deps.limit) throw new Error('limit');
  await deps.store.markApplying(new Date(nowMs).toISOString());
  const language = draft.language || 'en';
  const now = new Date(nowMs);
  const r = D.draftToForm(draft.protocol, { now, language });
  const ids = deps.withTransaction(() => {
    const out = insertNewProtocol({
      form: r.form, userId: user.id, language, frequencyLabel: deps.frequencyLabel,
      startDate: r.startDate, skipVial: r.skipVial, mixedOn: r.mixedOn,
    }, deps.save);
    applyPastAnswer({ newId: out.newId, newVialId: out.newVialId, answer: draft.protocol.startMode === 'started' ? draft.protocol.pastAnswer : null, nowMs, today: dayKey(nowMs) }, deps.past);
    return out;
  });
  await deps.store.clear();
  deps.after(ids.newId);
  return { action: 'inserted', draft, help: Array.isArray(draft.help) ? draft.help : [], newId: ids.newId };
}

async function discardDraft(deps) { await deps.store.clear(); }

// OB-9: the route the app opens on (App.js navigate('Main', target)).
function landingTarget(landing, { protocolId } = {}) {
  if (!landing) return null;
  const tab = (screen, params) => (params ? { screen: 'MainTabs', params: { screen, params } } : { screen: 'MainTabs', params: { screen } });
  switch (landing.kind) {
    case 'labs': return tab('Body', { initialSection: 'labs' });
    case 'protocol': return protocolId != null ? tab('Protocols', { openProtocolId: protocolId }) : tab('Protocols');
    case 'protocols': return tab('Protocols');
    case 'today': return tab('Today');
    case 'curve': return { screen: 'SerumCurve' };
    default: return null;
  }
}

module.exports = { applyDraft, keepDraft, discardDraft, landingTarget };
