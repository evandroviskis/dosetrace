// Supabase auth storage backed by the device Keychain / Keystore (expo-secure-store)
// instead of AsyncStorage, so the session tokens are encrypted at rest.
//
// Two hard requirements shape this (CLAUDE.md — never lose user data):
//   1. SecureStore has a ~2048-byte per-value limit. A Supabase session (access +
//      refresh token + user object) can exceed it, so we CHUNK the value across
//      several Keychain entries. A naive single-key adapter silently fails to
//      persist a large session -> the user is logged out on the next cold start.
//   2. Existing installs have their session in AsyncStorage today. On first read
//      after the update we MIGRATE it into SecureStore (and only delete the
//      AsyncStorage copy once the SecureStore write has succeeded) so nobody is
//      mass-logged-out by the switch.
//
// Every SecureStore op is wrapped so that if the Keychain is unavailable or
// throws, we fall back to AsyncStorage rather than lose the session.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keep well under the 2048-byte limit to leave headroom for multi-byte chars.
const CHUNK_SIZE = 1800;
// SecureStore keys must match [A-Za-z0-9._-]. Supabase keys already do; sanitize
// defensively so an unexpected key can never throw.
const safeKey = (key) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const countKey = (k) => `${k}.__n`;
const chunkKey = (k, i) => `${k}.${i}`;

async function scReadChunks(k) {
  const nRaw = await SecureStore.getItemAsync(countKey(k));
  if (nRaw == null) return null;
  const n = parseInt(nRaw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  let out = '';
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(k, i));
    if (part == null) return null; // torn write — treat as absent
    out += part;
  }
  return out;
}

async function scWriteChunks(k, value) {
  const chunks = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  // Write chunks first, then the count last, so a reader never sees a count that
  // points at chunks not yet written.
  for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(chunkKey(k, i), chunks[i]);
  await SecureStore.setItemAsync(countKey(k), String(chunks.length));
  // Clear any stale trailing chunks from a previous, longer value.
  for (let i = chunks.length; ; i++) {
    const stale = await SecureStore.getItemAsync(chunkKey(k, i));
    if (stale == null) break;
    await SecureStore.deleteItemAsync(chunkKey(k, i));
  }
}

async function scDelete(k) {
  const nRaw = await SecureStore.getItemAsync(countKey(k)).catch(() => null);
  const n = nRaw != null ? parseInt(nRaw, 10) : 0;
  for (let i = 0; i < (Number.isFinite(n) ? n : 0); i++) {
    await SecureStore.deleteItemAsync(chunkKey(k, i)).catch(() => {});
  }
  // Best-effort sweep a few extra in case the count was wrong.
  for (let i = 0; i < 4; i++) await SecureStore.deleteItemAsync(chunkKey(k, i)).catch(() => {});
  await SecureStore.deleteItemAsync(countKey(k)).catch(() => {});
}

export const SecureStoreAdapter = {
  getItem: async (key) => {
    const k = safeKey(key);
    try {
      const v = await scReadChunks(k);
      if (v != null) return v;
    } catch { /* fall through to migration / fallback */ }

    // One-time migration from the previous AsyncStorage location. Only remove the
    // legacy copy AFTER the SecureStore write succeeds — never drop the session.
    try {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        try {
          await scWriteChunks(k, legacy);
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
      await scWriteChunks(k, value);
      // Keep AsyncStorage clean once SecureStore holds the value.
      AsyncStorage.removeItem(key).catch(() => {});
    } catch {
      // Keychain unavailable/failed — persist to AsyncStorage so the session is
      // never lost (degrades to the old behavior rather than logging the user out).
      try { await AsyncStorage.setItem(key, value); } catch { /* nothing more we can do */ }
    }
  },

  removeItem: async (key) => {
    const k = safeKey(key);
    await scDelete(k).catch(() => {});
    try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
  },
};
