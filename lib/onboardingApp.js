// The app's side of the onboarding protocol after the account exists (docs/specs/onboarding-protocol.md
// OB-9, OB-22, OB-23, OB-26): lib/onboardingDraftApply's rules bound to the database, the entitlement,
// the reminders and the account. App.js calls these AFTER SIGNED_IN (deferred, never inside
// onAuthStateChange) and after the account's import / device step.
import { draftStore } from './onboardingDraftStore';
import { applyDraft, keepDraft, discardDraft, landingTarget } from './onboardingDraftApply';
import { createDraftStore, builderEligible, builderShownPatch, amountText, frequencyText } from './onboardingDraft';
import { landingFor } from './onboardingSteps';
import { getDB, getActiveProtocols, insertProtocol, insertVial, getProtocolById, getVialById, updateProtocol, updateVial, withImmediateTransaction } from './database';
import { protocolPayload, rtuVialFields } from './protocolForm';
import { parseDecimal, dosesPerVial } from './doseMath';
import { pastStartAsk, pastStartWrites } from './pastDoses';
import { historyQuestion } from './declared';
import { frequencyLabelFor } from './schedule';
import { hasPremium } from './entitlement';
import { afterProtocolChange } from './notifications';
import { notifyDataChanged, requestSync } from './sync';
import { supabase } from './supabase';
import { translations } from '../i18n/translations';
import { freeProtocolLimit } from './freePlan';

// The draft's own language (the numbers were typed in it), for the stored frequency words.
function tFor(language) {
  const tr = translations[language] || translations.en;
  return (k) => (tr && tr[k]) || translations.en[k] || k;
}

// user: the signed-in account — its free limit (lib/freePlan, OB-28: 1 for a new account, 3 before the rule).
function deps(store, language, user) {
  return {
    store,
    limit: freeProtocolLimit(user),
    activeCount: (uid) => (getActiveProtocols(uid) || []).length,
    premium: () => hasPremium().catch(() => false),
    findSince: (uid, name, since) => {
      const r = getDB().getFirstSync('SELECT id FROM protocols WHERE user_id = ? AND name = ? AND created_at >= ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [uid, name, since]);
      return r ? r.id : null;
    },
    withTransaction: withImmediateTransaction,
    frequencyLabel: (n) => frequencyLabelFor(n, tFor(language)),
    save: { insertProtocol, insertVial, protocolPayload, parseDecimal, dosesPerVial, rtuVialFields },
    past: { getProtocolById, getVialById, updateProtocol, updateVial, pastStartAsk, pastStartWrites, historyQuestion },
    after: (id) => {
      const saved = getProtocolById(id);
      if (saved) afterProtocolChange({ saved }).catch(() => {}); // reminders, as the form schedules them
      notifyDataChanged('protocol');
      requestSync();
    },
  };
}

// The saved protocol's chip on the entry offer ("2,5 mg · toda segunda, 08:00").
function chipSummary(p, language) {
  const t = tFor(language);
  const wd = (n, form) => t(`ob_wd_${form === 'long' ? 'long' : 'every'}_${n}`);
  const freq = frequencyText(p, { t, language, timeFormat: 'auto', weekdayName: wd });
  return p.vialUnknown || !p.dose ? freq : `${amountText(p.dose, p.doseUnit, language)} · ${freq}`;
}

// Where the app goes once the draft is handled: the entry offer first for a protocol saved for a
// new account, then her first choice (OB-9). → the pending-navigation target or null.
function routeAfter(result, { offer, user }) {
  const draft = result.draft || {};
  const landing = landingFor(result.help, { hasProtocol: result.newId != null });
  const target = landingTarget(landing, { protocolId: result.newId });
  if (offer && result.newId != null && draft.protocol) {
    return { screen: 'EntryOffer', params: { protocolName: draft.protocol.name, protocolSummary: chipSummary(draft.protocol, draft.language || 'en'), landing: target, freeProtocols: freeProtocolLimit(user) } };
  }
  return target;
}

// → { action, draft, help, newId, target } (action 'ask' / 'limit': App asks — keepOnboardingDraft /
// discardOnboardingDraft answer it).
export async function applyOnboardingDraft(user) {
  const peek = await draftStore.load().catch(() => null);
  const r = await applyDraft({ user, nowMs: Date.now() }, deps(draftStore, (peek && peek.language) || 'en', user));
  return { ...r, target: r.action === 'inserted' || r.action === 'none' ? routeAfter(r, { offer: r.action === 'inserted', user }) : null };
}

export async function keepOnboardingDraft(user, draft) {
  const r = await keepDraft({ user, nowMs: Date.now(), draft }, deps(draftStore, draft.language || 'en', user));
  return { ...r, target: routeAfter(r, { offer: false, user }) };
}
export async function discardOnboardingDraft() { await discardDraft({ store: draftStore }); }

// ── OB-26: the 15-day builder ──
// Every protocol the account ever had: the cloud rows (soft-deleted and the purged tombstones stay
// there — no DELETE policy) and this phone's rows. A failed read is never "no protocol".
export async function builderShouldShow(user) {
  try {
    const local = getDB().getFirstSync('SELECT COUNT(*) AS n FROM protocols WHERE user_id = ?', [user.id]);
    // Cheap answers first (no network): a protocol on the phone, an account under 15 days, the mark.
    if (!builderEligible({ user, nowMs: Date.now(), everCount: (local && local.n) || 0, synced: true })) return false;
    const { count, error } = await supabase.from('protocols').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (error || typeof count !== 'number') return false;
    return builderEligible({ user, nowMs: Date.now(), everCount: Math.max(count, (local && local.n) || 0), synced: true });
  } catch { return false; }
}
// Shown once: the mark goes on the account (one key, merged by Supabase), when the builder opens.
export async function markBuilderShown() {
  try { await supabase.auth.updateUser({ data: builderShownPatch(new Date().toISOString()) }); } catch { /* best effort */ }
}
// The builder's protocol: the same one save, written at once (the account exists).
export async function saveBuilderProtocol(user, protocol, language) {
  const mem = new Map();
  const store = createDraftStore({ getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); }, removeItem: async (k) => { mem.delete(k); } });
  const draft = await store.save({ protocol, language, help: [] });
  const r = await keepDraft({ user, nowMs: Date.now(), draft }, deps(store, language, user));
  return { newId: r.newId, protocolName: protocol.name, protocolSummary: chipSummary(protocol, language), freeProtocols: freeProtocolLimit(user), landing: landingTarget({ kind: 'protocol' }, { protocolId: r.newId }) };
}
