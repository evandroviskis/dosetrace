// Time-of-day formatting with a user preference.
//
// Default ('auto') is locale-aware: English shows "2:30 PM", German/French/
// Italian "14:30", Spanish "2:30 p. m.", etc. The user can override this in
// Settings to force 12-hour (AM/PM) or 24-hour regardless of language.
// Uses toLocaleTimeString (relied on elsewhere, so supported in the app's
// Hermes build) with a plain 24h fallback if Intl formatting throws.

const LOCALES = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

// Resolve the user's preference to a hour12 flag; undefined = locale default.
function hour12Pref(timeFormat) {
  if (timeFormat === '12h') return true;
  if (timeFormat === '24h') return false;
  return undefined;
}

// time24: "HH:MM" (24-hour). timeFormat: 'auto' | '12h' | '24h'.
// Returns "—" for empty/invalid input.
function formatTime(time24, language, timeFormat) {
  if (!time24) return '—';
  const parts = String(time24).split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
  try {
    const d = new Date(2000, 0, 1, h, m);
    const opts = { hour: 'numeric', minute: '2-digit' };
    const h12 = hour12Pref(timeFormat);
    if (h12 !== undefined) opts.hour12 = h12;
    return d.toLocaleTimeString(LOCALES[language] || 'en-US', opts);
  } catch {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

module.exports = { formatTime, hour12Pref, LOCALES };
