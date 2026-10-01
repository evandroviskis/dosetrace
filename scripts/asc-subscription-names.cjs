// Read-only by default: lists the subscription group, its subscriptions, in-app
// purchases and every localized display name on App Store Connect.
//   node scripts/asc-subscription-names.cjs            # list
//   node scripts/asc-subscription-names.cjs --rename   # "DoseTrace Pro" -> "DoseTrace Premium" in display names
const crypto = require('crypto');
const https = require('https');

const KEY_ID = 'N493SYFP2T';
const ISSUER = '69a6de85-8f0f-47e3-e053-5b8c7c11a4d1';
const APP_ID = '6761788157';
const RENAME = process.argv.includes('--rename');
const p8 = require('./ascKey.cjs').readKey();
const b64 = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const si = b64(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })) + '.' +
  b64(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
const TOKEN = si + '.' + b64(crypto.sign('sha256', Buffer.from(si), { key: p8, dsaEncoding: 'ieee-p1363' }));
const api = (p, method = 'GET', body = null) => new Promise((res, rej) => {
  const r = https.request('https://api.appstoreconnect.apple.com' + p, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' } },
    (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => { try { res({ s: x.statusCode, b: JSON.parse(d || '{}') }); } catch { res({ s: x.statusCode, b: d }); } }); });
  r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end();
});
const swap = (s) => (typeof s === 'string' ? s.replace(/DoseTrace Pro\b/g, 'DoseTrace Premium') : s);

async function patch(type, id, attributes, label, v = 'v1') {
  if (!RENAME) return;
  const r = await api(`/${v}/${type}/${id}`, 'PATCH', { data: { type, id, attributes } });
  console.log(`      -> PATCH ${label}: ${r.s}${r.s >= 300 ? ' ' + JSON.stringify(r.b.errors || r.b).slice(0, 300) : ''}`);
}

(async () => {
  const groups = await api(`/v1/apps/${APP_ID}/subscriptionGroups?limit=20`);
  for (const g of groups.b.data || []) {
    console.log(`GROUP ${g.id} referenceName="${g.attributes.referenceName}"`);
    if (swap(g.attributes.referenceName) !== g.attributes.referenceName) await patch('subscriptionGroups', g.id, { referenceName: swap(g.attributes.referenceName) }, 'group referenceName');
    const gl = await api(`/v1/subscriptionGroups/${g.id}/subscriptionGroupLocalizations?limit=50`);
    for (const l of gl.b.data || []) {
      const a = l.attributes;
      console.log(`   group loc ${a.locale}: name="${a.name}" customAppName="${a.customAppName || ''}" state=${a.state}`);
      const n = { name: swap(a.name), customAppName: swap(a.customAppName) };
      if (n.name !== a.name || n.customAppName !== a.customAppName) await patch('subscriptionGroupLocalizations', l.id, n, `group loc ${a.locale}`);
    }
    const subs = await api(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
    for (const s of subs.b.data || []) {
      const a = s.attributes;
      console.log(`   SUB ${s.id} productId=${a.productId} name="${a.name}" state=${a.state}`);
      if (swap(a.name) !== a.name) await patch('subscriptions', s.id, { name: swap(a.name) }, 'subscription reference name');
      const sl = await api(`/v1/subscriptions/${s.id}/subscriptionLocalizations?limit=50`);
      for (const l of sl.b.data || []) {
        const x = l.attributes;
        console.log(`      loc ${x.locale}: name="${x.name}" description="${x.description || ''}" state=${x.state}`);
        const n = { name: swap(x.name), description: swap(x.description) };
        if (n.name !== x.name || n.description !== x.description) await patch('subscriptionLocalizations', l.id, n, `sub loc ${x.locale}`);
      }
    }
  }
  const iaps = await api(`/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`);
  for (const p of iaps.b.data || []) {
    const a = p.attributes;
    console.log(`IAP ${p.id} productId=${a.productId} name="${a.name}" type=${a.inAppPurchaseType} state=${a.state}`);
    if (swap(a.name) !== a.name) await patch('inAppPurchases', p.id, { name: swap(a.name) }, 'iap reference name', 'v2');
    const il = await api(`/v2/inAppPurchases/${p.id}/inAppPurchaseLocalizations?limit=50`);
    for (const l of il.b.data || []) {
      const x = l.attributes;
      console.log(`      loc ${x.locale}: name="${x.name}" description="${x.description || ''}" state=${x.state}`);
      const n = { name: swap(x.name), description: swap(x.description) };
      if (n.name !== x.name || n.description !== x.description) await patch('inAppPurchaseLocalizations', l.id, n, `iap loc ${x.locale}`);
    }
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
