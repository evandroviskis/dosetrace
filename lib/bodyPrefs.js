'use strict';
// My Body's starred markers and test labels (DV-006, AD-02; behaviour-tested in
// __tests__/dv006BodyPrefsMerge). They still live in user_metadata (favorite_markers, report_tags),
// but every change is ONE operation applied to the FRESH server value — never a whole array or
// object computed from the screen's cached copy (that is how a star or a label added on another
// phone, or before a stale session, silently disappeared). Only that key is written (GoTrue merges
// top-level metadata keys), and a failure is reported, never swallowed. Stars match by the
// canonical marker key, so a star stored under an older name variant can be cleared.
// Moving these to a synced table (AD-02's durable storage) needs a production migration: not here.

const { canonicalMarker } = require('./exportRecords');

const asList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const asTags = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function isFavorite(favorites, marker) {
  const key = canonicalMarker(marker);
  return asList(favorites).some((f) => canonicalMarker(f) === key);
}

// on: star it (kept once, whatever variant is already stored); off: remove every variant.
function setFavorite(favorites, marker, on) {
  const list = asList(favorites);
  const key = canonicalMarker(marker);
  if (on) return list.some((f) => canonicalMarker(f) === key) ? list : [...list, marker];
  return list.filter((f) => canonicalMarker(f) !== key);
}

function setReportTag(tags, date, tag, on) {
  const all = { ...asTags(tags) };
  const cur = Array.isArray(all[date]) ? all[date] : [];
  let next;
  if (on) next = cur.some((x) => String(x).toLowerCase() === String(tag).toLowerCase()) ? cur : [...cur, tag];
  else next = cur.filter((x) => x !== tag);
  if (next.length) all[date] = next; else delete all[date];
  return all;
}

function dropReportDate(tags, date) {
  const all = { ...asTags(tags) };
  delete all[date];
  return all;
}

// deps: { readFresh: () => user_metadata from the server (throws or null when it cannot be read),
//         write: (data) => { error } }  → { ok: true, value } | { ok: false }
async function saveBodyPref(deps, key, apply) {
  let fresh;
  try { fresh = await deps.readFresh(); } catch { return { ok: false }; }
  if (!fresh || typeof fresh !== 'object') return { ok: false };
  const value = apply(fresh[key]);
  let res;
  try { res = await deps.write({ [key]: value }); } catch { return { ok: false }; }
  if (res && res.error) return { ok: false };
  return { ok: true, value };
}

module.exports = { asList, asTags, isFavorite, setFavorite, setReportTag, dropReportDate, saveBodyPref };
