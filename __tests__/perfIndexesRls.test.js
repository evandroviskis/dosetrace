'use strict';
// Load test 2026-11-03 (docs/review/load-test-2026-11-03.md): the performance migration
// supabase/migrations/20261103120000_perf_indexes_rls.sql, checked statically against the production
// policies captured that day (__tests__/fixtures/prodPolicies-2026-11-03.json, pg_policies verbatim).
//
// 1. Every policy the advisor flagged (auth.uid() evaluated per row, lint auth_rls_initplan: 56) is
//    rewritten with (select auth.uid()) and no bare auth.uid() is left in any policy.
// 2. No policy's meaning changed: same roles, command and permissive flag (the migration only uses
//    ALTER POLICY ... USING / WITH CHECK, which cannot touch them); the expressions are the production
//    text with only the call wrapped. The one merge (referrals: two permissive SELECT policies for the
//    same role) is the OR of the two, which is what Postgres already did with two permissive policies.
// 3. The indexes exist: every foreign key the advisor listed without a covering index, plus the
//    (user_id, updated_at, id) keyset index the sync pull reads on the big tables.
// 4. Scope: plain "create index if not exists" (no concurrently), nothing dropped but the merged
//    policy, no statement of any other kind.
// The effect on real Postgres + PostgREST (same rows visible/writable before and after, every table)
// is proven by scripts/load-test/run.cjs (opt-in, Docker), not here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION = path.join(__dirname, '../supabase/migrations/20261103120000_perf_indexes_rls.sql');
const FIXTURE = require('./fixtures/prodPolicies-2026-11-03.json').policies;

const ws = (s) => String(s).replace(/\s+/g, ' ').trim();
const WRAPPED = /\(\s*select\s+auth\.uid\(\)\s*\)/gi;
// Logic fingerprint: the call unwrapped, then parentheses, whitespace and case dropped (pg's deparse
// adds parentheses the migration does not need to repeat).
const logic = (s) => (s == null ? null : ws(s).replace(WRAPPED, 'auth.uid()').replace(/[()\s]/g, '').toLowerCase());
const bareUid = (s) => s != null && /auth\.uid\(\)/i.test(String(s).replace(WRAPPED, ''));

function readGroup(s, i) {
  if (s[i] !== '(') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') depth++;
    else if (s[j] === ')') { depth--; if (depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 }; }
  }
  return null;
}

function statements(sql) {
  const noComments = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  return noComments.split(';').map(ws).filter(Boolean);
}

function apply(sql) {
  const pol = new Map(FIXTURE.map((p) => [`${p.tablename}|${p.policyname}`, { ...p, touched: false }]));
  const indexes = [];
  const problems = [];
  for (const st of statements(sql)) {
    let m;
    if ((m = st.match(/^alter policy "([^"]+)" on public\.(\w+) rename to "([^"]+)"$/i))) {
      const k = `${m[2]}|${m[1]}`;
      if (!pol.has(k)) { problems.push(`rename of a policy not in production: ${k}`); continue; }
      const p = pol.get(k); pol.delete(k); pol.set(`${m[2]}|${m[3]}`, { ...p, policyname: m[3], renamedFrom: m[1] });
    } else if ((m = st.match(/^alter policy "([^"]+)" on public\.(\w+)(.*)$/i))) {
      const k = `${m[2]}|${m[1]}`;
      if (!pol.has(k)) { problems.push(`alter of a policy not in production: ${k}`); continue; }
      const p = pol.get(k);
      let rest = m[3];
      if (/^ to /i.test(rest)) { problems.push(`${k}: the roles must not change`); continue; }
      if (/^ using /i.test(rest)) {
        const g = readGroup(rest, rest.indexOf('('));
        if (!g) { problems.push(`${k}: unbalanced USING`); continue; }
        p.qual = g.inner; rest = rest.slice(g.end);
      }
      if (/^ with check /i.test(rest)) {
        const g = readGroup(rest, rest.indexOf('('));
        if (!g) { problems.push(`${k}: unbalanced WITH CHECK`); continue; }
        p.with_check = g.inner; rest = rest.slice(g.end);
      }
      if (rest.trim()) problems.push(`${k}: unexpected text after the policy: ${rest}`);
      p.touched = true;
    } else if ((m = st.match(/^drop policy if exists "([^"]+)" on public\.(\w+)$/i))) {
      const k = `${m[2]}|${m[1]}`;
      if (!pol.has(k)) problems.push(`drop of a policy not in production: ${k}`);
      pol.delete(k);
    } else if ((m = st.match(/^create index if not exists (\w+) on public\.(\w+) (?:using btree )?\(([^)]+)\)$/i))) {
      indexes.push({ name: m[1], table: m[2], cols: m[3].split(',').map((c) => c.trim().toLowerCase()) });
    } else {
      problems.push(`statement outside the scope (indexes + policy rewrites only): ${st.slice(0, 120)}`);
    }
  }
  return { pol, indexes, problems };
}

const read = () => {
  assert.ok(fs.existsSync(MIGRATION), `the migration ${path.relative(path.join(__dirname, '..'), MIGRATION)} must exist`);
  return fs.readFileSync(MIGRATION, 'utf8');
};

test('the production fixture holds the 56 flagged policies (auth.uid() per row) the advisor listed', () => {
  assert.equal(FIXTURE.filter((p) => bareUid(p.qual) || bareUid(p.with_check)).length, 56);
});

test('the migration has only index creations and policy rewrites, in the expected form', () => {
  const raw = read();
  const { problems } = apply(raw);
  assert.deepEqual(problems, []);
  const sql = statements(raw).join(';\n'); // the statements, without the header's comments
  assert.doesNotMatch(sql,/\bconcurrently\b/i, 'plain create index (tables are small, the lock is milliseconds)');
  assert.doesNotMatch(sql, /\bdrop\s+index\b/i, 'unused indexes stay (out of scope)');
  assert.doesNotMatch(sql, /\bcreate\s+policy\b/i, 'ALTER POLICY keeps roles, command and permissive flag as they are');
});

test('every policy calls auth.uid() once per statement: (select auth.uid()), never bare', () => {
  const { pol } = apply(read());
  const bare = [...pol.values()].filter((p) => bareUid(p.qual) || bareUid(p.with_check)).map((p) => `${p.tablename}: ${p.policyname}`);
  assert.deepEqual(bare, []);
  const flagged = FIXTURE.filter((p) => bareUid(p.qual) || bareUid(p.with_check));
  for (const f of flagged) {
    const now = [...pol.values()].find((p) => p.tablename === f.tablename && (p.policyname === f.policyname || p.renamedFrom === f.policyname));
    const merged = f.tablename === 'referrals' && f.policyname === 'Users can see their own referral record';
    assert.ok(merged || (now && now.touched), `${f.tablename}: "${f.policyname}" rewritten`);
  }
});

test('no policy changed meaning: same roles, command, permissive flag and the same expression (only the call wrapped)', () => {
  const { pol } = apply(read());
  const prod = new Map(FIXTURE.map((p) => [`${p.tablename}|${p.policyname}`, p]));
  for (const p of pol.values()) {
    const orig = prod.get(`${p.tablename}|${p.renamedFrom || p.policyname}`);
    assert.ok(orig, `${p.tablename}: "${p.policyname}" comes from production`);
    assert.equal(p.roles, orig.roles, `${p.policyname}: roles`);
    assert.equal(p.cmd, orig.cmd, `${p.policyname}: command`);
    assert.equal(p.permissive, orig.permissive, `${p.policyname}: permissive`);
    if (p.tablename === 'referrals' && orig.cmd === 'SELECT') continue; // the merge, checked below
    assert.equal(logic(p.qual), logic(orig.qual), `${p.tablename}: "${p.policyname}" USING`);
    assert.equal(logic(p.with_check), logic(orig.with_check), `${p.tablename}: "${p.policyname}" WITH CHECK`);
  }
  // Every production policy is still there (under its name), except the one folded into the merge.
  const left = new Set([...pol.values()].map((p) => `${p.tablename}|${p.renamedFrom || p.policyname}`));
  const missing = FIXTURE.filter((p) => !left.has(`${p.tablename}|${p.policyname}`)).map((p) => `${p.tablename}|${p.policyname}`);
  assert.deepEqual(missing, ['referrals|Users can see their own referral record']);
});

test('referrals: the two permissive SELECT policies become one, their OR, for the same role', () => {
  const { pol } = apply(read());
  const sel = [...pol.values()].filter((p) => p.tablename === 'referrals' && p.cmd === 'SELECT');
  assert.equal(sel.length, 1);
  const [p] = sel;
  assert.equal(p.roles, '{public}');
  assert.equal(p.permissive, 'PERMISSIVE');
  assert.equal(p.with_check, null);
  assert.equal(logic(p.qual), logic('(auth.uid() = referrer_id) OR (auth.uid() = referred_id)'));
});

test('analytics_events keeps its two INSERT policies (different roles: merging them would change who may insert)', () => {
  const { pol } = apply(read());
  const ins = [...pol.values()].filter((p) => p.tablename === 'analytics_events' && p.cmd === 'INSERT');
  assert.deepEqual(ins.map((p) => p.roles).sort(), ['{authenticated}', '{public}']);
});

test('indexes: every unindexed foreign key of the advisor, and the sync pull keyset on the big tables', () => {
  const { indexes } = apply(read());
  const leads = (table, col) => indexes.some((i) => i.table === table && i.cols[0] === col);
  for (const [t, c] of [['dose_logs', 'user_id'], ['dose_logs', 'protocol_id'], ['protocols', 'user_id'], ['vials', 'user_id'], ['vials', 'protocol_id'], ['reminders', 'user_id'], ['reminders', 'protocol_id'], ['biomarkers', 'user_id'], ['admin_devices', 'user_id']]) {
    assert.ok(leads(t, c), `${t}(${c}) covered`);
  }
  for (const t of ['dose_logs', 'protocols', 'vials', 'biomarkers']) {
    assert.ok(indexes.some((i) => i.table === t && i.cols.join(',') === 'user_id,updated_at,id'), `${t}(user_id, updated_at, id): the pull is user_id = U and updated_at > W order by updated_at, id`);
  }
  assert.equal(new Set(indexes.map((i) => i.name)).size, indexes.length, 'index names are unique');
});
