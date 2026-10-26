'use strict';
// A-127 UN-8 (docs/specs/update-notice.md; founder 2026-10-20 "1.3.2 recommendations accepted"): the
// required-update screen offers the export, named as the Settings row ("Baixar meus dados": one term per
// concept, coordinator 2026-10-26). It runs the ONE export of Settings
// (lib/accountActions exportMyData, passed in by App.js — never a second implementation) and answers
// with the same words Settings shows. Pure: it deletes nothing and never signs anyone out.
//   → null when nothing more is shown (the share sheet opened, or no account to export), else the
//     DoseTrace sheet config: the Settings "done" notice (no share sheet on the phone) or its error.

async function requiredExport({ user, t, exportMyData }) {
  if (!user || !user.id) return null;
  try {
    const r = await exportMyData(user, t('settings_export_title'));
    if (r && r.saved) return { icon: 'check', title: t('settings_export_title'), body: t('settings_export_done'), buttons: [{ label: t('ok'), kind: 'primary' }] };
    return null;
  } catch {
    return { icon: 'warning', title: t('settings_export_title'), body: t('settings_export_error'), buttons: [{ label: t('ok'), kind: 'primary' }] };
  }
}

// One export at a time: a second tap while the share sheet is being prepared is ignored.
function createRequiredExport() {
  let running = false;
  return {
    busy: () => running,
    async run(args) {
      if (running) return null;
      running = true;
      try { return await requiredExport(args); } finally { running = false; }
    },
  };
}

module.exports = { requiredExport, createRequiredExport };
