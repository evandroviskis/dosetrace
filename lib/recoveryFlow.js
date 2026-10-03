'use strict';
// Password-reset link rules (docs/specs/premium-and-auth.md PA-75, PA-76; decided 2026-10-03
// by logic). Pure (node --test); lib/recoveryLink.js does the network and storage.
//
//  - The link's session is opened in an ISOLATED client, so the account the app is signed in
//    to is untouched until the new password is saved ("nothing half-written").
//  - The link's session is kept as a pending recovery for up to an hour, so killing the app
//    on Reset password brings the same screen back on the next launch (the link "reopens").
//  - A link for a different account than the one signed in asks first, naming both: continue
//    (sign out of the current account, then set the password) or cancel.

const RECOVERY_TTL_MS = 60 * 60 * 1000;

function buildPending({ session, user }, nowMs) {
  if (!session || !session.access_token || !session.refresh_token) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    userId: (user && user.id) || (session.user && session.user.id) || null,
    email: (user && user.email) || (session.user && session.user.email) || '',
    at: nowMs,
  };
}

function pendingRecoveryUsable(p, nowMs) {
  if (!p || !p.access_token || !p.refresh_token) return false;
  const at = Number(p.at);
  return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at < RECOVERY_TTL_MS;
}

// 'proceed' — nobody signed in, or the link is for the account already signed in.
// 'ask'     — another account is signed in: name both, continue or cancel.
function recoveryDecision({ currentUserId, linkUserId }) {
  if (!currentUserId) return 'proceed';
  if (linkUserId && currentUserId === linkUserId) return 'proceed';
  return 'ask';
}

function parseAuthLink(url) {
  try {
    // Split by hand (React Native's URL does not implement every getter).
    const s = String(url || '');
    const hashAt = s.indexOf('#');
    const beforeHash = hashAt >= 0 ? s.slice(0, hashAt) : s;
    const hash = hashAt >= 0 ? s.slice(hashAt + 1) : '';
    const qAt = beforeHash.indexOf('?');
    const query = qAt >= 0 ? beforeHash.slice(qAt + 1) : '';
    const params = (str) => {
      const out = {};
      for (const part of str.split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const k = decodeURIComponent((eq >= 0 ? part.slice(0, eq) : part).replace(/\+/g, ' '));
        const v = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : '').replace(/\+/g, ' '));
        if (!(k in out)) out[k] = v;
      }
      return out;
    };
    const qs = params(query);
    const hs = params(hash);
    const pick = (k) => qs[k] || hs[k] || null;
    const err = pick('error_description') || pick('error');
    if (err) return { error: String(err).replace(/\+/g, ' ') };
    if (pick('code')) return { code: pick('code') };
    if (pick('access_token') && pick('refresh_token')) return { tokens: { access_token: pick('access_token'), refresh_token: pick('refresh_token') } };
    return { error: 'no code in link' };
  } catch {
    return { error: 'bad link' };
  }
}

// One key per emailed link (its code, else the whole URL) — App.js handles each once.
function linkKey(url) {
  const l = parseAuthLink(url);
  return l.code ? 'code:' + l.code : 'url:' + String(url || '');
}

module.exports = { linkKey, RECOVERY_TTL_MS, buildPending, pendingRecoveryUsable, recoveryDecision, parseAuthLink };
