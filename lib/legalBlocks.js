// Splits one of the app's legal texts (privacy policy, terms, medical disclaimer) into
// display blocks for components/LegalModal.js: a short line written entirely in
// capitals is a heading, every other non-empty line a paragraph. Every word is kept,
// in its own case — sentence-casing the headings by code would break German nouns and
// acronyms, so that stays a copy change in i18n/translations.js.

export function isLegalHeading(line) {
  const t = (line || '').trim();
  return t.length > 0 && t.length < 60 && t === t.toUpperCase() && t !== t.toLowerCase();
}

export function legalBlocks(content) {
  return String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ heading: isLegalHeading(text), text }));
}
