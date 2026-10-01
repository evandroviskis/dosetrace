// Width of a fixed-width animated number field (components/motion AnimatedNumber), so a
// unit placed after it sits right next to the digits (A-72). Pure, CommonJS (node tests).
// Digits take about 0.6 em in Geist; a point, comma or space about 0.32 em.
function numberWidth(str, fontSize, fontScale = 1) {
  let em = 0;
  for (const ch of String(str)) em += /[.,\s]/.test(ch) ? 0.32 : 0.6;
  return Math.ceil(em * fontSize * fontScale) + 4;
}

module.exports = { numberWidth };
