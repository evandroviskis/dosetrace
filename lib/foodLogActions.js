// Food-log storage actions shared by the chat (screens/FoodChatScreen.js) and the
// heroes (Today / Journey). No React here. Everything a message produces is saved
// on food_logs rows (durable, synced) — including the follow-up state on each item
// (ask / ask_skipped / ask_pending / ask_done) — so the chat can always be rebuilt
// from storage (FL-35) and nothing lives only in a view.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFoodLogsSince, insertFoodLog, updateFoodLog, getFoodLogById, getFoodLogTypedDays } from './database';
import { getEntitlementState } from './purchases';
import { getRealityStart } from './realityCheck';
import { parseFood, parseFollowup } from './nutritionClient';
import { splitByDay, localRowKey, rowsToReparse, recentForParse, applyFollowup, followupStillValid, withinCatchUp } from './nutrition';
import { safeItems, pendingAnswers, newMessageId, foodLogAccess, resolveEntitlement } from './foodThread';
import { localDaysAgoISO, localISO } from './localDate';
import { requestSync } from './sync';

// Rows typed on THIS device while pending (id|created_at): parsed once back online
// even after sync gave them a remote_id; another device's pending rows are left to
// that device (FL-19, no double AI read). A per-device convenience key.
const LOCAL_PENDING_KEY = 'dosetrace_food_local_pending';
// Free users get 7 days (FL-41) — the rule lives in lib/foodThread foodLogAccess.
export { FREE_DAYS } from './foodThread';
const LEGACY_FOLLOWUP_KEY = 'dosetrace_food_followups'; // pre-chat offline answers → moved onto the rows

async function readLocalPending() {
  try { const raw = await AsyncStorage.getItem(LOCAL_PENDING_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
export async function rememberTypedHere(rowId) {
  const key = localRowKey(getFoodLogById(rowId));
  if (!key) return;
  const list = await readLocalPending();
  if (!list.includes(key)) { try { await AsyncStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify([...list, key].slice(-200))); } catch { /* ignore */ } }
}

// Change one stored item.
export function updateItem(rowId, index, fn) {
  const row = getFoodLogById(rowId);
  if (!row || row.sync_status === 'deleted') return false;
  const items = safeItems(row.parsed_items);
  if (!items[index]) return false;
  items[index] = fn({ ...items[index] });
  return updateFoodLog(rowId, { parsed_items: JSON.stringify(items) }) > 0;
}

// Save a parse onto the pending row: one row per day eaten (a catch-up "Monday
// pizza, Tuesday a salad" lands on both days), ONE message id on every item so
// the chat shows one bubble (FL-38). Returns [{ rowId, entry_date, items }].
export function saveParsed(rowId, uid, typedISO, res, raw) {
  const msg = newMessageId();
  res.items.forEach((it) => { if (it) it.msg = msg; });
  const groups = splitByDay(res.items, typedISO, res.daysAgo);
  let alive = true;
  const placed = [];
  groups.forEach((g, i) => {
    const fields = {
      parsed_items: JSON.stringify(g.items), kcal: g.totals.kcal,
      protein_g: g.totals.protein_g, carb_g: g.totals.carb_g, fat_g: g.totals.fat_g,
      parse_status: 'done', entry_date: g.entry_date,
    };
    if (i === 0) { alive = updateFoodLog(rowId, fields) > 0; if (alive) placed.push({ rowId, entry_date: g.entry_date, items: g.items }); } // removed meanwhile → add nothing
    else if (alive) { const id = insertFoodLog({ user_id: uid, raw_text: raw, ...fields }); placed.push({ rowId: id, entry_date: g.entry_date, items: g.items }); }
  });
  return placed;
}

// Rows being parsed right now (shared by every screen: no double AI read).
export const inFlight = new Set();

// Parse one offline row. Never deletes it (FL-15/19): refusal → 'refused' (kept,
// with the deflection + Remove), nothing readable → 'unparsed' (kept).
// Returns the saved items, or null.
async function reparseRow(row, uid, lang, rows) {
  if (inFlight.has(row.id)) return null;
  inFlight.add(row.id);
  try {
    const res = await parseFood(row.raw_text, lang, row.entry_date, recentForParse(rows || [], row.entry_date));
    if (!res.ok) return null; // still offline — keep pending, retry later
    if (res.refusal) { updateFoodLog(row.id, { parse_status: 'refused' }); return null; }
    if (!res.items.length || !res.totals) { updateFoodLog(row.id, { parse_status: 'unparsed' }); return null; }
    // Food from more than 7 days back is not logged (FL-45). If nothing is left the
    // row is kept as 'too_old' (explained in the thread, removable) — never deleted.
    const { keep } = withinCatchUp(res.items, res.daysAgo);
    if (!keep.length) { updateFoodLog(row.id, { parse_status: 'too_old' }); return null; }
    // Offline, the question can't be asked live — the item just stays flagged.
    const asked = res.ask ? res.items[res.ask.item] : null;
    if (asked && keep.includes(asked)) asked.asked = true;
    const kept = { ...res, items: keep };
    saveParsed(row.id, uid, row.entry_date, kept, row.raw_text);
    return keep;
  } finally { inFlight.delete(row.id); }
}

// Answer a follow-up: 'applied' | 'dropped' | 'refused' | 'retry'. The corrected
// item replaces ONLY the asked one in the same row (FL-26), keeps the entry's day
// and message id, and records the question + answer (ask_done) for the thread.
export function applyAnswer(p, answer, res) {
  if (!res.ok) {
    if (res.code === 'network' || res.status == null || res.status >= 500 || res.status === 401) return 'retry';
    return 'dropped'; // quota / bad request — the item stays an estimate
  }
  if (res.refusal) return 'refused';
  const corrected = res.items && res.items[0];
  if (!corrected) return 'dropped';
  const row = getFoodLogById(p.rowId);
  if (!followupStillValid(row, p)) return 'dropped'; // edited or deleted meanwhile (FL-28)
  const items = safeItems(row.parsed_items);
  const next = applyFollowup(items, p.index, { ...corrected, msg: items[p.index]?.msg, ask_done: { kind: p.kind, answer, food: p.item.food } });
  if (!next) return 'dropped';
  const n = updateFoodLog(p.rowId, { parsed_items: JSON.stringify(next.items), kcal: next.totals.kcal, protein_g: next.totals.protein_g, carb_g: next.totals.carb_g, fat_g: next.totals.fat_g });
  return n > 0 ? 'applied' : 'dropped';
}

// Pre-chat builds queued offline answers in AsyncStorage: move them onto the rows
// (durable) once, then forget the queue.
async function migrateLegacyFollowups(uid) {
  let list = [];
  try { const raw = await AsyncStorage.getItem(LEGACY_FOLLOWUP_KEY); list = raw ? JSON.parse(raw) : []; } catch { return; }
  if (!Array.isArray(list) || !list.length) return;
  for (const p of list) {
    if (!p || p.user_id !== uid || !p.answer) continue;
    if (followupStillValid(getFoodLogById(p.rowId), p)) updateItem(p.rowId, p.index, (it) => ({ ...it, ask: it.ask || { kind: p.kind, options: [] }, asked: true, ask_pending: p.answer }));
  }
  try { await AsyncStorage.removeItem(LEGACY_FOLLOWUP_KEY); } catch { /* ignore */ }
}

// Catch up on everything that waited for the network: this device's offline rows
// and follow-up answers given offline (FL-19/28). Run on every chat open and every
// hero focus. Returns { changed, updatedItems } — items to echo as "Updated — …".
let catchingUp = false;
export async function catchUpFood(uid, lang) {
  if (!uid || catchingUp) return { changed: false, updatedItems: [] };
  catchingUp = true;
  const updatedItems = [];
  let changed = false;
  try {
    await migrateLegacyFollowups(uid);
    const rows = getFoodLogsSince(uid, localDaysAgoISO(60)) || [];
    const localKeys = await readLocalPending();
    for (const row of rowsToReparse(rows, localKeys)) {
      const before = row.parse_status;
      const items = await reparseRow(row, uid, lang, rows);
      if (items) updatedItems.push(...items);
      const after = getFoodLogById(row.id);
      if (items || (after && after.parse_status !== before)) changed = true;
    }
    const stillPending = new Set((getFoodLogsSince(uid, localDaysAgoISO(60)) || []).filter((x) => x.parse_status === 'pending').map(localRowKey));
    const kept = localKeys.filter((k) => stillPending.has(k));
    if (kept.length !== localKeys.length) AsyncStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(kept)).catch(() => {});
    for (const p of pendingAnswers(getFoodLogsSince(uid, localDaysAgoISO(60)) || [])) {
      const res = await parseFollowup(p.item, p.kind, p.answer, lang, p.entry_date);
      const outcome = applyAnswer(p, p.answer, res);
      if (outcome === 'retry') continue;
      changed = true;
      if (outcome === 'applied') updatedItems.push(res.items[0]);
      else updateItem(p.rowId, p.index, (it) => { const x = { ...it, ask_skipped: true }; delete x.ask_pending; return x; });
    }
    if (changed) requestSync?.();
  } catch { /* best effort; retried on the next open */ } finally { catchingUp = false; }
  return { changed, updatedItems };
}

// Who may log today (FL-41): Premium, the free days, or the grace week when access
// ended during an open reality check. One place for the chat, both heroes and
// Journey. Returns { access, rcStart, premium }.
// The last Premium end date RevenueCat told us (per user) — used when the store
// can't be reached (entitlement cache, not user data).
const endedKey = (uid) => `dosetrace_premium_ended_on:${uid || 'anon'}`;
export async function loadFoodAccess(uid) {
  const ent = await getEntitlementState();
  let lastKnownEndedOn = null;
  try { lastKnownEndedOn = await AsyncStorage.getItem(endedKey(uid)); } catch { lastKnownEndedOn = null; }
  const r = resolveEntitlement({ ...ent, lastKnownEndedOn });
  if (r.remember === null) AsyncStorage.removeItem(endedKey(uid)).catch(() => {});
  else if (r.remember) AsyncStorage.setItem(endedKey(uid), r.remember).catch(() => {});
  let rcStart = null;
  try { rcStart = await getRealityStart(); } catch { rcStart = null; }
  // The 7 free days count from the open check's start, else from the first log.
  const firstUse = uid ? (getFoodLogTypedDays(uid)[0] || null) : null;
  const access = foodLogAccess({ premium: r.premium, firstUse, premiumEndedOn: r.premiumEndedOn, rcStart, todayISO: localISO(), entitlementUnknown: r.entitlementUnknown });
  return { access, rcStart, premium: r.premium };
}
