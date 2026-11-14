// The curve explained, the three cards (docs/specs/curve-explained.md CE-5 / CE-8; picture
// docs/design/curve-explained.html section 2): Picos e vales; Acúmulo; O exame mede um momento. On the
// first opening of Dose no corpo they show one at a time; the help mark in the title row reopens them;
// the curve's Premium lock shows the same three. Concepts only, never what the person should do.
//
// Storage choice: "already shown" is a per person and per device flag in AsyncStorage — it is not data
// the person entered (CLAUDE.md), and losing it can at worst show the cards once more. It is written as
// the cards open, so a closed app never shows them twice. Pure CommonJS (node --test).
'use strict';

const CURVE_CARDS = [
  { titleKey: 'curve_card1_t', bodyKey: 'curve_card1_b' },
  { titleKey: 'curve_card2_t', bodyKey: 'curve_card2_b' },
  { titleKey: 'curve_card3_t', bodyKey: 'curve_card3_b' },
];
const CURVE_FAQ_GROUP = 'curve';

// The two buttons of card i, and whether "Saiba mais" shows: Pular | Próximo on the first card,
// Voltar | Próximo in the middle, Voltar | Entendi + Saiba mais on the last.
function cardButtons(i) {
  const last = i >= CURVE_CARDS.length - 1;
  return { secKey: i <= 0 ? 'curve_cards_skip' : 'back', priKey: last ? 'curve_cards_done' : 'next', more: last };
}

// "1 de 3"
function stepText(t, i) {
  return String(t('curve_cards_step')).replace('{n}', String(i + 1)).replace('{total}', String(CURVE_CARDS.length));
}

function cardsStorageKey(userId) {
  return `dosetrace_curve_cards_v1:${userId}`;
}

// true once per person and device: the first opening of the curve. Remembered at once. A storage
// that fails shows nothing (the help mark still opens the cards) and never throws.
async function takeFirstOpen(store, userId) {
  if (!userId || !store) return false;
  try {
    if (await store.getItem(cardsStorageKey(userId))) return false;
    await store.setItem(cardsStorageKey(userId), String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

// Where "Saiba mais" goes: the FAQ, at the curve's group (questions arrive closed).
function learnMoreRoute() {
  return { route: 'FAQ', params: { openGroup: CURVE_FAQ_GROUP } };
}

module.exports = { CURVE_CARDS, CURVE_FAQ_GROUP, cardButtons, stepText, cardsStorageKey, takeFirstOpen, learnMoreRoute };
