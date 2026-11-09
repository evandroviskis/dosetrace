'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const calc = require('../web/calc-math.js');

const WEB = path.join(__dirname, '../web');
const APPLE = 'https://apps.apple.com/app/id6761788157';
const PLAY = 'https://play.google.com/store/apps/details?id=io.outcom.dosetrace';
const NAMED_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot',
  'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended',
];
const BANNED = [
  /\bpeptide/i, /\btrt\b/i, /testosterone/i, /evox/i, /bacteriostatic/i,
  /\binject\b/i, /safe dose/i, /correct dose/i, /recommended dose/i, /you should take/i,
];

function read(rel) {
  return fs.readFileSync(path.join(WEB, rel), 'utf8');
}

function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function publicHtml() {
  return walk(WEB, []).filter((abs) => {
    const rel = path.relative(WEB, abs).split(path.sep).join('/');
    if (!rel.endsWith('.html')) return false;
    if (rel === 'adm.html' || rel.startsWith('auth/')) return false;
    return true;
  }).map((abs) => path.relative(WEB, abs).split(path.sep).join('/'));
}

function canonical(rel) {
  if (rel === 'index.html') return 'https://dosetrace.io/';
  return 'https://dosetrace.io/' + rel.replace(/\.html$/, '');
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
  return blocks;
}

function hasKey(node, key) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => hasKey(item, key));
  if (Object.prototype.hasOwnProperty.call(node, key)) return true;
  return Object.values(node).some((item) => hasKey(item, key));
}

function collect(node, key, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => collect(item, key, acc));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(node, key)) acc.push(node[key]);
  Object.values(node).forEach((item) => collect(item, key, acc));
}

function robotGroups(text) {
  const groups = [];
  let current = null;
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      current = { agents: [value], disallow: [] };
      groups.push(current);
    } else if (key === 'disallow' && current) current.disallow.push(value);
  }
  return groups;
}

function assertClean(label, text) {
  for (const pattern of BANNED) {
    assert.doesNotMatch(text, pattern, label + ' matched ' + pattern);
  }
}

test('sitemap lists exactly the public html pages and skips admin and auth', () => {
  const pages = publicHtml();
  assert.ok(pages.includes('index.html'));
  assert.ok(pages.includes('privacy-policy.html'));
  assert.equal(pages.includes('adm.html'), false);
  assert.equal(pages.some((rel) => rel.startsWith('auth/')), false);
  const xml = read('sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.slice().sort(), pages.map(canonical).sort());
  assert.equal(/\/adm(?:\.|\/|<)/.test(xml), false);
  assert.equal(xml.includes('/auth'), false);
  const calculators = pages.filter((rel) => rel.startsWith('how-to-'));
  assert.equal(calculators.length, 4);
  for (const rel of calculators) {
    const html = read(rel);
    const canonicalHref = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    assert.equal(canonicalHref, canonical(rel), rel);
  }
});

test('every robots group keeps admin and auth disallowed', () => {
  const text = read('robots.txt');
  const groups = robotGroups(text);
  const agents = groups.map((g) => g.agents[0]);
  assert.deepEqual(agents.slice().sort(), ['*', ...NAMED_BOTS].sort());
  for (const group of groups) {
    assert.ok(group.disallow.includes('/adm.html'), group.agents[0]);
    assert.ok(group.disallow.includes('/adm'), group.agents[0]);
    assert.ok(group.disallow.includes('/auth/'), group.agents[0]);
    assert.equal(group.disallow.includes('/'), false, group.agents[0] + ' blocked the whole site');
  }
  assert.match(text, /^Sitemap: https:\/\/dosetrace\.io\/sitemap\.xml$/m);
  assert.match(text, /does not control ranking/);
  assert.match(text, /Disallow is not access control/);
});

test('llms.txt states facts and does not promise ranking', () => {
  const text = read('llms.txt');
  assert.match(text, /Outcom/);
  assert.doesNotMatch(text, /Evox/i);
  assert.match(text, /does not control search ranking/);
  assert.match(text, /does not recommend a dose/);
  assert.match(text, /not for a healthcare professional dosing a patient/);
  assert.match(text, /1000/);
  for (const url of [
    'https://dosetrace.io/',
    'https://dosetrace.io/privacy-policy',
    'https://dosetrace.io/how-to-convert-mg-to-ml-for-a-syringe',
    'https://dosetrace.io/how-to-calculate-reconstitution-concentration',
    'https://dosetrace.io/how-to-convert-mcg-and-mg',
    'https://dosetrace.io/how-to-calculate-a-tablet-fraction',
    APPLE,
    PLAY,
  ]) {
    assert.ok(text.includes(url), url);
  }
  assert.doesNotMatch(text, /\$\d|aggregateRating|reviews?/i);
  assertClean('llms.txt', text.replace(/injectables/g, 'products'));
});

test('homepage JSON-LD is free DoseTrace from Outcom, without ratings or a Premium price', () => {
  const html = read('index.html');
  assert.match(html, /Track every protocol with/);
  assert.match(html, /a product of Outcom/);
  assert.doesNotMatch(html, /Evox/i);
  const blocks = jsonLdBlocks(html);
  assert.equal(blocks.length, 1);
  const graph = blocks[0]['@graph'];
  const app = graph.find((node) => node['@type'] === 'SoftwareApplication');
  const org = graph.find((node) => node['@type'] === 'Organization');
  assert.equal(app.name, 'DoseTrace');
  assert.equal(app.applicationCategory, 'HealthApplication');
  assert.match(app.operatingSystem, /iOS/);
  assert.match(app.operatingSystem, /Android/);
  assert.equal(app.offers.price, '0');
  assert.equal(app.offers.priceCurrency, 'USD');
  assert.match(app.offers.description, /Optional paid Premium/);
  assert.doesNotMatch(app.offers.description, /\$\d/);
  assert.deepEqual(app.sameAs, [APPLE, PLAY]);
  assert.equal(org.name, 'Outcom');
  assert.equal(org['@id'], app.publisher['@id']);
  for (const key of ['aggregateRating', 'review', 'reviewCount', 'ratingValue', 'ratingCount']) {
    assert.equal(hasKey(blocks[0], key), false, key);
  }
  const prices = [];
  collect(blocks[0], 'price', prices);
  assert.deepEqual(prices, ['0']);
  assertClean('json-ld', JSON.stringify(blocks[0]).replace(/injectables/g, 'products'));
  const nav = html.slice(html.indexOf('id="calculators-nav"'), html.indexOf('f_getapp'));
  for (const href of [
    '/how-to-convert-mg-to-ml-for-a-syringe',
    '/how-to-calculate-reconstitution-concentration',
    '/how-to-convert-mcg-and-mg',
    '/how-to-calculate-a-tablet-fraction',
  ]) {
    assert.ok(nav.includes(href), href);
  }
  assert.ok(html.includes(APPLE));
  assert.ok(html.includes(PLAY));
});

test('calculator pages keep the safety text, real store links, and public routes', () => {
  const pages = [
    'how-to-convert-mg-to-ml-for-a-syringe.html',
    'how-to-calculate-reconstitution-concentration.html',
    'how-to-convert-mcg-and-mg.html',
    'how-to-calculate-a-tablet-fraction.html',
  ];
  const allowedExternal = new Set([
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    APPLE,
    PLAY,
  ]);
  for (const rel of pages) {
    const html = read(rel);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<h1>[^<]+\?<\/h1>/);
    assert.ok(html.includes('Example only'), rel);
    assert.ok(html.includes(calc.PRESCRIBER), rel);
    assert.ok(html.includes(calc.SELF_USE), rel);
    for (const line of calc.LIMITATIONS) assert.ok(html.includes(line), line);
    assert.ok(html.includes(APPLE), rel);
    assert.ok(html.includes(PLAY), rel);
    assert.ok(html.includes('Outcom'), rel);
    assert.doesNotMatch(html, /Evox/i);
    assertClean(rel, html);
    const blocks = jsonLdBlocks(html);
    assert.equal(blocks.length, 1, rel);
    assert.equal(blocks[0]['@type'], 'WebPage');
    assert.equal(hasKey(blocks[0], 'aggregateRating'), false);
    const urls = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const raw of urls) {
      if (raw.startsWith('mailto:')) continue;
      if (raw.startsWith('#')) continue;
      let url = raw;
      if (url.startsWith('https://dosetrace.io')) url = url.slice('https://dosetrace.io'.length) || '/';
      if (url.startsWith('https://')) {
        const origin = new URL(url).origin;
        assert.ok(allowedExternal.has(url) || allowedExternal.has(origin), rel + ' -> ' + raw);
        continue;
      }
      assert.ok(url.startsWith('/'), rel + ' -> ' + raw);
      const clean = url.split('#')[0].split('?')[0];
      const relPath = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
      const candidates = [relPath, relPath + '.html'];
      assert.ok(candidates.some((c) => fs.existsSync(path.join(WEB, c))), rel + ' missing ' + raw);
    }
  }
  const syringe = read(pages[0]);
  assert.ok(syringe.includes(calc.SYRINGE_CALIBRATION));
  assert.match(syringe, /32 units on a U-100 insulin syringe only/);
  assert.match(syringe, /12\.8 units on a U-40 insulin syringe only/);
  assert.match(syringe, /0\.32 mL/);
  const recon = read(pages[1]);
  assert.match(recon, /10 mg ÷ 2 mL = 5 mg\/mL/);
  assert.match(recon, /5000 mcg\/mL/);
  const mass = read(pages[2]);
  assert.match(mass, /1 mg × 1000 = 1000 mcg/);
  assert.match(mass, /1000 mcg ÷ 1000 = 1 mg/);
  assert.match(mass, /0\.5 mg × 1000 = 500 mcg/);
  const tablet = read(pages[3]);
  assert.ok(tablet.includes(calc.TABLET_NOTICE));
  assert.match(tablet, /extended-release/);
  assert.match(tablet, /enteric-coated/);
  assert.match(tablet, /1\/2 × a tablet labeled 10 mg = 5 mg/);
});

test('new guide and tutorial pages are public, limited, and free of banned terms', () => {
  const LIMITS = 'DoseTrace calculates with the numbers you type. It does not choose a dose, does not interpret a lab result, and does not check drug interactions. It is for your own records, not a clinical tool for treating patients.';
  const TODO = '<!-- TODO: real Demo screenshot coming from Claude -->';
  const extraBanned = [/tirzepatide/i, /\bbpc\b/i, /glp-?1/i, /semaglutide/i, /compared with other apps/i];
  const pages = [
    'how-dosetrace-tracks-vials.html',
    'how-dosetrace-charts-a-lab-marker.html',
    'how-dosetrace-reminders-work.html',
    'how-dosetrace-keeps-a-dose-history.html',
    'about-outcom-help-and-limits.html',
    'tutorials.html',
    'is-250-mcg-the-same-as-250-mg.html',
    'how-is-half-of-a-tablet-calculated.html',
    'how-a-lab-marker-is-charted-over-time.html',
    'how-do-i-mark-a-vitamin-dose.html',
    'how-do-i-log-a-vaccine.html',
    'how-do-i-log-a-weigh-in.html',
  ];
  const todoPages = new Set([
    'how-dosetrace-tracks-vials.html',
    'how-dosetrace-keeps-a-dose-history.html',
  ]);
  const xml = read('sitemap.xml');
  const llms = read('llms.txt');
  const home = read('index.html');
  for (const rel of pages) {
    assert.equal(fs.existsSync(path.join(WEB, rel)), true, rel);
    const html = read(rel);
    const url = canonical(rel);
    assert.ok(xml.includes('<loc>' + url + '</loc>'), url);
    assert.ok(llms.includes(url), 'llms ' + url);
    assert.ok(html.includes(LIMITS), rel);
    assert.equal(html.includes(TODO), todoPages.has(rel), rel + ' TODO spot');
    assertClean(rel, html);
    for (const pattern of extraBanned) assert.doesNotMatch(html, pattern, rel);
    const blocks = jsonLdBlocks(html);
    assert.ok(blocks.length >= 1, rel);
    for (const key of ['aggregateRating', 'review', 'reviewCount', 'ratingValue', 'ratingCount']) {
      assert.equal(hasKey(blocks[0], key), false, rel + ' ' + key);
    }
    const imgs = [...html.matchAll(/\bsrc="(\/img\/[^"]+)"/g)].map((m) => m[1]);
    for (const src of imgs) {
      assert.equal(fs.existsSync(path.join(WEB, src.slice(1))), true, src);
    }
    for (const raw of [...html.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1])) {
      if (raw.startsWith('mailto:') || raw.startsWith('#')) continue;
      if (raw.startsWith('https://outcom.io')) continue;
      let urlPath = raw;
      if (urlPath.startsWith('https://dosetrace.io')) urlPath = urlPath.slice('https://dosetrace.io'.length) || '/';
      if (urlPath.startsWith('https://')) {
        const origin = new URL(urlPath).origin;
        assert.ok([APPLE, PLAY, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(urlPath) || ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(origin), raw);
        continue;
      }
      const clean = urlPath.split('#')[0].split('?')[0];
      const relPath = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
      assert.ok([relPath, relPath + '.html'].some((c) => fs.existsSync(path.join(WEB, c))), rel + ' -> ' + raw);
    }
  }
  assert.ok(read('how-dosetrace-charts-a-lab-marker.html').includes('Vitamin D'));
  assert.match(read('how-dosetrace-charts-a-lab-marker.html'), /24, then 31, then 36 ng\/mL/);
  assert.ok(read('how-dosetrace-reminders-work.html').includes('/img/reminders-check.webp'));
  assert.ok(read('how-is-half-of-a-tablet-calculated.html').includes(calc.TABLET_NOTICE));
  assert.ok(home.includes('/about-outcom-help-and-limits'));
  assert.ok(home.includes('id="guides-nav"'));
  assert.ok(read('is-250-mcg-the-same-as-250-mg.html').includes('/how-to-convert-mcg-and-mg'));
  assert.ok(read('is-250-mcg-the-same-as-250-mg.html').includes('/how-to-convert-mg-to-ml-for-a-syringe'));
});
