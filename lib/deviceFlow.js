'use strict';
// A-119 one active device per account (docs/specs/one-active-device.md OD-2..OD-17; AD-77,
// DL-102..DL-108): this phone's side of the takeover, as plain logic. Every dependency is injected —
// lib/deviceRuntime.js wires Supabase, AsyncStorage, the Keychain and the app's sync; the two-device
// harness (__tests__/helpers/devicePhone.js) wires the in-memory server. Never imported inside
// onAuthStateChange work that must stay synchronous: App.js calls it from its deferred sign-in work.
//
// What it keeps, OUTSIDE the stores a sign-out wipes (AsyncStorage keys no wipe step removes), so a
// kill or a background run never loses it (OD-4):
//   verdict — the server's confirmed answer that this phone lost the account ('replaced') or that the
//             account was deleted ('gone'), with what and how many this phone had unsent (OD-6).
//   ask     — another device holds the account and this phone never signed in while it did (DL-103,
//             screen 4): no sync until the person answers.
//   notice  — the takeover notice for this phone (screens 1 / 1b), shown once (OD-2).
//   claim   — a takeover this phone asked for and the server has not confirmed yet (OD-5): retried
//             first; no push meanwhile; never a wipe on it.
//   backup  — the server time of this phone's last full backup (the sign-out sheet).

const { parseStatus, isVerdict, versionBelow } = require('./deviceRules');

const KEYS = {
  verdict: 'dosetrace_device_verdict',
  ask: 'dosetrace_device_ask',
  notice: 'dosetrace_device_notice',
  seen: 'dosetrace_device_notice_seen',
  claim: 'dosetrace_device_claim',
  backup: 'dosetrace_last_full_backup',
  update: 'dosetrace_device_update',
};
// A device status read for the profile / user_metadata guard is reused for this long.
const STATUS_FRESH_MS = 30 * 1000;

function createDeviceFlow(d) {
  const kv = d.store;
  const nowMs = d.now || (() => Date.now());
  const readJson = async (k) => {
    try { const raw = await kv.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const writeJson = async (k, v) => {
    try { if (v == null) await kv.removeItem(k); else await kv.setItem(k, JSON.stringify(v)); } catch { /* best effort */ }
  };
  const changed = () => { try { if (d.onChange) d.onChange(); } catch { /* UI only */ } };
  let last = { userId: null, status: null, at: 0 };
  const remember = (userId, status) => { last = { userId, status, at: nowMs() }; };

  async function deviceArgs(extra) {
    let id = null;
    try { id = await d.deviceId(); } catch { id = null; }
    if (!id) return null;
    return { p_device: id, ...(extra || {}) };
  }
  async function rpc(name, extra) {
    const a = await deviceArgs(extra);
    if (!a) return { res: null, noDevice: true };
    let res;
    try { res = await d.rpc(name, a); } catch (e) { res = { data: null, error: e || { message: 'rpc failed' } }; }
    return { res };
  }
  function info() {
    let i = null;
    try { i = d.deviceInfo ? d.deviceInfo() : null; } catch { i = null; }
    return { p_platform: (i && i.platform) || null, p_name: (i && i.name) || null, p_brand: (i && i.brand) || null };
  }

  async function noteVersion(s) {
    if (!s || !('min_version' in s)) return;
    const below = versionBelow(d.appVersion, s.min_version);
    const prev = await readJson(KEYS.update);
    if (below && !(prev && prev.min === s.min_version)) { await writeJson(KEYS.update, { min: s.min_version }); changed(); }
    if (!below && prev) { await writeJson(KEYS.update, null); changed(); }
  }

  // OD-4 / OD-6 / DL-85: the server confirmed this phone lost the account (or the account is gone).
  // What it had unsent is counted NOW (before anything is wiped) and stored with the verdict; sync
  // stops and the reminders are cancelled. Nothing is pulled. The wipe itself waits for the person's
  // "Continue" (screen 2) — or, killed before that, the next open (the verdict is still here).
  async function onVerdict(userId, s) {
    let summary = null;
    let unknown = false;
    try { summary = await d.summarize(userId); } catch { unknown = true; }
    const kind = s.status === 'account_gone' ? 'gone' : 'replaced';
    const prev = await readJson(KEYS.verdict);
    const at = s.at || (prev && prev.userId === userId && prev.at) || null;
    await writeJson(KEYS.verdict, { kind, userId, at, summary, unknown });
    await writeJson(KEYS.ask, null);
    await writeJson(KEYS.claim, null);
    remember(userId, s.status);
    try { if (d.stopSync) d.stopSync(); } catch { /* stopped either way */ }
    try { if (d.cancelReminders) await d.cancelReminders(); } catch { /* the wipe cancels them too */ }
    changed();
  }

  // DL-104 / OD-15 / OD-2: after a takeover this phone counts its own unsent rows, rebuilds its copy
  // from the server, and keeps the notice. Nothing is discarded without a count: an unreadable count
  // or a failed rebuild leaves everything as it is and the server keeps the rebuild owed (retried by
  // the next pass, which does not push meanwhile).
  async function settleTakeover(userId, s, ctx) {
    let own = null;
    if (s.rebuild_owed) {
      try { own = await d.summarize(userId); } catch { return { go: false, reason: 'unreadable' }; }
      let r;
      try { r = await d.rebuild(userId, { inPass: ctx === 'sync' || ctx === 'refused' }); } catch { r = null; }
      if (!r || !r.ok) return { go: false, reason: 'rebuild_failed' };
      await rpc('device_ack', { p_what: 'rebuild' });
    }
    const n = s.notice;
    if (n && n.id) {
      const seen = (await readJson(KEYS.seen)) || [];
      const cur = await readJson(KEYS.notice);
      if (!seen.includes(n.id)) {
        const mine = own && own.count > 0 ? own : null;
        if (!cur || cur.id !== n.id) {
          await writeJson(KEYS.notice, {
            id: n.id, userId,
            device: { platform: n.platform || null, name: n.name || null, brand: n.brand || null },
            lastSentAt: n.last_full_send_at || null,
            own: mine,
          });
        } else if (mine && !cur.own) {
          await writeJson(KEYS.notice, { ...cur, own: mine });
        }
      }
      await rpc('device_ack', { p_what: 'notice' });
      changed();
    }
    return { go: true, outcome: s.rebuild_owed ? 'rebuilt' : 'normal' };
  }

  async function onActive(userId, s, ctx) {
    remember(userId, 'active');
    const ask = await readJson(KEYS.ask);
    if (ask) { await writeJson(KEYS.ask, null); changed(); }
    const v = await readJson(KEYS.verdict);
    if (v && v.userId === userId) { await writeJson(KEYS.verdict, null); changed(); }
    if (s.rebuild_owed || s.notice) return settleTakeover(userId, s, ctx);
    return { go: true, outcome: 'normal' };
  }

  async function handle(userId, s, ctx) {
    await noteVersion(s);
    switch (s.status) {
      case 'active': return onActive(userId, s, ctx);
      case 'replaced': case 'superseded': case 'account_gone':
        await onVerdict(userId, s);
        return { go: false, reason: 'verdict' };
      case 'none': return claim(userId, 'silent', ctx);
      case 'in_use':
        remember(userId, 'in_use');
        await writeJson(KEYS.ask, { userId, device: s.device || null });
        changed();
        return { go: false, reason: 'ask' };
      default:
        // OD-5: no answer is never a verdict. The pass runs as before; the server's guard still
        // refuses a device that is not the active one, and the rows stay pending.
        return { go: true, reason: 'unknown' };
    }
  }

  // mode: 'signin' (a sign-in the person made on a phone with no session, DL-102), 'use_here'
  // (screen 4), 'silent' (a phone already signed in, no device active yet — DL-103).
  async function claim(userId, mode, ctx) {
    const { res, noDevice } = await rpc('claim_device', { ...info(), p_app_version: d.appVersion || null, p_mode: mode });
    const s = noDevice ? { status: 'unknown' } : parseStatus(res);
    if (s.status === 'unknown') {
      if (mode === 'silent') return { go: true, reason: 'unknown' };
      await writeJson(KEYS.claim, { userId, mode });
      return { go: false, reason: 'claim_pending' };
    }
    await writeJson(KEYS.claim, null);
    if (s.secret && d.secret) { try { await d.secret.set(s.secret); } catch { /* next claim */ } }
    return handle(userId, s, ctx);
  }

  // Every sync pass, every foreground, the cold start (before the import) and after a refusal.
  async function gate(userId, _ctx) {
    if (!userId) return { go: false, reason: 'no_user' };
    const v = await readJson(KEYS.verdict);
    if (v && v.userId === userId) return { go: false, reason: 'verdict' };
    const pending = await readJson(KEYS.claim);
    if (pending && pending.userId === userId) return claim(userId, pending.mode || 'signin', _ctx);
    const { res, noDevice } = await rpc('device_status');
    if (noDevice) return { go: true, reason: 'no_device_id' };
    return handle(userId, parseStatus(res), _ctx);
  }

  return {
    KEYS,
    gate,
    afterExplicitSignIn: (userId) => claim(userId, 'signin'),
    useHere: (userId) => claim(userId, 'use_here'),

    async load() {
      return {
        verdict: await readJson(KEYS.verdict),
        ask: await readJson(KEYS.ask),
        notice: await readJson(KEYS.notice),
        update: await readJson(KEYS.update),
      };
    },

    // OD-6: a "Taken" from a notification after the verdict is counted too: the count is taken
    // again from the database (not wiped yet) whenever the notice is shown.
    async refreshVerdict(userId) {
      const v = await readJson(KEYS.verdict);
      if (!v || (userId && v.userId !== userId)) return v;
      try {
        const summary = await d.summarize(v.userId);
        await writeJson(KEYS.verdict, { ...v, summary, unknown: false });
      } catch { /* keep what was counted */ }
      return readJson(KEYS.verdict);
    },

    // After "Continue" wiped and signed the phone out.
    async finishVerdict() { await writeJson(KEYS.verdict, null); await writeJson(KEYS.notice, null); changed(); },

    async dismissNotice() {
      const n = await readJson(KEYS.notice);
      if (n && n.id) {
        const seen = (await readJson(KEYS.seen)) || [];
        await writeJson(KEYS.seen, [...seen.filter((x) => x !== n.id), n.id].slice(-20));
      }
      await writeJson(KEYS.notice, null);
      changed();
    },

    // A deliberate sign-out: nothing of this account's device state stays for the next one.
    async clearOnSignOut() {
      await writeJson(KEYS.ask, null);
      await writeJson(KEYS.claim, null);
      await writeJson(KEYS.notice, null);
      try { if (d.secret) await d.secret.remove(); } catch { /* best effort */ }
      changed();
    },

    // DL-108: a normal sign-out (nothing unsent) releases the account. → true when released.
    async release(_userId) {
      const { res } = await rpc('release_device');
      return !!(res && !res.error && res.data && res.data.released === true);
    },

    // The pass left nothing unsent: the server stamps this phone's last full backup.
    async markSent(userId) {
      const { res } = await rpc('device_mark_sent');
      const at = res && !res.error && res.data && res.data.at;
      if (at) await writeJson(KEYS.backup, { userId, at });
      return at || null;
    },
    async lastFullBackup(userId) {
      const b = await readJson(KEYS.backup);
      return b && b.userId === userId ? b.at : null;
    },

    // OD-7: the check before any profile / user_metadata write (the database cannot refuse those).
    // Allowed while this phone's own sign-in is being settled (the Apple name is written at once).
    async metadataAllowed(userId, { explicit = false } = {}) {
      if (!userId) return true;
      const v = await readJson(KEYS.verdict);
      if (v && v.userId === userId) return false;
      const ask = await readJson(KEYS.ask);
      if (ask && ask.userId === userId) return false;
      if (explicit) return true;
      const pending = await readJson(KEYS.claim);
      if (pending && pending.userId === userId) return true;
      if (last.userId === userId && nowMs() - last.at >= 0 && nowMs() - last.at < STATUS_FRESH_MS) {
        return !(isVerdict(last.status) || last.status === 'in_use');
      }
      const { res, noDevice } = await rpc('device_status');
      if (noDevice) return true;
      const s = parseStatus(res);
      if (isVerdict(s.status)) { await onVerdict(userId, s); return false; }
      if (s.status === 'in_use') { await handle(userId, s); return false; }
      if (s.status !== 'unknown') remember(userId, s.status);
      return true;
    },

    // OD-16: the Android background run, with no session refresh — by this phone's secret.
    // → 'replaced' | 'active' | 'unknown'
    async backgroundCheck(userId) {
      let secret = null;
      try { secret = d.secret ? await d.secret.get() : null; } catch { secret = null; }
      if (!secret || !d.rpcAnon) return 'unknown';
      let res;
      try { res = await d.rpcAnon('device_status_by_secret', { p_secret: secret }); } catch { return 'unknown'; }
      const s = parseStatus(res);
      if (s.status === 'replaced') { await onVerdict(userId, s); return 'replaced'; }
      return s.status === 'active' ? 'active' : 'unknown';
    },

    // OD-10 / DL-85: a session ended without a sign-out (token refresh refused) while this phone
    // still holds the account's data: if the server confirms the account no longer exists, the
    // deletion path runs. → true when the account is gone.
    async checkAccountGone(ownerId) {
      if (!ownerId || !d.rpcAnon) return false;
      let res;
      try { res = await d.rpcAnon('account_exists', { p_user: ownerId }); } catch { return false; }
      if (!res || res.error || res.data !== false) return false;
      await onVerdict(ownerId, { status: 'account_gone' });
      return true;
    },
  };
}

module.exports = { createDeviceFlow, KEYS };
