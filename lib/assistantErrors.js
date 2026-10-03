// What the assistant tells the user when the AI can't be reached (AP-16, AP-18). Pure CJS.
// Every outcome is app-written and keeps the manual form one tap away; nothing typed is lost.
//   offline  → ap_err_offline   (no connection)
//   quota    → ap_err_quota     (10 uses this week; the server says when one frees up)
//   service  → ap_err_service   (AI down, not deployed yet, misconfigured, anything else)
function assistantErrorKind({ status, code, online }) {
  if (online === false) return 'offline';
  if (code === 'quota_exceeded' || (status === 429 && code !== 'turn_limit')) return 'quota';
  if (status == null && code == null) return 'offline'; // the request never got an answer
  return 'service';
}

// The notice (i18n key + params) for an error; `formatDay(iso)` formats the reset date in the
// app language (lib/localeFormat formatDate).
function assistantErrorNotice(err, formatDay) {
  const kind = assistantErrorKind(err || {});
  if (kind === 'quota') {
    const limit = String((err && err.limit) || 10);
    const iso = err && err.resetsAt;
    const day = iso && formatDay ? formatDay(iso) : '';
    return day ? { key: 'ap_err_quota', params: { limit, date: day } } : { key: 'ap_err_quota_nodate', params: { limit } };
  }
  return { key: kind === 'offline' ? 'ap_err_offline' : 'ap_err_service', params: {} };
}

module.exports = { assistantErrorKind, assistantErrorNotice };
