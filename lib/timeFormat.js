// Locale-aware time-of-day formatting.
//
// Replaces the old hardcoded "h:MM AM/PM" so dose/reminder times read naturally
// in each language: English keeps "2:30 PM", but German/French/Italian show
// "14:30", Spanish "2:30 p. m.", etc. Uses toLocaleTimeString (already relied
// on by LogScreen, so supported in the app's Hermes build) with a plain 24h
// fallback if Intl formatting throws.

const LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

// time24: "HH:MM" (24-hour). Returns "—" for empty/invalid input.
function formatTime(time24, language) {
  if (!time24) return '—';
  const parts = String(time24).split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
  try {
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString(LOCALES[language] || 'en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

module.exports = { formatTime };
