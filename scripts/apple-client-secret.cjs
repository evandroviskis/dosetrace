#!/usr/bin/env node
// Make the client-secret JWT Supabase's Apple provider needs for the WEB flow ("Continue with
// Apple" on Android — docs/specs/premium-and-auth.md, manual setup step 3). Apple caps its life
// at about 6 months (15777000 s): run this again before it expires and paste the new value in
// Supabase → Authentication → Providers → Apple → Secret Key (for OAuth). The expiry date it
// prints goes into STATE.md (and a calendar reminder).
//
//   node scripts/apple-client-secret.cjs --team TEAMID --key KEYID --client io.outcom.dosetrace.signin --p8 /path/AuthKey_KEYID.p8
//
// The .p8 private key is read from the path given — never stored in the repo, never printed.
const crypto = require('crypto');
const fs = require('fs');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const team = arg('team');
const keyId = arg('key');
const client = arg('client');
const p8 = arg('p8');
if (!team || !keyId || !client || !p8) {
  console.error('usage: --team TEAMID --key KEYID --client SERVICES_ID --p8 /path/AuthKey.p8');
  process.exit(1);
}

const MAX_LIFE_S = 15777000; // Apple's maximum for a Sign in with Apple client secret (~6 months)
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const exp = now + MAX_LIFE_S - 60;
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const claims = { iss: team, iat: now, exp, aud: 'https://appleid.apple.com', sub: client };
const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
const key = crypto.createPrivateKey(fs.readFileSync(p8, 'utf8'));
const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
console.log(`${input}.${b64url(sig)}`);
console.error(`expires: ${new Date(exp * 1000).toISOString()} — record it in STATE.md and renew before then`);
