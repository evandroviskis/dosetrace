// A reading in a narrow column ("58 cápsulas", "120 cápsulas em gel") is laid out as pieces that
// may wrap only at an ordinary space (A-136 (4), Fold 7 2026-10-17: "58 cápsula / s" broke inside
// the word). The value stays glued to its first unit word by the no-break space (A-134 (2));
// each piece is shown on one line and shrinks to fit instead of breaking.
export function readPieces(text) {
  if (text == null) return [];
  return String(text).split(' ').filter((w) => w !== '');
}
