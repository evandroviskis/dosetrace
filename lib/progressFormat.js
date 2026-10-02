'use strict';
// Display helpers of the Progress screen (Journey redesign parts 7 and 14, founder
// 2026-10-02). Pure (node --test); the screen localizes the words around these.

// Example values shown in empty fields ("e.g. 80.0"), in the unit the user chose — the
// prototype's kg(80), 20 %, cm(90), cm(178).
function exampleValues(unit) {
  const imp = unit === 'imperial';
  return {
    weight: imp ? (80 * 2.20462).toFixed(1) : '80.0',
    bodyFat: '20',
    waist: imp ? (90 / 2.54).toFixed(1) : '90',
    height: imp ? (178 / 2.54).toFixed(1) : '178',
  };
}

// An activity label in two lines: "Moderate — 4–5 sessions/week" → ["Moderate", "4–5
// sessions/week"]; "Desk job, little or no exercise" → ["Desk job", "little or no exercise"].
function activityParts(label) {
  const s = String(label || '');
  const dash = s.indexOf(' — ');
  if (dash > 0) return [s.slice(0, dash), s.slice(dash + 3)];
  const comma = s.indexOf(', ');
  if (comma > 0) return [s.slice(0, comma), s.slice(comma + 2)];
  return [s];
}

// The collapsed Your numbers line: "84.6 kg · 21% BF · 181 cm · Moderate" (empty parts skipped).
function numbersSummary(parts) {
  return (parts || []).filter((p) => p != null && String(p).trim() !== '').join(' · ');
}

// Target scale ticks (prototype targetScale): one every 0.5 from the start to the goal, a
// major tick on whole units. A long range uses whole units (then 2, 5 …) so it stays
// readable — at most 81 ticks.
function targetTicks(start, goal) {
  const a = Number(start), b = Number(goal);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [];
  const span = Math.abs(a - b);
  const steps = [0.5, 1, 2, 5, 10];
  const step = steps.find((x) => span / x <= 80) || 10;
  const dir = b < a ? -1 : 1;
  const out = [];
  const n = Math.floor(span / step + 1e-9);
  for (let i = 0; i <= n; i++) {
    const v = Math.round((a + dir * i * step) * 100) / 100;
    out.push({ v, major: step < 1 ? Math.abs(v - Math.round(v)) < 1e-9 : i % 5 === 0 });
  }
  if (out[out.length - 1].v !== b) out.push({ v: b, major: Math.abs(b - Math.round(b)) < 1e-9 });
  return out;
}

module.exports = { exampleValues, activityParts, numbersSummary, targetTicks };
