'use strict';
// Lab test journal: which stored values make one lab test (one card). Pure CommonJS (node --test).
//
// A-125 / MB2-5 (docs/specs/my-body-tiles.md): one upload is one card. How an upload is stored:
//   - on the phone that scanned it, lib/database insertBiomarkers stamps every value of the batch
//     with the SAME created_at;
//   - the sync pushes the values one row at a time and the cloud stamps each row itself, so a
//     phone that PULLS the upload (another device, a reinstall, a re-sign-in) gets one created_at
//     per value, a few ms to seconds apart (hello@: 46 values within 6 s).
// So, per report date, the batches (rows sharing one created_at) are taken in time order and a
// batch joins the card before it when it was stamped within UPLOAD_GAP_MS of that card's last
// batch — a push running row after row. A new scan cannot follow that fast (picking the file and
// reading it take longer), so an upload made minutes later, even of the same PDF, is its own card
// and can be deleted alone. Two batches that each hold several values are each a whole upload
// from the scanning phone and never join. A repeated marker no longer splits a card: one lab
// report can list a marker twice (A-101d split on it, which showed one upload as many cards).
// Residual: a push interrupted for longer than the gap (the app closed mid-push) shows that one
// upload as two cards on the OTHER phones; a batch id in the cloud would remove it.
//
// A card: { key, date, createdAt, latest, latestMs, batches: [created_at...], markers: [rows] }.
// key = report_date + '|' + the card's first created_at — the same shape as before, so a selection
// or anything keyed by card keeps working.

const UPLOAD_GAP_MS = 30 * 1000;

// "2026-07-25T14:03:11.123456+00:00", "2026-10-01T10:00:00.000Z", "2026-01-02 08:00:00" (no zone =
// UTC, SQLite datetime()) → epoch ms; anything else → NaN. Parsed by hand: Hermes and Node read
// six fractional digits differently.
const STAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
function stampMs(s) {
  const m = STAMP.exec(String(s == null ? '' : s).trim());
  if (!m) return NaN;
  const ms = Number(((m[7] || '') + '000').slice(0, 3));
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), ms);
  const z = m[8];
  if (z && z.toUpperCase() !== 'Z') {
    const sign = z[0] === '-' ? -1 : 1;
    const digits = z.slice(1).replace(':', '');
    const off = (+digits.slice(0, 2)) * 60 + (+(digits.slice(2, 4) || 0));
    t -= sign * off * 60000;
  }
  return t;
}

function reportCards(rows) {
  const byDate = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    const c = r.created_at || '';
    if (!byDate.has(r.report_date)) byDate.set(r.report_date, new Map());
    const batches = byDate.get(r.report_date);
    if (!batches.has(c)) batches.set(c, []);
    batches.get(c).push(r);
  }
  const cards = [];
  for (const [date, batchMap] of byDate) {
    // Time order; an unreadable stamp sorts first, by its text, and never joins another batch.
    const batches = [...batchMap.entries()].map(([c, list]) => ({ c, list, ms: stampMs(c) }));
    batches.sort((a, b) => {
      const fa = Number.isFinite(a.ms), fb = Number.isFinite(b.ms);
      if (fa !== fb) return fa ? 1 : -1;
      if (fa && a.ms !== b.ms) return a.ms - b.ms;
      return a.c < b.c ? -1 : a.c > b.c ? 1 : 0;
    });
    let card = null;
    for (const b of batches) {
      const multi = b.list.length > 1;
      const joins = card
        && Number.isFinite(b.ms) && Number.isFinite(card.latestMs)
        && b.ms - card.latestMs <= UPLOAD_GAP_MS
        && !(multi && card.hasMulti);
      if (!joins) {
        card = { key: date + '|' + b.c, date, createdAt: b.c, latest: b.c, latestMs: b.ms, hasMulti: false, batches: [], markers: [] };
        cards.push(card);
      }
      card.batches.push(b.c);
      card.markers.push(...b.list);
      card.latest = b.c;
      card.latestMs = b.ms;
      if (multi) card.hasMulti = true;
    }
  }
  return cards.map(({ hasMulti, ...c }) => c);
}

// Every value of one lab test (card), from ALL rows (never the search-filtered list).
function buildReport(rows, key) {
  return reportCards(rows).find((c) => c.key === key) || null;
}

// The By date order: report date, then the upload time; newest first unless `newestFirst` is false.
function orderCards(cards, newestFirst = true) {
  const dir = newestFirst ? 1 : -1;
  const time = (c) => (Number.isFinite(c.latestMs) ? c.latestMs : -Infinity);
  return (cards || []).slice().sort((a, b) => {
    if (a.date !== b.date) return (a.date < b.date ? 1 : -1) * dir;
    if (time(a) !== time(b)) return (time(a) < time(b) ? 1 : -1) * dir;
    return (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) * dir;
  });
}

// MB2-2: "{n} marcadores" = distinct markers (a marker repeated in one report counts once), as picture A.
function markerCount(markers) {
  const seen = new Set();
  for (const m of markers || []) seen.add(String((m && m.marker) || '').trim().toLowerCase());
  seen.delete('');
  return seen.size;
}

// MB2-2: the Labs tile on the My Body hub — how many tests, the newest test's day and how many
// values it holds (the same number its journal card shows). Never a value, a colour or a range.
function labTileSummary(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const newest = orderCards(list, true)[0] || null;
  return { tests: list.length, latestDate: newest ? newest.date : null, latestMarkers: newest ? markerCount(newest.markers) : 0 };
}

module.exports = { UPLOAD_GAP_MS, stampMs, reportCards, buildReport, orderCards, labTileSummary, markerCount };
