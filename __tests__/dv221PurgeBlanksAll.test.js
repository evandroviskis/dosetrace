// DV-221 (AD-67: Delete forever blanks the tombstone's content; parked-error sweep 2026-10-31): the
// blanking trigger left interval_days, doses_per_day, concentration_unit and divisible — and dose_history,
// added 2026-10-27 after the trigger — on a purged protocol. The new migration redefines it so every live
// content column is blanked (NULL, or the column default where it has one); identity stays (id, user_id,
// type, color, created_at, updated_at, deleted_at, purged_at). Live columns read 2026-10-31 (information_schema).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIVE = ['id', 'user_id', 'name', 'type', 'color', 'unit', 'amount', 'water', 'dose', 'dose_unit', 'syringe_size', 'concentration',
  'frequency', 'reminder_time', 'goal', 'notes', 'active', 'created_at', 'interval_days', 'doses_per_day', 'start_date', 'schedule_total',
  'deleted_at', 'concentration_unit', 'updated_at', 'diluent', 'compound_id', 'vial_valid_days', 'note', 'serving_strength',
  'serving_strength_unit', 'serving_units', 'container_units', 'units_taken', 'divisible', 'composition', 'ended_at', 'history_from',
  'purged_at', 'ends_on', 'still_going_at', 'dose_history'];
const IDENTITY = ['id', 'user_id', 'type', 'color', 'created_at', 'updated_at', 'deleted_at', 'purged_at'];

test('DV-221: the purge trigger blanks every content column, identity stays', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261101000000_protocol_purge_blanks_all.sql'), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.protocols_blank_purged()'));
  for (const c of LIVE.filter((x) => !IDENTITY.includes(x))) assert.match(fn, new RegExp(`new\\.${c} := `), c);
  for (const c of ['id', 'user_id', 'type', 'color', 'created_at', 'updated_at', 'purged_at']) assert.doesNotMatch(fn, new RegExp(`new\\.${c} := `), c);
  assert.match(fn, /new\.interval_days := 1; new\.doses_per_day := 1; new\.concentration_unit := 'mg'; new\.divisible := null; new\.dose_history := null;/);
  assert.match(sql, /update public\.protocols set name = name where purged_at is not null;/, 'old tombstones are blanked too');
});

// Council 2026-11-01 (backend): schedule_history (DV-247, 20261101010000) arrived after the trigger, so Delete
// forever kept a protocol's old dose times and intervals in the cloud. The newest definition of the trigger must
// blank every column any migration adds to protocols (read from the migrations, not a fixed list).
test('DV-221 / DV-247: the newest purge trigger blanks every column any migration adds to protocols', () => {
  const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(MIG_DIR).filter((x) => x.endsWith('.sql')).sort();
  let fn = '';
  for (const f of files) {
    const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    const i = src.indexOf('create or replace function public.protocols_blank_purged()');
    if (i >= 0) fn = src.slice(i, src.indexOf('$;', i));
  }
  const added = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    for (const m of src.matchAll(/alter table (?:public\.)?protocols\s+add column (?:if not exists )?([a-z_]+)/gi)) added.add(m[1]);
  }
  assert.ok(added.has('schedule_history'));
  for (const c of [...added, ...LIVE].filter((x) => !IDENTITY.includes(x))) assert.match(fn, new RegExp(`new\\.${c} := `), c);
});
