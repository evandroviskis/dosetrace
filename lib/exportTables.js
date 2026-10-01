'use strict';
// S-07 / FX-12: "Export my data" covers EVERY synced user table (lib/syncCore.js
// TABLES) — food logs, reality checks, weigh-in snapshots, targets, the open check and
// calculator inputs were missing. Deriving the list from TABLES means a new table can
// never be left out of the export again. Pure — runs under node --test.
function exportTableNames(tables) {
  return (tables || []).map((t) => (typeof t === 'string' ? t : (t.name || t.table))).filter(Boolean);
}

module.exports = { exportTableNames };
