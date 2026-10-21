'use strict';
// 1.3.1 review (DV-072 C, PK-16): the Dose accumulation curve and the Journey tile read the Dose log
// and the protocols again when a sync / import finishes or doses / protocols change — the A-146
// FoodLogHero pattern. Pure (no React Native imports), tested in __tests__/curveSyncReload.test.js.

// Reload on the events that bring dose / protocol data, debounced: a burst (import_complete, then
// sync_complete, then data_changed) reloads once, waitMs after the last. The curve's own view saves
// ('curve') and unrelated data (food, calculators) do not reload. Returns the unsubscribe, which also
// drops a reload still waiting.
function curveReloadOnSync(addListener, reload, waitMs = 300) {
  const skip = ['curve', 'food_logs', 'calc'];
  let timer = null;
  const off = addListener((e) => {
    if (!e) return;
    const data = e.type === 'data_changed' && !skip.includes(e.what);
    if (e.type !== 'import_complete' && e.type !== 'sync_complete' && !data) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; reload(); }, waitMs);
  });
  return () => { if (timer) clearTimeout(timer); timer = null; off(); };
}

const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

// The data a reload changes on the curve screen: only what changed, so a reload that brought
// nothing sets no state (no rebuild). Never the selection (keepSelection, applied as a functional
// updater by the screen). cur / fresh: { protocols, notCharted, doseLogs, labDates }.
function curveReloadPatch(cur, fresh) {
  const patch = {};
  for (const k of ['protocols', 'notCharted', 'doseLogs', 'labDates']) {
    if (!same(cur && cur[k], fresh[k])) patch[k] = fresh[k];
  }
  return patch;
}

// Founder rule (the curve keeps the exact last selection): after a reload the selection stays as it
// is, minus protocols that no longer exist (when nothing is left, the first chartable one, so the
// chart is never empty). The saved view is never restored on a reload (with nothing saved that
// falls back to the newest protocol). The same array comes back when nothing changed.
function keepSelection(prev, protocols) {
  const ids = new Set((protocols || []).map((p) => p.id));
  const before = prev || [];
  let kept = before.filter((id) => ids.has(id));
  if (!kept.length && protocols && protocols.length) kept = [protocols[0].id];
  return same(kept, before) ? prev : kept;
}

// The Journey tile's Est. level: the same compound, value and unit → keep the state (no re-render).
function sameCurveLevel(a, b) {
  if (!a || !b) return !a && !b;
  return (a.protocol && a.protocol.id) === (b.protocol && b.protocol.id) && a.value === b.value && a.unit === b.unit;
}

module.exports = { curveReloadOnSync, curveReloadPatch, keepSelection, sameCurveLevel };
