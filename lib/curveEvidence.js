'use strict';
// Founder 2026-11-01 (option A, docs/design/curva-aviso-sem-estudos.html): every compound keeps its curve; the
// ones marked "Estimado — sem dados humanos" (lib/halfLives tier 'estimated') are named in one line under the
// chart: no study in humans proves how long each stays in the blood, and where its estimate comes from
// (basis). In a chart in days with a longer compound beside them, the line also says why the short ones fall
// to zero within hours. Never says anything about effects. Pure (node --test).
const STEP_HOURS = 6; // a compound under 6 h clears between day samples (lib/serumModel STEP_HOURS)

function joinNames(names, t) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${t('dev_list_and')} ${names[names.length - 1]}`;
}

// The compound's own name (never the series label with "· ended" or a date); a compound selected
// twice (two protocols) is named once.
const nameOf = (s) => s.compound || s.name;
function oncePerCompound(list) {
  const seen = new Set();
  return list.filter((s) => { const n = nameOf(s); if (seen.has(n)) return false; seen.add(n); return true; });
}

// series: [{ name, compound, entry }] as drawn; t: translate. Returns the line, or null when every compound is studied.
function noStudyWarning(series, { hourMode, t }) {
  const list = (series || []).filter((s) => s && s.entry);
  const unstudied = oncePerCompound(list.filter((s) => s.entry.tier === 'estimated'));
  if (!unstudied.length) return null;
  const named = unstudied.map((s) => `${nameOf(s)} (${t(`curve_basis_${s.entry.basis || 'none'}`)})`);
  let text = t(named.length === 1 ? 'curve_nostudy_one' : 'curve_nostudy_many').replace('{names}', joinNames(named, t));
  const short = unstudied.filter((s) => s.entry.hours < STEP_HOURS);
  const longer = list.some((s) => s.entry.hours >= STEP_HOURS);
  if (!hourMode && short.length && longer) {
    text += ' ' + t(short.length === 1 ? 'curve_nostudy_days_one' : 'curve_nostudy_days_many').replace('{names}', joinNames(short.map(nameOf), t));
  }
  return text;
}

module.exports = { noStudyWarning };
