'use strict';
// S-20 (A-39 + A-38(d); founder decisions 2026-09-28 and 2026-09-30). What each way
// of leaving the injection-site picker does. Pure — runs under plain node --test
// (__tests__/sitePickerUndo.test.js).
//
// Sites are OPTIONAL (they help rotation; a Taken dose may have no site).
//
// mode 'take': the picker opened BY Mark taken (the dose is already written).
//   cancel (Cancel / X) = that dose is undone, and the screen says so.
//   back (Android button or gesture) = NEVER undoes by itself: the picker stays and
//     a confirmation asks stay / leave. leave (confirmed) = the same as cancel.
//   skip = keep the dose, no site.   save = keep the dose, store the site.
// mode 'add' (the Undo bar's "Add site") and 'edit' (a saved Dose-log row): the
//   user opened it on purpose — cancel / back only close (nothing is written
//   without Save, so there is nothing to confirm).
// undone: the dose was already undone (double tap, or Undo from the bar): nothing
//   more is undone and no site is ever written onto the restored / deleted row.
function planSitePickerAction({ mode = 'edit', action, undone = false } = {}) {
  const out = { close: true, undo: false, writeSite: false, notice: false, confirm: false };
  if (action === 'save') return { ...out, writeSite: !undone };
  if (mode !== 'take' || undone) return out;
  if (action === 'back') return { ...out, close: false, confirm: true };
  if (action === 'cancel' || action === 'leave') return { ...out, undo: true, notice: true };
  return out;
}

module.exports = { planSitePickerAction };
