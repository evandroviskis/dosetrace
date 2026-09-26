// Where the App Store Connect API key (.p8) lives. Keys are NOT kept in Downloads
// any more — a Downloads cleanup lost the only copy once (2026-09). Canonical home:
// ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 (Apple's own convention; not
// synced, not a download folder). ASC_KEY_PATH overrides; Downloads is a last-resort
// fallback so an unmoved key still works. Never commit the key.
const fs = require('fs');
const path = require('path');

const KEY_ID = process.env.ASC_KEY_ID || 'N493SYFP2T';
const HOME = process.env.HOME;
const CANDIDATES = [
  process.env.ASC_KEY_PATH,
  path.join(HOME, '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`),
  path.join(HOME, 'Downloads', `AuthKey_${KEY_ID}.p8`),
].filter(Boolean);

function keyPath() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    console.error(`ASC key AuthKey_${KEY_ID}.p8 not found. Looked in:\n  ${CANDIDATES.join('\n  ')}\n` +
      'Put it in ~/.appstoreconnect/private_keys/ (mkdir -p it first), or set ASC_KEY_PATH / ASC_KEY_ID.');
    process.exit(1);
  }
  return found;
}

function readKey() { return fs.readFileSync(keyPath(), 'utf8'); }

module.exports = { KEY_ID, keyPath, readKey };
