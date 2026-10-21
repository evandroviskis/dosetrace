'use strict';
// A-127 in-app update notice (docs/specs/update-notice.md): this phone's side, as plain logic. Every
// dependency is injected — lib/updateRuntime wires Supabase, AsyncStorage, Linking and the store
// links; __tests__/updateNotice.test.js wires fakes. The rules live in lib/updateRules.
//
// What it keeps (AsyncStorage keys no sign-out wipe removes — none of it is the person's data):
//   release — the last real answer for this platform's row (the required screen shows offline too);
//   seen    — the invitation's showings (UN-2);
//   asked   — this phone stored this account's answer to "Avisar quando houver versão nova?" (UN-5);
//   pending — that answer, while the account write has not gone through (sent at the next open).
// Nothing here deletes, signs out or touches the person's records: the required screen only asks
// for the update ("Seus dados continuam guardados — nada é apagado ao atualizar.").

const R = require('./updateRules');

const KEYS = {
  release: 'dosetrace_app_release',
  seen: 'dosetrace_update_seen',
  asked: 'dosetrace_update_asked',
  pending: 'dosetrace_update_optin_pending',
};

const APPLE_APP_ID = '6761788157'; // App Store Connect app id (io.outcom.dosetrace), as Settings › Rate
const ANDROID_PACKAGE = 'io.outcom.dosetrace';
const STORE_LINKS = {
  ios: [`itms-apps://apps.apple.com/app/id${APPLE_APP_ID}`, `https://apps.apple.com/app/id${APPLE_APP_ID}`],
  android: [`market://details?id=${ANDROID_PACKAGE}`, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`],
};

function createUpdateFlow(d) {
  const kv = d.store;
  const nowMs = d.now || (() => Date.now());
  const platform = d.platform;
  const play = d.play || { available: false };
  const readJson = async (k) => {
    try { const raw = await kv.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const writeJson = async (k, v) => {
    try { if (v == null) await kv.removeItem(k); else await kv.setItem(k, JSON.stringify(v)); } catch { /* best effort */ }
  };
  const subs = new Set();
  let ready = false; // Android: Play finished the flexible download ("A nova versão foi baixada.")
  let stopDownloaded = null;
  const emit = () => { for (const fn of subs) { try { fn({ ready }); } catch { /* UI only */ } } };

  async function release() {
    const c = await readJson(KEYS.release);
    return c && c.platform === platform ? R.parseRelease(c.row, platform) : null;
  }
  async function deviceMin(signedIn) {
    if (!signedIn || !d.deviceMin) return null;
    try { return (await d.deviceMin()) || null; } catch { return null; }
  }

  return {
    KEYS,

    // UN-1: the server row for this platform. Only a real answer replaces the cache: no network, a
    // server error or the table not there yet (before the migration) keep what was read last.
    async refresh() {
      let res;
      try { res = await d.fetchRelease(platform); } catch { return false; }
      if (!res || res.error) return false;
      if (!res.data) await writeJson(KEYS.release, null);
      else await writeJson(KEYS.release, { platform, row: res.data, at: nowMs() });
      emit();
      return true;
    },

    // UN-4: { required: { reason } | null }. The server floor (A-119 DT003) counts only while signed
    // in — signed out it refuses nothing, and it must never stop a sign-in.
    async state({ language = 'en', signedIn = true } = {}) {
      const r = await release();
      if (!R.isRequired(d.appVersion, r, await deviceMin(signedIn))) return { required: null };
      // The founder's reason line belongs to his minimum; the server floor alone has none.
      const byRelease = R.isRequired(d.appVersion, r, null);
      return { required: { reason: byRelease ? R.reasonFor(r, language) : null } };
    },

    // UN-2 / UN-5 / UN-6: the invitation this open may show, or null. Nothing is recorded here: the
    // caller (lib/updateGate) checks the screen is still calm, shows it, then calls recordShown.
    async inviteCandidate({ meta = {}, userId = null, language = 'en', forced = false } = {}) {
      const r = await release();
      const seen = await readJson(KEYS.seen);
      const dec = R.inviteDecision({ appVersion: d.appVersion, release: r, deviceMin: await deviceMin(!!userId), seen, now: nowMs(), forced });
      if (!dec.show) return null;
      return {
        version: dec.version,
        lines: R.linesFor(r, language),
        askOptIn: !!userId && R.askOptIn({ meta, asked: await readJson(KEYS.asked), userId }),
      };
    },
    // The invitation is on screen: the showing counts (UN-2), right away (a kill on the sheet counts).
    async recordShown(ver) {
      await writeJson(KEYS.seen, R.markShown(await readJson(KEYS.seen), ver, nowMs()));
    },

    // UN-5: the answer (the switch as the sheet closed). Only its own key is written (Supabase
    // merges user_metadata keys — never a stale copy of the rest); a failed write is kept here and
    // sent at the next open. A yes first asks for the notification permission (askPermission: the
    // system dialog only while undetermined, AD-88; → granted?) — without it the answer is stored as
    // off (never ON with no way to deliver) — then registers this phone for the push. → { on }
    async answerOptIn(userId, value) {
      if (!userId) return { on: false };
      let v = value === true;
      if (v && d.askPermission) {
        let granted = false;
        try { granted = (await d.askPermission()) === true; } catch { granted = false; }
        if (!granted) v = false;
      }
      await writeJson(KEYS.asked, { userId, value: v, at: nowMs() });
      let ok = false;
      try { const r = await d.writeMeta({ version_news: v }); ok = !(r && r.error); } catch { ok = false; }
      await writeJson(KEYS.pending, ok ? null : { userId, value: v });
      if (v && d.registerPush) { try { await d.registerPush(); } catch { /* next sign-in registers */ } }
      return { on: v };
    },
    async flushPending(userId) {
      const p = await readJson(KEYS.pending);
      if (!p || !userId || p.userId !== userId) return;
      let ok = false;
      try { const r = await d.writeMeta({ version_news: p.value === true }); ok = !(r && r.error); } catch { ok = false; }
      if (ok) await writeJson(KEYS.pending, null);
    },
    // The person changed the switch in Settings: that is the answer from now on.
    async noteSettingsAnswer(userId, value) {
      if (!userId) return;
      await writeJson(KEYS.asked, { userId, value: value === true, at: nowMs() });
      const p = await readJson(KEYS.pending);
      if (p && p.userId === userId) await writeJson(KEYS.pending, null);
    },

    // UN-3 / UN-4 "Atualizar". → 'flexible' | 'immediate' | 'store'
    async update(kind) {
      if (platform === 'android' && play.available) {
        if (kind === 'required') {
          if (await play.startImmediate()) return 'immediate';
        } else if (await play.startFlexible()) {
          if (!stopDownloaded) stopDownloaded = play.onDownloaded(() => { ready = true; emit(); });
          return 'flexible';
        }
      }
      const links = STORE_LINKS[platform] || STORE_LINKS.ios;
      for (const u of links) {
        try { await d.openUrl(u); return 'store'; } catch { /* the next link */ }
      }
      return 'store';
    },
    readyBar: () => ready,
    // "Reiniciar": Play installs the downloaded version and opens the app again.
    async restart() {
      const done = await play.completeUpdate();
      if (done) { ready = false; emit(); }
      return done;
    },

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

module.exports = { createUpdateFlow, KEYS, STORE_LINKS };
