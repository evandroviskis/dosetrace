// A-205 (Fold 2026-10-31, +qa4, a PNG lab report picked from the gallery): "Serviço de leitura
// indisponível" — the AI provider answered 400 invalid_request_error. The picker (quality 0.6)
// re-encodes the photo as JPEG but the asset keeps the original "image/png", so the app sent PNG for
// JPEG bytes. The type sent is read from the bytes themselves; the name or mimeType is only a fallback.
// Same code for lab reports, vaccine cards and vial labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { imageMediaType } = require('../lib/imageType');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary').toString('base64');
const HEIC = Buffer.from('\0\0\0\x18ftypheic', 'binary').toString('base64');

test('A-205: the bytes decide — JPEG bytes from a .png asset are sent as image/jpeg', () => {
  assert.equal(imageMediaType(JPEG, { mimeType: 'image/png', uri: 'file:///x.png' }), 'image/jpeg');
  assert.equal(imageMediaType(PNG, { mimeType: 'image/jpeg', uri: 'file:///x.jpg' }), 'image/png');
  assert.equal(imageMediaType(WEBP, {}), 'image/webp');
  assert.equal(imageMediaType(HEIC, {}), 'image/heic');
});

test('A-205: unknown bytes fall back to the asset (mimeType, then the name), then JPEG', () => {
  const odd = Buffer.from('hello world!').toString('base64');
  assert.equal(imageMediaType(odd, { mimeType: 'image/png' }), 'image/png');
  assert.equal(imageMediaType(odd, { uri: 'file:///a.PNG' }), 'image/png');
  assert.equal(imageMediaType(odd, {}), 'image/jpeg');
  assert.equal(imageMediaType('', null), 'image/jpeg');
});

test('A-205: lab reports, vaccine cards and vial labels all send the type read from the bytes', () => {
  for (const f of ['screens/BodyScreen.js', 'screens/components/VaccinesSection.js', 'screens/ProtocolsScreen.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(src, /const mediaType = imageMediaType\(asset\.base64, asset\);/, f);
    assert.doesNotMatch(src, /const mediaType = asset\.mimeType/, f);
  }
});
