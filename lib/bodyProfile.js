'use strict';
// S-04 / FX-10: the PROFILE is the only source for sex (assigned at birth) and age in
// the BMR. Saved calculator inputs used to override it — a Settings change did not
// reach the calculation and a typed age never moved with time. Saved values are used
// only when the profile has nothing yet (never lose what was typed). Pure.
function profileBodyInputs({ meta, saved, now = new Date() } = {}) {
  const m = meta || {};
  const s = saved || {};
  const profileSex = m.gender === 'male' || m.gender === 'female' ? m.gender : null;
  const sex = profileSex || (s.sex === 'male' || s.sex === 'female' ? s.sex : 'male');
  const by = Number(m.birth_year);
  const years = Number.isFinite(by) && by > 0 ? now.getFullYear() - by : NaN;
  if (years > 0 && years < 120) return { sex, profileSex, age: String(years), ageFromProfile: true };
  return { sex, profileSex, age: s.age != null && s.age !== '' ? String(s.age) : '', ageFromProfile: false };
}

module.exports = { profileBodyInputs };
