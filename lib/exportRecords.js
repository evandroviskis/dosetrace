// Build portable health-record exports (CSV + print-ready HTML) from the user's
// own data. Pure string builders — no RN/Expo imports — so they're unit-testable
// and the screen just writes the returned string to a file and shares it.
//
// These are the USER'S records, reformatted for portability (hand to any doctor).
// Nothing is interpreted, flagged, or scored — values are reproduced as entered.
// CommonJS so `node --test` can require it; Metro imports it fine.

// ── CSV ──────────────────────────────────────────────────────────────
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(',');
}

// data: { biomarkers: [{report_date, marker, value, unit}], vaccines: [{name, date_given, next_due, notes}] }
// labels: localized column/section strings (see buildRecordsHTML for the keys).
function buildRecordsCSV(data, labels) {
  const lines = [];
  const labs = [...(data.biomarkers || [])].sort((a, b) =>
    (a.report_date < b.report_date ? 1 : a.report_date > b.report_date ? -1 : 0));
  const vax = [...(data.vaccines || [])].sort((a, b) =>
    ((a.date_given || '') < (b.date_given || '') ? 1 : -1));

  lines.push(labels.labsHeading);
  lines.push(csvRow([labels.colDate, labels.colMarker, labels.colValue, labels.colUnit]));
  for (const r of labs) lines.push(csvRow([r.report_date, r.marker, r.value, r.unit]));

  lines.push('');
  lines.push(labels.vaccinesHeading);
  lines.push(csvRow([labels.colVaccine, labels.colGiven, labels.colNextDue, labels.colNotes]));
  for (const v of vax) lines.push(csvRow([v.name, v.date_given, v.next_due, v.notes]));

  return lines.join('\n');
}

// ── HTML (for expo-print → PDF) ──────────────────────────────────────
function htmlEscape(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildRecordsHTML(data, opts) {
  const { labels, title, exportedOn, disclaimer } = opts;
  const labs = data.biomarkers || [];
  const vax = [...(data.vaccines || [])].sort((a, b) =>
    ((a.date_given || '') < (b.date_given || '') ? 1 : -1));

  // Group labs by report date (newest first).
  const byDate = {};
  for (const r of labs) (byDate[r.report_date] ||= []).push(r);
  const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

  const labsSection = dates.length === 0
    ? `<p class="empty">${htmlEscape(labels.noLabs)}</p>`
    : dates.map(d => `
        <h3>${htmlEscape(d)}</h3>
        <table>
          <thead><tr><th>${htmlEscape(labels.colMarker)}</th><th>${htmlEscape(labels.colValue)}</th><th>${htmlEscape(labels.colUnit)}</th></tr></thead>
          <tbody>
            ${byDate[d].map(r => `<tr><td>${htmlEscape(r.marker)}</td><td class="num">${htmlEscape(r.value)}</td><td>${htmlEscape(r.unit)}</td></tr>`).join('')}
          </tbody>
        </table>`).join('');

  const vaxSection = vax.length === 0
    ? `<p class="empty">${htmlEscape(labels.noVaccines)}</p>`
    : `<table>
        <thead><tr><th>${htmlEscape(labels.colVaccine)}</th><th>${htmlEscape(labels.colGiven)}</th><th>${htmlEscape(labels.colNextDue)}</th><th>${htmlEscape(labels.colNotes)}</th></tr></thead>
        <tbody>
          ${vax.map(v => `<tr><td>${htmlEscape(v.name)}</td><td>${htmlEscape(v.date_given)}</td><td>${htmlEscape(v.next_due)}</td><td>${htmlEscape(v.notes)}</td></tr>`).join('')}
        </tbody>
      </table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 28px; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 2px solid #185FA5; padding-bottom: 4px; color: #185FA5; }
    h3 { font-size: 13px; margin: 14px 0 4px; color: #555; }
    .meta { color: #888; font-size: 11px; margin-bottom: 4px; }
    .disclaimer { color: #888; font-size: 10px; margin-top: 6px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e6e6e6; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #999; }
    td.num, th:nth-child(2) { }
    .empty { color: #999; font-style: italic; }
  </style></head><body>
    <h1>${htmlEscape(title)}</h1>
    <div class="meta">${htmlEscape(exportedOn)}</div>
    <div class="disclaimer">${htmlEscape(disclaimer)}</div>
    <h2>${htmlEscape(labels.labsHeading)}</h2>
    ${labsSection}
    <h2>${htmlEscape(labels.vaccinesHeading)}</h2>
    ${vaxSection}
  </body></html>`;
}

module.exports = { csvEscape, csvRow, buildRecordsCSV, buildRecordsHTML };
