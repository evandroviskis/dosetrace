// Supabase auth storage backed by the device Keychain / Keystore (expo-secure-store)
// instead of AsyncStorage, so the session tokens are encrypted at rest.
//
// Hard requirement (CLAUDE.md — never lose user data, don't force needless re-auth):
// SecureStore has a ~2048-byte per-value limit, so a session (access + refresh
// token + user object) is CHUNKED across several Keychain entries. The dangerous
// part is an *overwrite* that tears midway (Keychain hiccup, device-lock, or an
// autoRefresh write interleaved with a read): stale chunks from the prior value
// would otherwise splice into corrupt data and drop the session.
//
// Design that prevents that — TWO-SLOT PING-PONG with an atomic pointer:
//   - Each write targets the *inactive* slot ('a' or 'b'), writing its chunks
//     there, then flips a single small pointer key `<key>.__meta = "slot:count:len"`
//     LAST. That pointer write is one atomic Keychain op.
//   - A read follows the pointer, reassembles that slot's chunks, and verifies the
//     total length matches. If the write tore before the flip, the pointer still
//     names the OLD slot, whose chunks are fully intact — so the previous valid
//     session is returned. A torn/short read returns null (clean cache-miss), never
//     spliced garbage.
//   - One-time migration from the old AsyncStorage location on first read; the
//     AsyncStorage copy is deleted only after the SecureStore write succeeds.
//   - If SecureStore is entirely unavailable, we fall back to AsyncStorage so the
//     session is never lost (degrades to the old behavior).

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_CHUNK_BYTES = 2000;     // < SecureStore's ~2048-BYTE (not char) limit
const MAX_CHUNKS_SWEEP = 24;      // sessions are ~2-4 chunks; sweep generously on delete
// Auth tokens must survive a background token-refresh while the device is locked,
// and must not be readable before the first unlock. AFTER_FIRST_UNLOCK is the
// correct class (WHEN_UNLOCKED, the default, would null out a locked-state read
// and silently drop the session).
const KEYCHAIN_OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const safeKey = (key) => key.replace(/[^A-Za-z0-9._-]/g, '_');

// UTF-8 byte length of a single code point (no TextEncoder dependency).
const cpBytes = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

// Split a string into chunks each <= maxBytes of UTF-8, never mid-code-point.
// Chunking by BYTES (not chars) matters: a multibyte display_name could push a
// char-sized chunk past the Keystore byte limit -> setItemAsync throws -> the
// session silently falls back to plaintext AsyncStorage for non-English users.
function chunkByBytes(str, maxBytes) {
  const chunks = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of str) { // for..of iterates by code point (surrogate-safe)
    const b = cpBytes(ch.codePointAt(0));
    if (curBytes + b > maxBytes && cur) { chunks.push(cur); cur = ''; curBytes = 0; }
    cur += ch;
    curBytes += b;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
const metaKey = (k) => `${k}.__meta`;
const slotChunkKey = (k, slot, i) => `${k}.${slot}.${i}`;
const otherSlot = (slot) => (slot === 'a' ? 'b' : 'a');

// Read the active slot's value, verifying integrity. Returns null on any torn /
// short / corrupt state (caller treats null as "not stored").
async function scRead(k) {
  const meta = await SecureStore.getItemAsync(metaKey(k));
  if (meta == null) return null;
  const [slot, countS, lenS] = meta.split(':');
  const count = parseInt(countS, 10);
  const len = parseInt(lenS, 10);
  if ((slot !== 'a' && slot !== 'b') || !Number.isFinite(count) || !Number.isFinite(len)) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(slotChunkKey(k, slot, i));
    if (part == null) return null; // torn — fall back / cache-miss
    out += part;
  }
  if (out.length !== len) return null; // integrity check — spliced/short read
  return out;
}

// Write to the inactive slot, then flip the pointer atomically. Throws if the
// Keychain is unavailable (caller falls back to AsyncStorage).
async function scWrite(k, value) {
  const meta = await SecureStore.getItemAsync(metaKey(k)).catch(() => null);
  const curSlot = meta ? meta.split(':')[0] : 'b';
  const target = otherSlot(curSlot === 'a' ? 'a' : 'b');
  const chunks = chunkByBytes(value, MAX_CHUNK_BYTES);
  for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(slotChunkKey(k, target, i), chunks[i], KEYCHAIN_OPTS);
  // Atomic pointer flip — a reader now sees the fully-written target slot.
  await SecureStore.setItemAsync(metaKey(k), `${target}:${chunks.length}:${value.length}`, KEYCHAIN_OPTS);
  // Best-effort cleanup of the slot we just left (harmless if it fails; the
  // pointer no longer references it).
  const old = otherSlot(target);
  for (let i = 0; i < MAX_CHUNKS_SWEEP; i++) {
    const stale = await SecureStore.getItemAsync(slotChunkKey(k, old, i)).catch(() => null);
    if (stale == null) break;
    await SecureStore.deleteItemAsync(slotChunkKey(k, old, i)).catch(() => {});
  }
}

async function scDelete(k) {
  await SecureStore.deleteItemAsync(metaKey(k)).catch(() => {});
  for (const slot of ['a', 'b']) {
    for (let i = 0; i < MAX_CHUNKS_SWEEP; i++) {
      await SecureStore.deleteItemAsync(slotChunkKey(k, slot, i)).catch(() => {});
    }
  }
}

export const SecureStoreAdapter = {
  getItem: async (key) => {
    const k = safeKey(key);
    try {
      const v = await scRead(k);
      if (v != null) return v;
    } catch { /* SecureStore unavailable — try migration / fallback below */ }

    // One-time migration from the previous AsyncStorage location. Only remove the
    // legacy copy AFTER the SecureStore write succeeds — never drop the session.
    try {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        try {
          await scWrite(k, legacy);
          await AsyncStorage.removeItem(key);
        } catch { /* keep legacy in place; still return it so the session survives */ }
        return legacy;
      }
    } catch { /* ignore */ }
    return null;
  },

  setItem: async (key, value) => {
    const k = safeKey(key);
    try {
      await scWrite(k, value);
      AsyncStorage.removeItem(key).catch(() => {}); // keep the plaintext copy from lingering
    } catch {
      // Keychain unavailable — persist to AsyncStorage so the session is never lost.
      try { await AsyncStorage.setItem(key, value); } catch { /* nothing more we can do */ }
    }
  },

  removeItem: async (key) => {
    const k = safeKey(key);
    await scDelete(k).catch(() => {});
    try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
  },
};
