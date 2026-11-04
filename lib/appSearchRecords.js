// App search, the person's own records by name (AS-28, founder "sim" 2026-11-04): the active
// protocols (the name shown in the app, the typed name, the compound's name in the six languages and
// its aliases from lib/compounds.js), the lab markers present in at least one saved lab report (the
// name in the six languages from lib/markerNames.js and the stored name) and the saved vaccines (the
// name as typed). Built from the rows the phone already holds (lib/database), never sent anywhere.
// Only NAMES are read: values, units, dates, doses and notes never enter a row (logic 9, AS-13).
// Deleted rows are not listed (the database getters already skip them; a row marked deleted here is
// skipped too). Pure CommonJS (node --test).
'use strict';
const { ALIASES } = require('./compounds');
const { markerLabel, MARKER_NAMES } = require('./markerNames');
const { canonicalMarker } = require('./exportRecords');

const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];
const isDeleted = (r) => !r || r.sync_status === 'deleted' || r.deleted_at != null;

// Active protocols → the matcher's protocol list (lib/appSearch buildPlaceIndex).
function protocolEntries(protocols, { translations, t } = {}) {
  const tr = translations || {};
  return (protocols || []).filter((p) => !isDeleted(p)).map((p) => {
    const cid = p.compound_id || null;
    const name = cid && t ? t(cid) : (p.name || '');
    const names = [];
    if (p.name && p.name !== name) names.push(p.name);
    if (cid) {
      LANGS.forEach((l) => { const v = tr[l] && tr[l][cid]; if (typeof v === 'string' && !names.includes(v) && v !== name) names.push(v); });
      (ALIASES[cid] || []).forEach((a) => { if (!names.includes(a)) names.push(a); });
    }
    return { id: p.id, name, color: p.color || null, oral: p.type === 'oral', names };
  });
}

const BY_KEY = {};
MARKER_NAMES.forEach((row) => { BY_KEY[canonicalMarker(row[0])] = row; });

// Saved lab rows → one record per marker (the same key the Lab test journal groups by).
function markerRecords(rows, language) {
  const seen = {};
  const out = [];
  (rows || []).forEach((r) => {
    if (isDeleted(r) || !r.marker) return;
    const key = canonicalMarker(r.marker);
    if (!key || seen[key]) return;
    seen[key] = true;
    const names = BY_KEY[key] ? BY_KEY[key].slice() : [];
    if (!names.includes(r.marker)) names.push(r.marker);
    out.push({ kind: 'marker', key, title: markerLabel(r.marker, language), words: names, path: ['tab_body', 'body_card_labs_title', '{name}'] });
  });
  return out;
}

// Saved vaccines → one record per name as typed (the newest record of that name opens).
function vaccineRecords(vaccines) {
  const seen = {};
  const out = [];
  (vaccines || []).forEach((v) => {
    if (isDeleted(v)) return;
    const name = String(v.name || '').trim();
    if (!name) return;
    const k = name.toLowerCase();
    if (seen[k]) return;
    seen[k] = true;
    out.push({ kind: 'vaccine', key: String(v.id), title: name, words: [], path: ['tab_body', 'body_card_vax_title', '{name}'] });
  });
  return out;
}

module.exports = { protocolEntries, markerRecords, vaccineRecords };
