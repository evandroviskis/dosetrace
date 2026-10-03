// The email address typed on the sign-in / create-account screen, kept in memory for this
// run only so a trip back to onboarding and forward again keeps it (PA-62). Never written to
// storage, never the password. Cleared on a real sign-out and when someone signs in (Gate B).
let draftEmail = '';
export function getAuthDraft() { return draftEmail; }
export function setAuthDraft(v) { draftEmail = String(v || ''); }
export function clearAuthDraft() { draftEmail = ''; }
