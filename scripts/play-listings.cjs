#!/usr/bin/env node
// Publish the translated Google Play store listings (title, short and full description) from
// store/listing/<lang>.md (front matter play_title / play_short, body = full description).
// Founder 2026-10-17: "aprovo, publique os textos traduzidos no Google Play". en-US is left as it
// is live (the approval was for the translations); pass --with-en to also replace it.
// Manual RS256 JWT -> OAuth -> Android Publisher edits (same auth as play-set-icon.cjs).
//   node scripts/play-listings.cjs            # dry run: checks lengths, shows live vs new, discards the edit
//   node scripts/play-listings.cjs --commit   # writes the listings and commits the edit
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PKG = 'io.outcom.dosetrace';
const COMMIT = process.argv.includes('--commit');
const WITH_EN = process.argv.includes('--with-en');
const ROOT = path.join(__dirname, '..');
const LOCALES = { de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', en: 'en-US' };
const LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 };

function readListing(lang) {
  const src = fs.readFileSync(path.join(ROOT, 'store', 'listing', `${lang}.md`), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(src);
  if (!m) throw new Error(`${lang}.md: no front matter`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*"(.*)"\s*$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/\\"/g, '"');
  }
  const listing = { language: LOCALES[lang], title: fm.play_title, shortDescription: fm.play_short, fullDescription: m[2].trim() };
  for (const [k, max] of Object.entries(LIMITS)) {
    if (!listing[k]) throw new Error(`${lang}: missing ${k}`);
    if ([...listing[k]].length > max) throw new Error(`${lang}: ${k} is ${[...listing[k]].length} > ${max}`);
  }
  if (/\b(iPhone|App Store|Apple Health)\b/.test(listing.fullDescription)) throw new Error(`${lang}: names an Apple product in the Play listing`);
  return listing;
}

const SA = JSON.parse(fs.readFileSync(path.join(ROOT, 'google-play-service-account.json'), 'utf8'));
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(SA.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const j = await res.json(); if (!j.access_token) throw new Error('token failed'); return j.access_token;
}
async function api(token, method, url, body) {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${txt}`); return j;
}

(async () => {
  const langs = ['pt', 'es', 'fr', 'de', 'it', ...(WITH_EN ? ['en'] : [])];
  const listings = langs.map(readListing);
  for (const l of listings) console.log(`${l.language}: title ${[...l.title].length}/30 · short ${[...l.shortDescription].length}/80 · full ${[...l.fullDescription].length}/4000 — "${l.title}"`);
  const token = await getToken();
  const edit = await api(token, 'POST', '/edits');
  let committed = false;
  try {
    const live = await api(token, 'GET', `/edits/${edit.id}/listings`);
    console.log('live listing languages:', (live.listings || []).map((l) => l.language).join(', ') || '(none)');
    for (const l of listings) await api(token, 'PUT', `/edits/${edit.id}/listings/${l.language}`, l);
    const after = await api(token, 'GET', `/edits/${edit.id}/listings`);
    console.log('in this edit:', (after.listings || []).map((l) => `${l.language} "${l.title}"`).join(' | '));
    await api(token, 'POST', `/edits/${edit.id}:validate`);
    console.log('validate: OK');
    if (COMMIT) {
      await api(token, 'POST', `/edits/${edit.id}:commit`);
      committed = true;
      console.log('COMMITTED — listings written.');
    } else {
      console.log('DRY RUN — nothing committed; discarding the edit.');
    }
  } finally {
    if (!committed) await api(token, 'DELETE', `/edits/${edit.id}`).catch(() => {});
  }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
