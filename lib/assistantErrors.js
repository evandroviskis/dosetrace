// What the assistant tells the user when the AI can't be reached (AP-16, AP-18). Pure CJS.
// Every outcome is app-written and keeps the manual form one tap away; nothing typed is lost.
//   offline  → ap_err_offline   (no connection)
//   quota    → ap_err_quota     (10 uses in the last 7 days, rolling; the server says when one frees up)
//   service  → ap_err_service   (AI down, not deployed yet, misconfigured, anything else)
// DV-240 (AD-105): the server's abuse ceilings each say what is true —
//   turn_limit           → ap_err_turn_limit (40 answers in this conversation)
//   daily_turn_limit     → ap_err_daily      (200 answers in the last 24 hours)
//   conversation_expired → ap_err_expired    (the conversation is over a day old)
const CAP_KEYS = { turn_limit: 'ap_err_turn_limit', daily_turn_limit: 'ap_err_daily', conversation_expired: 'ap_err_expired' };
function assistantErrorKind({ status, code, online }) {
  if (online === false) return 'offline';
  if (CAP_KEYS[code]) return code;
  if (code === 'quota_exceeded' || status === 429) return 'quota';
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
  if (CAP_KEYS[kind]) return { key: CAP_KEYS[kind], params: {} };
  return { key: kind === 'offline' ? 'ap_err_offline' : 'ap_err_service', params: {} };
}

module.exports = { assistantErrorKind, assistantErrorNotice };
