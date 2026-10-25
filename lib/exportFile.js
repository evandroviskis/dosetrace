'use strict';
// A-167 council (build 5, 2026-10-22): where Settings › Download my data puts its file and what it
// adds from the account. The file goes to the cache folder — never backed up to iCloud or Android
// Auto Backup — and every copy (that one and the 1.2.x copy in Documents) is removed before the next
// export and by the sign-out / delete / account-switch wipes, so the health record never outlives the
// share it was made for. Not deleted right after the share sheet: on Android the receiving app
// (Drive, mail) may still be reading it.
const EXPORT_FILE_NAME = 'dosetrace_export.json';
// A-172 (1.3.2): My Body › Export records goes the same way — the CSV and the PDF get fixed names
// in the cache folder (the CSV sat in Documents, the PDF in expo-print's cache/Print/<uuid>.pdf, a
// new one per export) and join the list the export and the wipes remove. Only these app-made copies:
// a copy the user saved elsewhere through the share sheet (Files, Drive, mail) is its own file.
const RECORDS_CSV_NAME = 'dosetrace_records.csv';
const RECORDS_PDF_NAME = 'dosetrace_records.pdf';
const SHARED_FILE_NAMES = [EXPORT_FILE_NAME, RECORDS_CSV_NAME, RECORDS_PDF_NAME];
// expo-print writes every PDF to <cache>/Print/<uuid>.pdf (iOS and Android); the PDFs of earlier
// builds are still there.
const PRINT_FOLDER = 'Print/';

function sharedFilePath(FileSystem, name) {
  return (FileSystem && FileSystem.cacheDirectory ? FileSystem.cacheDirectory : '') + name;
}

function exportFilePath(FileSystem) {
  return sharedFilePath(FileSystem, EXPORT_FILE_NAME);
}

// Every place a shared health file may sit: the cache folder (now), Documents (1.2.x export, the
// records CSV before 1.3.2) and expo-print's folder in the cache.
function exportFilePaths(FileSystem) {
  const out = [];
  for (const dir of [FileSystem && FileSystem.cacheDirectory, FileSystem && FileSystem.documentDirectory]) {
    if (!dir) continue;
    for (const name of SHARED_FILE_NAMES) out.push(dir + name);
  }
  if (FileSystem && FileSystem.cacheDirectory) out.push(FileSystem.cacheDirectory + PRINT_FOLDER);
  return out;
}

// Never throws: a missing file or folder is already the wanted state.
async function removeExportFiles(FileSystem) {
  if (!FileSystem || typeof FileSystem.deleteAsync !== 'function') return;
  for (const p of exportFilePaths(FileSystem)) {
    try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch { /* already gone */ }
  }
}

// A-172: a file another module wrote in the cache (expo-print's PDF) moves to its fixed name, so the
// next export and the wipes find it. If the move fails, the file is shared where it is (still the
// cache, and the wipes clear expo-print's folder).
async function moveIntoSharedFile(FileSystem, fromUri, name) {
  const to = sharedFilePath(FileSystem, name);
  try {
    await FileSystem.deleteAsync(to, { idempotent: true });
    await FileSystem.moveAsync({ from: fromUri, to });
    return to;
  } catch {
    return fromUri;
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

module.exports = {
  EXPORT_FILE_NAME, RECORDS_CSV_NAME, RECORDS_PDF_NAME, sharedFilePath, exportFilePath, exportFilePaths,
  removeExportFiles, moveIntoSharedFile, profileForExport, clearExportFile,
};
