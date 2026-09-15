// Build portable health-record exports (CSV + print-ready HTML) from the user's
// own data — with the user choosing exactly what goes in the report. Pure string
// builders, no RN/Expo imports, so they're unit-testable; the screen writes the
// returned string to a file and shares it.
//
// These are the USER'S records, reformatted for portability. Nothing is
// interpreted, flagged, or scored — values are reproduced as entered.
// CommonJS so `node --test` can require it; Metro imports it fine.

// Merge naming variants of a marker (case / punctuation / word order) into one
// series, e.g. "Testosterone, Total" ⇄ "Total Testosterone".
function canonicalMarker(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[.,;:()/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .sort()
    .join(' ');
}

// Group raw biomarker rows into per-marker series (values over time, oldest →
// newest). Display name = the user's most recent label for that marker.
function markerSeries(biomarkers) {
  const byKey = {};
  for (const r of biomarkers || []) (byKey[canonicalMarker(r.marker)] ||= []).push(r);
  return Object.entries(byKey).map(([key, rs]) => {
    const sorted = rs.slice().sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0));
    const latest = sorted[sorted.length - 1];
    return {
      key,
      display: latest.marker,
      unit: latest.unit || '',
      points: sorted.map(r => ({ date: r.report_date, value: r.value, unit: r.unit })),
    };
  }).sort((a, b) => a.display.localeCompare(b.display));
}

const fmtNum = n => (Number.isFinite(n) ? String(Number(Number(n).toFixed(2))) : String(n));

// ── CSV ──────────────────────────────────────────────────────────────
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(fields) { return fields.map(csvEscape).join(','); }

// opts: { labels, selectedMarkers?: Set<key>, selectedVaccineIds?: Set<id> }
// A null/absent selection means "include everything".
function buildRecordsCSV(data, opts) {
  const labels = opts.labels;
  const selM = opts.selectedMarkers || null;
  const selV = opts.selectedVaccineIds || null;
  const lines = [];

  const series = markerSeries(data.biomarkers).filter(s => !selM || selM.has(s.key));
  lines.push(labels.labsHeading);
  lines.push(csvRow([labels.colMarker, labels.colDate, labels.colValue, labels.colUnit]));
  for (const s of series) {
    for (const p of s.points) lines.push(csvRow([s.display, p.date, p.value, p.unit]));
  }

  const vax = [...(data.vaccines || [])]
    .filter(v => !selV || selV.has(v.id))
    .sort((a, b) => ((a.date_given || '') < (b.date_given || '') ? 1 : -1));
  lines.push('');
  lines.push(labels.vaccinesHeading);
  lines.push(csvRow([labels.colVaccine, labels.colGiven, labels.colNextDue, labels.colNotes]));
  for (const v of vax) lines.push(csvRow([v.name, v.date_given, v.next_due, v.notes]));

  return lines.join('\n');
}

// ── HTML (for expo-print → PDF) ──────────────────────────────────────
function htmlEscape(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A neutral inline SVG trend line for one marker (no bands, no flags, no colors
// beyond a single line). Needs ≥2 points.
function svgCurve(points) {
  const W = 520, H = 150, PAD = 22, GUT = 46;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo, plotW = W - GUT, usableH = H - PAD * 2, n = points.length;
  const xy = points.map((p, i) => ({
    x: (plotW * i) / (n - 1),
    y: PAD + usableH * (1 - (p.value - lo) / span),
  }));
  const poly = xy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = xy.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#185FA5"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${poly}" fill="none" stroke="#185FA5" stroke-width="2"/>${dots}
    <text x="${W - GUT + 6}" y="${PAD + 4}" font-size="12" fill="#999">${htmlEscape(fmtNum(hi))}</text>
    <text x="${W - GUT + 6}" y="${H - PAD + 4}" font-size="12" fill="#999">${htmlEscape(fmtNum(lo))}</text>
  </svg>`;
}

// opts: { labels, title, exportedOn, disclaimer, formatDate?, selectedMarkers?, selectedVaccineIds? }
function buildRecordsHTML(data, opts) {
  const { labels, title, exportedOn, disclaimer } = opts;
  const fmt = typeof opts.formatDate === 'function' ? opts.formatDate : (d => d);
  const selM = opts.selectedMarkers || null;
  const selV = opts.selectedVaccineIds || null;

  const series = markerSeries(data.biomarkers).filter(s => !selM || selM.has(s.key));
  const labsSection = series.length === 0
    ? `<p class="empty">${htmlEscape(labels.noLabs)}</p>`
    : series.map(s => `
        <div class="marker">
          <h3>${htmlEscape(s.display)}${s.unit ? ` <span class="unit">(${htmlEscape(s.unit)})</span>` : ''}</h3>
          ${s.points.length >= 2 ? svgCurve(s.points) : ''}
          <table>
            <thead><tr><th>${htmlEscape(labels.colDate)}</th><th>${htmlEscape(labels.colValue)}</th><th>${htmlEscape(labels.colUnit)}</th></tr></thead>
            <tbody>
              ${s.points.slice().reverse().map(p => `<tr><td>${htmlEscape(fmt(p.date))}</td><td class="num">${htmlEscape(p.value)}</td><td>${htmlEscape(p.unit)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('');

  const vax = [...(data.vaccines || [])]
    .filter(v => !selV || selV.has(v.id))
    .sort((a, b) => ((a.date_given || '') < (b.date_given || '') ? 1 : -1));
  const vaxSection = vax.length === 0
    ? `<p class="empty">${htmlEscape(labels.noVaccines)}</p>`
    : `<table>
        <thead><tr><th>${htmlEscape(labels.colVaccine)}</th><th>${htmlEscape(labels.colGiven)}</th><th>${htmlEscape(labels.colNextDue)}</th><th>${htmlEscape(labels.colNotes)}</th></tr></thead>
        <tbody>
          ${vax.map(v => `<tr><td>${htmlEscape(v.name)}</td><td>${htmlEscape(fmt(v.date_given))}</td><td>${htmlEscape(v.next_due ? fmt(v.next_due) : '')}</td><td>${htmlEscape(v.notes)}</td></tr>`).join('')}
        </tbody>
      </table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 28px; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 2px solid #185FA5; padding-bottom: 4px; color: #185FA5; }
    h3 { font-size: 14px; margin: 16px 0 6px; color: #222; }
    h3 .unit { color: #888; font-weight: 400; font-size: 12px; }
    .meta { color: #888; font-size: 11px; margin-bottom: 4px; }
    .disclaimer { color: #888; font-size: 10px; margin-top: 6px; font-style: italic; }
    .marker { margin-bottom: 18px; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 8px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e6e6e6; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #999; }
    .empty { color: #999; font-style: italic; }
    svg { margin: 4px 0; }
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

module.exports = { canonicalMarker, markerSeries, csvEscape, csvRow, buildRecordsCSV, buildRecordsHTML };
