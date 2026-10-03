'use strict';
// "Continue with Apple" on Android (founder 2026-10-03 "3 sim"; docs/specs/premium-and-auth.md
// PA-110…PA-115, PA-120). Pure (node --test); lib/appleWeb.js does the network.
//
// Android has no native Sign in with Apple, so it uses Supabase's web OAuth flow. That flow
// needs server setup the iOS native flow does not: a Services ID + a client-secret JWT in
// Supabase's Apple provider. The button shows ONLY when a probe of Supabase's /authorize
// answers like a configured web flow — never a dead button:
//  - the Apple provider is enabled (GET /auth/v1/settings → external.apple);
//  - /authorize redirects to Apple's own page with a client_id that is NOT the iOS bundle id
//    (without the secret Supabase answers 400 "missing OAuth secret"; a bundle id alone only
//    works for the native flow).
// What a probe cannot see (Gate B, 2026-10-03): whether dosetrace://auth-callback is
// allow-listed — Supabase falls back to the Site URL silently. That is setup step 5, checked
// on a device by the founder before relying on it.

function queryParams(url) {
  const s = String(url || '');
  const q = s.indexOf('?');
  const h = s.indexOf('#');
  const parts = [];
  if (q >= 0) parts.push(s.slice(q + 1, h > q ? h : undefined));
  if (h >= 0) parts.push(s.slice(h + 1));
  const out = {};
  for (const part of parts.join('&').split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decodeURIComponent((eq >= 0 ? part.slice(0, eq) : part).replace(/\+/g, ' '));
    const v = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : '').replace(/\+/g, ' '));
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function appleWebReady({ externalApple, finalUrl, bundleId }) {
  if (!externalApple) return false;
  const url = String(finalUrl || '');
  if (!/^https:\/\/appleid\.apple\.com\/auth\/authorize\?/.test(url)) return false;
  const clientId = queryParams(url).client_id || '';
  return !!clientId && clientId !== bundleId;
}

// Our redirect back from Supabase: the PKCE authorization code, or why there is none.
function parseAppleReturn(url) {
  const p = queryParams(url);
  if (p.error_description || p.error) return { error: p.error_description || p.error };
  if (p.code) return { code: p.code };
  return { error: 'no code' };
}

module.exports = { appleWebReady, parseAppleReturn, queryParams };
