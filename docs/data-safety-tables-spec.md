# Build 55 spec — move calculator history off `user_metadata` into synced tables

**Why.** The 2026-09-12 data-loss incident (an in-progress reality-check weigh-in
lost on update) exposed a class problem: user-entered data was stored in fragile
places. The weigh-in (device-only AsyncStorage) is already fixed (build 54,
cloud-backed). The remaining exposure is the accumulating *history* lists kept in
Supabase auth `user_metadata` — a JWT blob, not a table — which are rewritten whole
on every save (stale-read truncation risk) and are the wrong home for growing data.

This build moves the two **health-history** lists into proper synced Postgres
tables (row-per-entry, like `biomarkers`/`food_logs`), so appends are INSERTs and
truncation becomes structurally impossible. The lower-value curation lists
(`favorite_markers`, `report_tags`) are hardened in place (fresh-read writes) this
build and may migrate to tables in a follow-up.

## Scope (build 55)
- NEW synced tables: `reality_checks`, `calc_snapshots`.
- One-time, non-destructive migration of existing `user_metadata.calc_reality_checks`
  / `calc_snapshots` arrays into the tables.
- `CalculatorSection` reads/writes the tables (stops writing those metadata keys;
  metadata copies are LEFT in place this build as a backup, cleared in a later build).
- `favorite_markers` / `report_tags`: fresh-read-then-modify hardening (no table yet).
- Sync round-trip + mapper-coverage tests for both new tables.

Out of scope (later): migrating favorites/tags to tables; clearing the now-backup
metadata keys; `calc_inputs` (latest-wins single object — acceptable as-is).

## Table shapes (SQLite mirror + Supabase), following the existing engine

`reality_checks` — one row per completed check (latest-wins per `entry_date`):
```
id INTEGER PK AUTOINCREMENT, remote_id TEXT, user_id TEXT,
entry_date TEXT,            -- the check's date (unique per user)
tdee REAL,                  -- computed TDEE for that window
rate_per_week_kg REAL,      -- weekly rate
created_at, updated_at, sync_status DEFAULT 'pending'
```

`calc_snapshots` — one row per day (latest-wins per `entry_date`):
```
id INTEGER PK AUTOINCREMENT, remote_id TEXT, user_id TEXT,
entry_date TEXT,            -- snapshot date (unique per user)
weight_kg REAL, body_fat_pct REAL, lbm REAL, bmr REAL, tdee REAL,
created_at, updated_at, sync_status DEFAULT 'pending'
```

Supabase (Postgres) mirrors these with `id uuid default gen_random_uuid()`,
`user_id uuid references auth.users`, same columns, `created_at/updated_at
timestamptz default now()`, and a UNIQUE `(user_id, entry_date)` so an upsert
replaces a day rather than duplicating it.

## RLS (owner-only, ALL four commands — the missing-DELETE-policy trap)
For each table:
```
alter table X enable row level security;
create policy "sel own" on X for select using (auth.uid() = user_id);
create policy "ins own" on X for insert with check (auth.uid() = user_id);
create policy "upd own" on X for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "del own" on X for delete using (auth.uid() = user_id);
```
(DELETE policy is mandatory — without it `cloud.delete` silently no-ops and rows
resurrect. Verified present on food_logs; must be present here.)

## Engine wiring (replicate the food_logs pattern exactly)
- `lib/schema.js`: add both `TABLE_DDL` entries + a `(user_id, entry_date)` index each + add to the `createSchema` list.
- `lib/database.js`: `initDatabase` creates them (idempotent, IF NOT EXISTS); add CRUD: `getRealityChecks(uid)`, `upsertRealityCheck(uid, {entry_date,...})`, `getCalcSnapshots(uid)`, `upsertCalcSnapshot(uid, {entry_date,...})`, and add both to `clearLocalDatabase` (`DELETE FROM ...`). Upsert = update-by-(user_id,entry_date) else insert; always set `sync_status='pending'` + bump `updated_at`.
- `lib/syncCore.js`: add both names to `TABLES`; add `updateLocalFromCloud` + `importSingleRow` branches (plain scalar columns, no FK remap).
- `lib/syncMappers.js`: add `CLOUD_FIELDS` + `toCloudPayload` branches (`entry_date` + the scalar columns).
- `lib/sync.js`: generic cloud interface already works for any table name — no change beyond confirming the Supabase table exists.

## One-time migration (non-destructive)
On `CalculatorSection` load, after the tables exist:
1. Read existing `user_metadata.calc_reality_checks` / `calc_snapshots`.
2. For each entry, `upsert*` into the local table IF that `entry_date` isn't already present (so it runs once and is idempotent; re-running never duplicates or overwrites newer table data).
3. `requestSync()` pushes them to the cloud tables.
4. Do NOT delete the metadata keys yet — they stay as a backup for one release; a later build removes them once the tables are proven in the field.
Reads now come from the tables; writes go to the tables (metadata writes for these two keys stop).

## Tests (node --test, real better-sqlite3 + fake cloud)
- Mapper coverage: `CLOUD_FIELDS` for both tables round-trips through `toCloudPayload` with no dropped field.
- Sync round-trip: insert locally → push → pull on a second db → rows match; update-by-date → single row (no dupe); delete → tombstone → gone on both.
- Migration idempotency: running the metadata→table import twice yields one row per date.

## Verification / gate
- `npm test` green (+ new tests), `npx expo export --platform ios` clean.
- ship-check Gate A (regression) + Gate B (this is sync/data — code-review pass over the diff, and the founder tests update-over-old-version on device: enter a snapshot + a reality check on the OLD build, update, confirm both survive AND that a second-device stale save can't truncate them).
- dt-council before the build.

## Rollback
Tables are additive; metadata copies remain. If the tables misbehave, revert the
`CalculatorSection` read/write wiring to metadata (one commit) — no data lost
because the metadata backup is still written-through until a later build.
