'use strict';
// My Body scans: reading a lab report or a vaccine record (docs/specs/my-body.md MB-12, MB-13,
// MB-23). Pure (node --test). The app only TRANSCRIBES what the document says — values, units,
// dates — and never judges them (AI hard line).
const { localISO } = require('./localDate');
const { fillQuotaMessage, quotaLimitFrom } = require('./scanQuotaMessage');

// The edge function's lab result, checked before it reaches the screen or the database.
// Numeric strings are coerced (the reading service's own rule, any report language), rows
// with no name or no number are dropped and counted, and a report date that does not parse
// falls back to TODAY ON THE USER'S CALENDAR (was the UTC date, MB-27) — surfaced so it can
// be corrected.
function validateExtraction(data, now = new Date()) {
  const rawMarkers = Array.isArray(data && data.markers) ? data.markers : [];
  const markers = [];
  let droppedCount = 0;
  for (const m of rawMarkers) {
    if (!m || typeof m.marker !== 'string' || !m.marker.trim()) { droppedCount++; continue; }
    let value = m.value;
    if (typeof value !== 'number') value = parseFloat(String(value == null ? '' : value).replace(',', '.'));
    if (!Number.isFinite(value)) { droppedCount++; continue; }
    markers.push({ marker: m.marker.trim(), value, unit: typeof m.unit === 'string' ? m.unit : '' });
  }
  let reportDate = typeof (data && data.report_date) === 'string' ? data.report_date.trim() : '';
  let dateFallback = false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || isNaN(new Date(reportDate + 'T12:00:00').getTime())) {
    reportDate = localISO(now);
    dateFallback = true;
  }
  return { markers, reportDate, droppedCount, dateFallback };
}

// One extracted vaccine: a name and a valid date given are required; an invalid next due is
// dropped; the detail fields are kept when the reader provides them.
function validateVaccine(v) {
  if (!v || typeof v.name !== 'string' || !v.name.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dateGiven = typeof v.date_given === 'string' && iso.test(v.date_given) ? v.date_given : null;
  if (!dateGiven) return null;
  const nextDue = typeof v.next_due === 'string' && iso.test(v.next_due) ? v.next_due : null;
  const notes = typeof v.notes === 'string' ? v.notes.trim() : '';
  const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
  const doseNum = Number.isInteger(v.dose_number) ? v.dose_number
    : (typeof v.dose_number === 'string' && /^\d+$/.test(v.dose_number.trim()) ? parseInt(v.dose_number.trim(), 10) : null);
  return {
    name: v.name.trim(), date_given: dateGiven, next_due: nextDue, notes,
    manufacturer: str(v.manufacturer), batch_lot: str(v.batch_lot),
    dose_number: doseNum, provider: str(v.provider), location: str(v.location),
  };
}

// Which message a failed scan gets. A service outage is never blamed on the user's file.
function scanErrorKind({ code = null, status = null } = {}) {
  if (code === 'quota_exceeded' || status === 429) return 'quota';
  if (status === 401) return 'signin';
  if (status === 413) return 'big';
  if (['provider_error', 'not_configured', 'internal_error'].includes(code) || (code == null && [500, 502, 503].includes(status))) return 'service';
  return 'unread';
}

// The DoseTrace sheet for a failed scan (MB-13): title + body, OK. `kind` from scanErrorKind,
// or a local one: 'read' (the file could not be opened), 'camera' (camera access off),
// 'build' (photo capture needs the newest build). `what`: 'lab' | 'vaccine'.
function scanErrorSheet(kind, t, { what = 'lab', errBody = null } = {}) {
  switch (kind) {
    case 'quota': return { title: t('vial_scan_quota_title'), body: fillQuotaMessage(t('vial_scan_quota_sub'), quotaLimitFrom(errBody)) };
    case 'service': return { title: t('blood_error_service'), body: t('blood_error_service_sub') };
    case 'signin': return { title: t('error'), body: t('blood_error_not_signed_in') };
    case 'big': return { title: t('error'), body: t('blood_error_file_too_large') };
    case 'camera': return { title: t('error'), body: t('blood_camera_denied') };
    case 'build': return { title: t('error'), body: t('blood_needs_build') };
    case 'read': return { title: t('error'), body: t('blood_error_read') };
    case 'none': return { title: t('vax_scan_error'), body: t('vax_scan_none') };
    default: return what === 'vaccine'
      ? { title: t('vax_scan_error'), body: t('vax_scan_error_sub') }
      : { title: t('blood_error_extract'), body: t('blood_error_extract_sub') };
  }
}

module.exports = { validateExtraction, validateVaccine, scanErrorKind, scanErrorSheet };
