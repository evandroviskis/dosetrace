'use strict';
// A-119 OD-18: this phone's identity, as plain logic (lib/deviceId.js wires the Keychain / Keystore,
// expo-application and Platform). iOS: a random id kept in the Keychain "after first unlock, this
// device only" — it survives a reinstall and a sign-out, and never travels in a backup (a new iPhone
// restored from the old one is a new device). Android: ANDROID_ID (per app signing key and phone:
// the same after a reinstall, folded or unfolded); the Keystore only if the system gives none.
// Never derived from the window or the screen. Never cleared by a sign-out or a wipe.

const DEVICE_ID_KEY = 'dosetrace_device_id';

// deps: { platform, androidId?(), secureGet(k), secureSet(k, v), randomId() }
function createDeviceIdentity(deps) {
  let cached = null;
  let pending = null;

  async function load() {
    if (deps.platform === 'android' && deps.androidId) {
      try {
        const a = deps.androidId();
        if (typeof a === 'string' && /^[0-9a-f]{8,64}$/i.test(a)) return `a:${a.toLowerCase()}`;
      } catch { /* no id from the system: the Keystore below */ }
    }
    let v;
    // A read that throws (Keychain locked, an error) never makes a new id: this phone would become a
    // stranger to its own account. null = unknown; the check waits for the next try.
    try { v = await deps.secureGet(DEVICE_ID_KEY); } catch { return null; }
    if (typeof v === 'string' && v.length >= 8) return v;
    const fresh = `${deps.platform === 'ios' ? 'i' : 'x'}:${deps.randomId()}`;
    try { await deps.secureSet(DEVICE_ID_KEY, fresh); } catch { return null; }
    // Read back: only an id that will be there at the next start is used.
    try { if ((await deps.secureGet(DEVICE_ID_KEY)) === fresh) return fresh; } catch { /* below */ }
    return null;
  }

  return {
    async getDeviceId() {
      if (cached) return cached;
      if (!pending) pending = load().then((v) => { cached = v || null; pending = null; return cached; }, () => { pending = null; return null; });
      return pending;
    },
  };
}

module.exports = { createDeviceIdentity, DEVICE_ID_KEY };
