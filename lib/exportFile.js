'use strict';
// A-167 council (build 5, 2026-10-22): where Settings › Download my data puts its file and what it
// adds from the account. The file goes to the cache folder — never backed up to iCloud or Android
// Auto Backup — and every copy (that one and the 1.2.x copy in Documents) is removed before the next
// export and by the sign-out / delete / account-switch wipes, so the health record never outlives the
// share it was made for. Not deleted right after the share sheet: on Android the receiving app
// (Drive, mail) may still be reading it.
const EXPORT_FILE_NAME = 'dosetrace_export.json';

function exportFilePath(FileSystem) {
  return (FileSystem && FileSystem.cacheDirectory ? FileSystem.cacheDirectory : '') + EXPORT_FILE_NAME;
}

// Every place an export file may sit: the cache folder (now) and Documents (1.2.x).
function exportFilePaths(FileSystem) {
  const out = [];
  for (const dir of [FileSystem && FileSystem.cacheDirectory, FileSystem && FileSystem.documentDirectory]) {
    if (dir) out.push(dir + EXPORT_FILE_NAME);
  }
  return out;
}

// Never throws: a missing file or folder is already the wanted state.
async function removeExportFiles(FileSystem) {
  if (!FileSystem || typeof FileSystem.deleteAsync !== 'function') return;
  for (const p of exportFilePaths(FileSystem)) {
    try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch { /* already gone */ }
  }
}

// The account's own settings and answers kept in user_metadata (name, birth year and month, sex,
// activity, goals, country, reminder and privacy choices, calculator inputs and checks), minus the
// app's internal migration markers.
function profileForExport(user) {
  const md = (user && user.user_metadata) || {};
  const out = {};
  for (const [k, v] of Object.entries(md)) {
    if (/migrated/.test(k)) continue;
    out[k] = v;
  }
  return out;
}

// The wipe step (lib/signedOut runWipeSteps, lib/accountGuard): loads the module lazily.
function clearExportFile() {
  let FileSystem = null;
  try { FileSystem = require('expo-file-system/legacy'); } catch { return Promise.resolve(); }
  return removeExportFiles(FileSystem);
}

module.exports = { EXPORT_FILE_NAME, exportFilePath, exportFilePaths, removeExportFiles, profileForExport, clearExportFile };
