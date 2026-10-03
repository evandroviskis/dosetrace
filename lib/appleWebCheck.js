'use strict';
// "Continue with Apple" on Android (founder 2026-10-03 "3 sim"; docs/specs/premium-and-auth.md
// PA-110…PA-115). Pure (node --test); lib/appleWeb.js does the network.
//
// Android has no native Sign in with Apple, so it uses Supabase's web OAuth flow. That flow
// needs server setup the iOS native flow does not (a Services ID + a client-secret JWT in
// Supabase's Apple provider, and our redirect allow-listed). The button shows ONLY when a probe
// of Supabase's /authorize answers like a configured web flow — never a dead button:
//  - the Apple provider is enabled (GET /auth/v1/settings → external.apple);
//  - /authorize redirects to Apple's own page with a client_id that is NOT the iOS bundle id
//    (a bundle id only works for the native flow);
//  - the state Supabase signs carries our redirect as its referrer (an address that is not
//    allow-listed falls back to the Site URL, which would strand the user on the website).

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

function b64urlJson(segment) {
  try {
    let b = String(segment).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const txt = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary');
    return JSON.parse(txt); // the claims Supabase signs are ASCII
  } catch {
    return null;
  }
}

function appleWebReady({ externalApple, finalUrl, bundleId, redirectTo }) {
  if (!externalApple) return false;
  const url = String(finalUrl || '');
  if (!/^https:\/\/appleid\.apple\.com\/auth\/authorize\?/.test(url)) return false;
  const p = queryParams(url);
  const clientId = p.client_id || '';
  if (!clientId || clientId === bundleId) return false;
  const parts = String(p.state || '').split('.');
  if (parts.length < 2) return false;
  const claims = b64urlJson(parts[1]);
  if (!claims || typeof claims.referrer !== 'string') return false;
  return claims.referrer === redirectTo;
}

// Our redirect back from Supabase: the PKCE authorization code, or why there is none.
function parseAppleReturn(url) {
  const p = queryParams(url);
  if (p.error_description || p.error) return { error: p.error_description || p.error };
  if (p.code) return { code: p.code };
  return { error: 'no code' };
}

module.exports = { appleWebReady, parseAppleReturn, queryParams };
