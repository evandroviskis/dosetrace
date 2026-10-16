#!/usr/bin/env node
// Spec audit — the gate between "approved" and "done" (docs/specs/README.md).
//   node scripts/spec-audit.cjs            # all specs
//   node scripts/spec-audit.cjs food-log   # one spec
// Exit 1 when any criterion is unfinished without an approved deviation, claims
// "built" without evidence, cites a test that doesn't exist, or is malformed.
// Warnings (exit 0): checklist not signed by the founder; "built" backed only by
// code references (unverified behavior).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'specs');

// The founder's sign-off text on the "checklist-signed:" line ('' when absent or empty).
// Same line only: \s* used to cross the line break, so an empty sign-off was read as
// signed by the next line ("- committed-to: …") — DV-229.
const readSignature = (text) => (text.match(/checklist-signed:[ \t]*([^\r\n]*)/) || [])[1] || '';
const isUnsigned = (signed) => /pending|^$/i.test(signed.trim());
// Every acceptance-checklist row: a table line whose first cell is a criterion id.
// The prefix may carry digits after its first letter (MB2-1, BK2-3), not only letters.
const criterionRows = (text) => text.split('\n').filter((l) => /^\|\s*[A-Z][A-Z0-9]*-\d+\s*\|/.test(l));

// A spec the founder moved to a LATER release does not block this build (decisions.md
// 2026-10-15: A-119, A-121, A-127 move to the release after 1.3.0). Deferred only when the
// committed-to line names a release later than the app version AND cites the founder —
// a silent deferral still blocks (CLAUDE.md "approved → the next build").
const cmpVersion = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function isDeferred(text, version) {
  const line = (text.match(/committed-to:[ \t]*([^\r\n]*)/) || [])[1] || "";
  if (!/founder/i.test(line) || !version) return false;
  const after = line.match(/after\s+v?(\d+\.\d+\.\d+)/i);
  if (after) return cmpVersion(version, after[1]) <= 0;
  const named = line.match(/(\d+\.\d+\.\d+)/);
  return named ? cmpVersion(named[1], version) > 0 : false;
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());

// A cited test must really exist: __tests__/x.test.js: "name" (substring of the test title).
function testExists(ev) {
  const re = /(__tests__\/[\w.-]+):\s*"((?:[^"\\]|\\.)+)"/g;
  let m, all = true, any = false, todo = false;
  while ((m = re.exec(ev))) {
    any = true;
    const file = path.join(ROOT, m[1]);
    const name = m[2].replace(/\\"/g, '"');
    const src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!src.includes(name)) { all = false; console.log(`      ✗ cited test not found: ${m[1]} "${name}"`); continue; }
    // A test still marked todo is OPEN, never proof (founder / review 2026-09-27).
    const line = src.split('\n').find((l) => l.includes(name)) || '';
    if (/\btodo\s*:/.test(line)) { todo = true; console.log(`      ✗ cited test is still todo (open): ${m[1]} "${name}"`); }
  }
  return { any, all, todo };
}

function main() {
const only = process.argv[2];
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md' && (!only || f === `${only}.md`));
if (!files.length) { console.error(only ? `No spec named ${only}` : 'No specs found'); process.exit(1); }
const version = (JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8")).expo || {}).version || "";
let failures = 0, warnings = 0, deferredSpecs = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const signed = readSignature(text);
  console.log(`\n${f}  ${isUnsigned(signed) ? '(checklist NOT signed by founder)' : `(signed ${signed.trim()})`}`);
  if (isUnsigned(signed)) warnings++;
  const deferred = isDeferred(text, version);
  if (deferred) { deferredSpecs++; console.log(`  DEFERRED by the founder to a later release (${version} build not blocked)`); }
  const rows = criterionRows(text);
  const counts = { built: 0, partial: 0, missing: 0 };
  for (const line of rows) {
    const [id, , status, evidence, deviation] = cells(line);
    const st = (status || '').toLowerCase();
    const approved = /^approved\s+\d{4}-\d{2}-\d{2}/i.test(deviation || '');
    let verdict = 'ok', note = '';
    if (!['built', 'partial', 'missing'].includes(st)) { verdict = 'FAIL'; note = `bad status "${status}"`; }
    else if (st === 'built') {
      if (!evidence) { verdict = 'FAIL'; note = 'built without evidence'; }
      else {
        const t = testExists(evidence);
        if (t.any && !t.all) { verdict = 'FAIL'; note = 'cites a test that does not exist'; }
        else if (t.todo) { verdict = 'FAIL'; note = 'cites a todo test — still open'; }
        else if (!t.any && !/\b(sim|device)\s+\d{4}-\d{2}-\d{2}/.test(evidence)) { verdict = 'WARN'; note = 'code reference only — behavior unverified'; }
      }
    } else if (!approved) { verdict = 'FAIL'; note = `${st} — approved work not delivered (no approved deviation)`; }
    else { note = `${st} — deviation approved`; }
    if (counts[st] != null) counts[st]++;
    if (verdict === 'FAIL' && deferred) { verdict = 'DEFR'; note += ' (deferred)'; }
    if (verdict === 'FAIL') failures++;
    if (verdict === 'WARN') warnings++;
    console.log(`  ${verdict.padEnd(4)} ${id.padEnd(6)} ${st.padEnd(8)} ${note}`);
  }
  console.log(`  → ${counts.built} built · ${counts.partial} partial · ${counts.missing} missing (of ${rows.length})`);
}
console.log(`\n${failures ? `FAIL: ${failures} criterion(s) block the build` : 'PASS'}${warnings ? ` · ${warnings} warning(s)` : ''}${deferredSpecs ? ` · ${deferredSpecs} spec(s) deferred by the founder` : ''}`);
process.exit(failures ? 1 : 0);
}

if (require.main === module) main();
module.exports = { readSignature, isUnsigned, criterionRows, isDeferred };
