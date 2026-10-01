'use strict';
// What each way of leaving the injection-site picker does. Pure — runs under plain
// node --test (__tests__/siteBeforeTaken.test.js, __tests__/sitePickerUndo.test.js).
//
// S-25 (founder 2026-10-01) replaces the S-20 write-then-undo model: an injectable
// dose is written only AFTER the app asks where it was injected. Sites stay OPTIONAL
// (they help rotation — less pain, fewer nodules — and never change a result).
//
// mode 'ask': the site question opened by Mark taken (Today, the Pending block, the
//   S-17 day prompt, the notification Taken button, the Dose log's Missed → Taken).
//   Nothing is written yet.
//   save = write the dose WITH the site.   skip = write the dose, no site.
//   cancel (Cancel / X) = write nothing, and say the dose was not marked.
//   back (Android button or gesture) = never decides by itself: the picker stays and
//     a confirmation asks stay / leave. leave (confirmed) = the same as cancel.
// mode 'edit': a saved Dose-log row's site — cancel / back only close; save writes the site.
function planSitePickerAction({ mode = 'edit', action } = {}) {
  const out = { close: true, commit: false, writeSite: false, notice: false, confirm: false };
  if (mode === 'ask') {
    if (action === 'save') return { ...out, commit: true, writeSite: true };
    if (action === 'skip') return { ...out, commit: true };
    if (action === 'back') return { ...out, close: false, confirm: true };
    if (action === 'cancel' || action === 'leave') return { ...out, notice: true };
    return out;
  }
  if (action === 'save') return { ...out, writeSite: true };
  return out;
}

module.exports = { planSitePickerAction };
