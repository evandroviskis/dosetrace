'use strict';
// AD-96 B copy (1.3.2), founder 2026-10-26 option B on docs/design/ad96-curve-copy.html: the one-time
// notice "The curve now uses your logged doses" is a card at the top of Dose accumulation, shown at
// every open until "Got it", only to accounts that had a protocol before this phone first ran 1.3.2
// (they saw the old curve; new accounts never see it). "Got it" is one key in the account (Supabase
// merges user_metadata keys, as A-127 UN-5) and, for that account, on this phone — so a failed write
// still hides it here and is sent again at the next check. The wiring is lib/curveNoticeRuntime.
const NOTICE_META_KEY = 'curve_logged_notice_seen';
const SINCE_KEY = 'dt_curve_logged_since';
const SEEN_KEY = 'dt_curve_logged_seen';

const ms = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? t : NaN; };

function shouldShowCurveNotice({ meta, protocols, since, localSeen, userId }) {
  if (!userId || !(since > 0)) return false;
  if (meta && meta[NOTICE_META_KEY] === true) return false;
  if (localSeen && localSeen.userId === userId) return false;
  return (protocols || []).some((p) => p && ms(p.created_at) < since);
}

function createCurveNotice({ storage, now = () => Date.now(), writeMeta }) {
  const get = async (k) => { try { return await storage.getItem(k); } catch { return null; } };
  const set = async (k, v) => { try { await storage.setItem(k, v); return true; } catch { return false; } };
  const readSeen = async () => { try { return JSON.parse(await get(SEEN_KEY)); } catch { return null; } };
  async function readSince() {
    const v = Number(await get(SINCE_KEY));
    return v > 0 ? v : null;
  }
  async function send() {
    try { const r = await writeMeta({ [NOTICE_META_KEY]: true }); return !(r && r.error); } catch { return false; }
  }
  return {
    readSince,
    // The first run of this code on this phone; never moved afterwards. → the marker, or null.
    async markSince() {
      const had = await readSince();
      if (had) return had;
      const t = now();
      return (await set(SINCE_KEY, String(t))) ? t : null;
    },
    async shouldShow({ userId, meta, protocols }) {
      return shouldShowCurveNotice({ meta, protocols, since: await readSince(), localSeen: await readSeen(), userId });
    },
    async dismiss(userId) {
      if (!userId) return;
      const ok = await send();
      await set(SEEN_KEY, JSON.stringify({ userId, sent: ok }));
    },
    // A "Got it" whose account write failed is sent again (the account does not have it yet).
    async flush(userId, meta) {
      if (!userId || (meta && meta[NOTICE_META_KEY] === true)) return;
      const seen = await readSeen();
      if (!seen || seen.userId !== userId || seen.sent) return;
      if (await send()) await set(SEEN_KEY, JSON.stringify({ userId, sent: true }));
    },
  };
}

module.exports = { NOTICE_META_KEY, SINCE_KEY, SEEN_KEY, shouldShowCurveNotice, createCurveNotice };
