// A reading in a narrow column ("58 cápsulas", "120 cápsulas em gel") is laid out as pieces that
// may wrap only at an ordinary space (A-136 (4), Fold 7 2026-10-17: "58 cápsula / s" broke inside
// the word). The value stays glued to its first unit word by the no-break space (A-134 (2));
// each piece is shown on one line and shrinks to fit instead of breaking.
export function readPieces(text) {
  if (text == null) return [];
  return String(text).split(' ').filter((w) => w !== '');
}

// A-135 council (5): one size per value. The pieces of a reading never shrink each on its own
// ("58" at 17 pt next to "cápsulas" at ~9 pt); one scale, from the measured column, for all:
// it all fits → full size; a little short → one line, every piece at the same scale (not below
// FLOOR); shorter still → it wraps at its spaces, at full size while the longest piece fits, else
// every piece at the scale the longest needs (not below MIN, so a word never breaks).
// Width: Geist Mono, 0.6 em per character less the -0.3 letter spacing (s.readVal 17 pt).
export const READ = { SIZE: 17, GAP: 10, FLOOR: 0.85, MIN: 0.55 };

export function readScale(pieces, column) {
  if (!(column > 0) || !pieces || !pieces.length) return 1;
  const w = (p) => String(p).length * (0.6 * READ.SIZE - 0.3);
  const words = pieces.reduce((n, p) => n + w(p), 0);
  const gaps = READ.GAP * (pieces.length - 1);
  if (words + gaps <= column) return 1;
  const down = (k) => Math.floor(k * 100) / 100;
  const one = (column - gaps) / words;
  if (one >= READ.FLOOR) return down(one);
  const longest = Math.max(...pieces.map(w));
  if (longest <= column) return 1;
  return Math.max(READ.MIN, down(column / longest));
}
