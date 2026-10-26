-- A ready-to-use vial has no mix date (only reconstituted vials do), so the app sends mixed_on null
-- for it — and the NOT NULL constraint refused every ready-to-use vial since 1.3.0 (POST /vials 400,
-- found on the Fold 2026-10-26; production: 0 ready-to-use vials in the cloud). Additive only:
-- reconstituted vials keep sending their date; the apps already installed push their pending vials
-- at the next sync. Test: __tests__/rtuVialSync.test.js.
alter table public.vials alter column mixed_on drop not null;
