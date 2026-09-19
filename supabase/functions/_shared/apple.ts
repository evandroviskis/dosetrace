// Shared Sign in with Apple server helpers (Deno / Web Crypto).
//
// Used by two edge functions:
//   apple-link   — exchanges an authorization code for a refresh_token at
//                  sign-in, so we can revoke it later (5.1.1(v) / TN3194).
//   delete-user  — revokes the stored refresh_token on account deletion.
//
// Secrets (Supabase Edge → Project Settings → Edge Functions → Secrets), never
// in the app binary, never in git:
//   APPLE_CLIENT_ID       — the client the tokens were issued to. For DoseTrace's
//                           NATIVE Sign in with Apple this is the Bundle ID
//                           (io.outcom.dosetrace).
//   APPLE_TEAM_ID         — Apple Developer Team ID (client_secret `iss`).
//   APPLE_SIA_KEY_ID      — the Key ID of the "Sign in with Apple" .p8 key.
//   APPLE_SIA_PRIVATE_KEY — the .p8 private key contents (PEM). Literal or
//                           escaped newlines are both tolerated.
//
// appleConfigured() lets a caller SKIP Apple work (never fail-closed) when the
// secrets are absent — a config gap must never trap a user's deletion.

export interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKeyPem: string;
}

export function getAppleConfig(): AppleConfig | null {
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_SIA_KEY_ID');
  const privateKeyPem = Deno.env.get('APPLE_SIA_PRIVATE_KEY');
  if (!clientId || !teamId || !keyId || !privateKeyPem) return null;
  return { clientId, teamId, keyId, privateKeyPem };
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const b64urlStr = (s: string): string => b64url(new TextEncoder().encode(s));

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n') // secrets stored with escaped newlines
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Apple client_secret: an ES256 JWT signed with the .p8 key. Short-lived — it is
// used for one request and thrown away.
export async function buildClientSecret(cfg: AppleConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' };
  const payload = {
    iss: cfg.teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: cfg.clientId,
  };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(cfg.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)),
  );
  return `${signingInput}.${b64url(sig)}`;
}

// Exchange an authorization code for tokens (sign-in-time backfill).
// Returns { refresh_token, sub } or null on any failure — callers must never let
// a failure here block sign-in.
export async function exchangeAuthCode(
  cfg: AppleConfig,
  authorizationCode: string,
): Promise<{ refreshToken: string; sub: string | null } | null> {
  try {
    const clientSecret = await buildClientSecret(cfg);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: cfg.clientId,
      client_secret: clientSecret,
    });
    const res = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      console.error('[apple] token exchange non-200:', res.status, await res.text());
      return null;
    }
    const json = await res.json();
    if (!json.refresh_token) {
      console.error('[apple] token exchange returned no refresh_token');
      return null;
    }
    // The id_token's `sub` is the stable Apple user id; decode it best-effort.
    let sub: string | null = null;
    try {
      if (json.id_token) {
        const p = JSON.parse(atob(json.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        sub = p.sub ?? null;
      }
    } catch { /* sub is optional */ }
    return { refreshToken: json.refresh_token, sub };
  } catch (e) {
    console.error('[apple] token exchange threw:', (e as Error)?.message);
    return null;
  }
}

export type RevokeResult = 'revoked' | 'already_gone' | 'transient_error' | 'config_missing';

// Revoke a stored refresh_token. Best-effort by contract:
//   'revoked'         — Apple returned 200.
//   'already_gone'    — Apple returned a 4xx meaning the token is already
//                       invalid/revoked (invalid_grant, invalid_request). There
//                       is nothing left to revoke — the caller treats this as done.
//   'transient_error' — 5xx / network. The caller may retry once, then must still
//                       proceed with deletion (never trap the user — F1/F3).
//   'config_missing'  — secrets absent; caller skips revoke and proceeds.
export async function revokeRefreshToken(cfg: AppleConfig, refreshToken: string): Promise<RevokeResult> {
  let clientSecret: string;
  try {
    clientSecret = await buildClientSecret(cfg);
  } catch (e) {
    console.error('[apple] could not build client_secret (bad key?):', (e as Error)?.message);
    return 'transient_error';
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  let res: Response;
  try {
    res = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    console.error('[apple] revoke network error:', (e as Error)?.message);
    return 'transient_error';
  }
  if (res.status === 200) return 'revoked';
  // 400 invalid_grant / invalid_request = the token is already gone. Nothing to
  // revoke — do NOT block the deletion (journey-review F1).
  if (res.status >= 400 && res.status < 500) {
    console.warn('[apple] revoke 4xx treated as already-gone:', res.status, await res.text().catch(() => ''));
    return 'already_gone';
  }
  console.error('[apple] revoke 5xx:', res.status, await res.text().catch(() => ''));
  return 'transient_error';
}
