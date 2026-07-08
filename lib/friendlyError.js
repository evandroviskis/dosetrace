// Converts a raw backend/SDK error (Supabase auth, RevenueCat, network, local
// DB, etc.) into a friendly, LOCALIZED message so users never see raw English
// error text in a dialog. Recognized cases (network / bad credentials / email
// not confirmed / rate limit) map to specific copy; everything else falls back
// to `fallbackKey` (default 'error_generic'). The raw message is logged to the
// console so the technical detail isn't lost for debugging.
//
// Usage: Alert.alert(t('error'), friendlyError(err, t))
//        Alert.alert(t('error'), friendlyError(err, t, 'error_save_failed'))

function friendlyError(err, t, fallbackKey = 'error_generic') {
  const raw = String((err && (err.message || err.error)) || err || '').trim();
  if (raw) {
    try { console.warn('[DoseTrace] handled error:', raw); } catch { /* noop */ }
  }
  const m = raw.toLowerCase();
  if (!m) return t(fallbackKey);

  if (/network|fetch failed|failed to fetch|timeout|timed out|connection|offline|internet|econn|enotfound|socket|networkerror/.test(m)) {
    return t('error_network');
  }
  if (/invalid login|invalid credentials|bad credentials|invalid email or password|incorrect password/.test(m)) {
    return t('auth_invalid_credentials');
  }
  if (/email not confirmed|not confirmed|confirm your email/.test(m)) {
    return t('auth_email_not_confirmed');
  }
  if (/rate limit|too many|429|send rate|for security purposes/.test(m)) {
    return t('auth_too_many');
  }
  return t(fallbackKey);
}

module.exports = { friendlyError };
