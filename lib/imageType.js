'use strict';
// A-205: the media type of a photo sent to the AI, read from its first bytes. The image picker
// (quality < 1) re-encodes a PNG as JPEG but keeps the asset's original mimeType, and the provider
// refuses a type that does not match the bytes (400). Unknown bytes: the asset's mimeType, then its
// name, then JPEG (the picker's own output). Pure CommonJS (node --test).
const B64_HEADS = [
  ['/9j/', 'image/jpeg'],
  ['iVBORw0KGgo', 'image/png'],
  ['R0lGOD', 'image/gif'],
];

// The first bytes of a base64 string, as a binary string (no Buffer / atob: React Native safe).
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function headBytes(b64, n) {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const ch of b64) {
    const v = ABC.indexOf(ch);
    if (v < 0) break;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((acc >> bits) & 0xff); if (out.length >= n) break; }
  }
  return out;
}

function imageMediaType(base64, asset) {
  const b = String(base64 || '');
  for (const [head, type] of B64_HEADS) if (b.startsWith(head)) return type;
  const bytes = headBytes(b.slice(0, 24), 16);
  if (bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1)/.test(bytes.slice(8, 12))) return 'image/heic';
  const a = asset || {};
  if (a.mimeType) return a.mimeType;
  return String(a.uri || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

module.exports = { imageMediaType };
