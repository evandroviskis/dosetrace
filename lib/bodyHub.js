'use strict';
// My Body rules (docs/specs/my-body.md). Pure (node --test); the screens only draw them.
// Everything here SHOWS the user's own records — counts, the values they starred, the dates
// they typed. Nothing is interpreted, ranked or advised.
const { canonicalMarker } = require('./exportRecords');

// One test = one upload (report_date + created_at), the same key as the journal cards (A-74).
const uploadKey = (r) => r.report_date + '|' + (r.created_at || '');
const newer = (a, b) => (a.report_date !== b.report_date ? a.report_date > b.report_date : (a.created_at || '') > (b.created_at || ''));

// MB-2: the Lab test journal card. `favorites`: the marker names the user starred.
// starred = each starred marker's latest reading (A–Z by its latest label); latestDate = the
// newest test's day ("Starred markers · latest test Aug 20").
function labHubSummary(rows, favorites) {
  const list = Array.isArray(rows) ? rows : [];
  const fav = new Set(Array.isArray(favorites) ? favorites : []);
  const byKey = {};
  let latestDate = null;
  for (const r of list) {
    const k = canonicalMarker(r.marker);
    const g = (byKey[k] ||= { key: k, latest: r, fav: false });
    if (newer(r, g.latest)) g.latest = r;
    if (fav.has(r.marker)) g.fav = true;
    if (!latestDate || r.report_date > latestDate) latestDate = r.report_date;
  }
  const starred = Object.values(byKey)
    .filter((g) => g.fav)
    .map((g) => ({ key: g.key, marker: g.latest.marker, value: g.latest.value, unit: g.latest.unit || '' }))
    .sort((a, b) => a.marker.localeCompare(b.marker));
  return { tests: new Set(list.map(uploadKey)).size, starred, latestDate };
}

// MB-3: the nearest next-due date the user entered that is today or later (local days).
function nextDueVaccine(list, today) {
  const due = (Array.isArray(list) ? list : [])
    .filter((v) => v && typeof v.next_due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.next_due) && v.next_due.slice(0, 10) >= today)
    .sort((a, b) => (a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : String(a.name).localeCompare(String(b.name))));
  return due.length ? { name: due[0].name, due: due[0].next_due.slice(0, 10) } : null;
}

// MB-9: Export only when there is something to export (prototype labsScreen / vaxScreen):
// the Lab test journal with any test or vaccine, the Vaccine journal with a vaccine.
function exportVisible(screen, { tests = 0, vaccines = 0 } = {}) {
  if (screen === 'vaccines') return vaccines > 0;
  if (screen === 'labs') return tests > 0 || vaccines > 0;
  return false;
}

// MB-21: Save on the vaccine sheet needs a name.
function vaccineNameMissing(name) { return !String(name == null ? '' : name).trim(); }

// MB-18 / MB-22: the delete questions (prototype mdel / vaxdel copy).
function deleteValueCopy(t, marker, dateText) {
  return {
    title: t('blood_value_delete_title'),
    body: t('blood_value_delete_body').replace('{marker}', marker).replace('{date}', dateText),
  };
}
function deleteVaccineCopy(t, name) {
  return { title: t('vax_delete_title'), body: t('vax_delete_body').replace('{name}', name) };
}

module.exports = { uploadKey, labHubSummary, nextDueVaccine, exportVisible, vaccineNameMissing, deleteValueCopy, deleteVaccineCopy };
