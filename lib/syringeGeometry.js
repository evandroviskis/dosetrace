// The protocol's own syringe drawn to scale: the approved prototype drawing
// (docs/design/prototype.html syr(cap, v), Today redesign part 6, founder 2026-10-02).
// Pure geometry in the prototype's 330 x 46 viewBox, so the component only paints it:
// needle and hub on the left, the barrel with the dose, a tick every 2 units (long every
// 10), a number every 10 from 0, the stopper at the dose, the rod from the stopper and the
// thumb rest. Over capacity (prototype syrOver) the full syringe is drawn and the fill is
// risk instead of data, so a wrong dose is seen, never hidden.
export const SYR_VIEW = { w: 330, h: 46 };

const X0 = 34, X1 = 290, TOP = 8, BOT = 30, ROD_END = 318;
const r1 = (n) => Math.round(n * 10) / 10;

export function syringeParts(capacity, units) {
  const cap = Number(capacity) > 0 ? Number(capacity) : 100;
  const raw = Math.max(0, Number(units) || 0);
  const over = raw > cap;
  const v = over ? cap : raw;
  const X = (u) => X0 + (u / cap) * (X1 - X0);
  const ticks = [];
  for (let u = 2; u < cap; u += 2) {
    const long = u % 10 === 0;
    ticks.push({ u, x: r1(X(u)), y1: TOP + 1, y2: TOP + (long ? 10 : 5), long, inFill: u < v, width: long ? 1.2 : 0.8 });
  }
  const labels = [];
  for (let L = 0; L <= cap; L += 10) labels.push({ text: String(L), x: r1(X(L)), y: 43 });
  const sx = r1(X(v));
  return {
    over,
    fillTone: over ? 'risk' : 'data',
    needle: { x1: 1, y1: 19, x2: 22, y2: 19, width: 1.4 },
    hub: 'M22 15h8l4 2v4l-4 2h-8z',
    barrel: { x: X0, y: TOP, w: X1 - X0, h: BOT - TOP, rx: 5, stroke: 1.2 },
    fill: { x: X0 + 1, y: TOP + 1, w: r1(Math.max(0, X(v) - X0 - 1)), h: BOT - TOP - 2, rx: 4 },
    ticks,
    labels,
    stopper: { x: r1(sx - 1), y: TOP - 1, w: 6, h: BOT - TOP + 2, rx: 2 },
    rod: { x: r1(sx + 5), y: 17, w: r1(Math.max(0, ROD_END - sx - 5)), h: 4, rx: 1 },
    thumb: { x: ROD_END, y: 7, w: 8, h: 24, rx: 3 },
  };
}
