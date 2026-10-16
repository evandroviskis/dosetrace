'use strict';
// My Body rules (docs/specs/my-body.md). Pure (node --test); the screens only draw them.
// Everything here SHOWS the user's own records — counts, the names and dates they typed.
// Nothing is interpreted, ranked or advised. (The lab cards: lib/labReports.js.)

// MB2-2 (A-125): the Vaccines tile names the latest vaccine — the newest date given, the one
// added last on the same day; a vaccine without a date only when none has one. The date is the
// one the user typed; never a schedule.
function latestVaccine(list) {
  const day = (v) => (typeof v.date_given === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.date_given) ? v.date_given.slice(0, 10) : '');
  let best = null;
  for (const v of Array.isArray(list) ? list : []) {
    if (!v) continue;
    if (!best) { best = v; continue; }
    const dv = day(v), db = day(best);
    if (dv !== db ? dv > db : String(v.created_at || '') > String(best.created_at || '')) best = v;
  }
  return best ? { name: best.name, date: day(best) || null } : null;
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

module.exports = { latestVaccine, exportVisible, vaccineNameMissing, deleteValueCopy, deleteVaccineCopy };
