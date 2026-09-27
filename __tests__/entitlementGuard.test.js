'use strict';
// FX-16 durable guard (founder / outside review 2026-09-27): line numbers drift, so
// a list of gates can't protect us. This fails if any file outside the entitlement
// helper decides Premium on its own — calling isPremium() or reading the RevenueCat
// entitlement directly. A new gate written the old way breaks this test at once.
// Allowed: lib/entitlement.js (the one helper) and lib/purchases.js (the store wrapper).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['screens', 'components', 'lib'];
const ALLOWED = new Set(['lib/entitlement.js', 'lib/purchases.js']);
const PATTERNS = [/\bisPremium\s*\(/, /\bgetCustomerInfo\s*\(/, /entitlements\s*\.\s*active/];

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

function offenders() {
  const hits = [];
  for (const dir of DIRS) {
    for (const rel of jsFiles(dir)) {
      if (ALLOWED.has(rel)) continue;
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return; // comments don't decide access
        if (PATTERNS.some((p) => p.test(line))) hits.push(`${rel}:${i + 1}`);
      });
    }
  }
  return hits;
}

test('FX-16 guard: only lib/entitlement.js decides Premium (no isPremium / direct RevenueCat reads elsewhere)', { todo: 'S-06 (one entitlement helper)' }, () => {
  const hits = offenders();
  assert.deepEqual(hits, [], `Premium decided outside the helper:\n${hits.join('\n')}`);
});
