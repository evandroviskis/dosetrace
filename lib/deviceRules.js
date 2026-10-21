'use strict';
// A-119 one active device per account (docs/specs/one-active-device.md, AD-77, DL-102..DL-108):
// the pure rules. Plain CommonJS, no React Native, so every rule runs under node --test.

// OD-7 / DL-105: the server refuses a request from a device that is not the account's active one
// with a distinct SQLSTATE (supabase/migrations/20261021010000_one_active_device.sql), never a
// silent empty result. PostgREST passes the code through as error.code.
const REFUSALS = { DT001: 'not_active', DT002: 'device_required', DT003: 'update_required' };

function refusalOf(err) {
  if (!err || typeof err !== 'object') return null;
  const code = typeof err.code === 'string' ? err.code : null;
  return (code && REFUSALS[code]) || null;
}
function isDeviceRefusal(err) { return refusalOf(err) != null; }

// OD-5: the statuses the server can answer (device_status / claim_device). Only these, read from a
// JSON object of a reply WITHOUT an error, count. Anything else (network, timeout, 5xx, 401, the
// function missing before the migration, a garbled reply) is 'unknown' — never a wipe.
const STATUSES = new Set(['active', 'replaced', 'superseded', 'account_gone', 'in_use', 'none']);
// The answers that end this phone's hold on the account (screen 2 / the deletion notice).
const VERDICTS = new Set(['replaced', 'superseded', 'account_gone']);

function parseStatus(res) {
  if (!res || res.error) return { status: 'unknown' };
  const d = res.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { status: 'unknown' };
  if (!STATUSES.has(d.status)) return { status: 'unknown' };
  return { ...d };
}
function isVerdict(status) { return VERDICTS.has(status); }

// OD-17 / DL-105: a dotted version below another ("1.3.0" < "1.3.1"). Unknown or unreadable on
// either side is never "below" (no refusal on a maybe).
function versionParts(v) {
  if (typeof v !== 'string' || !/^\d+(\.\d+)*$/.test(v.trim())) return null;
  return v.trim().split('.').map((n) => Number(n));
}
function versionBelow(version, min) {
  const a = versionParts(version);
  const b = versionParts(min);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

// Ledger 2026-10-15 "A-119 notices name the other phone truthfully on both platforms": iPhone →
// "iPhone" (iPad → "iPad"); Android → the phone's own name when the system gives one, otherwise the
// brand ("seu Samsung"), otherwise "celular Android"; nothing known → "seu outro aparelho"; never a
// raw model code (e.g. "SM-F966U").
const BRANDS = {
  samsung: 'Samsung', google: 'Pixel', oneplus: 'OnePlus', xiaomi: 'Xiaomi', redmi: 'Redmi', poco: 'POCO',
  motorola: 'Motorola', huawei: 'Huawei', honor: 'HONOR', oppo: 'OPPO', vivo: 'vivo', realme: 'realme',
  sony: 'Sony', lge: 'LG', lg: 'LG', nokia: 'Nokia', asus: 'ASUS', nothing: 'Nothing', fairphone: 'Fairphone',
  tcl: 'TCL', zte: 'ZTE', lenovo: 'Lenovo', infinix: 'Infinix', tecno: 'TECNO',
};

// "SM-F966U", "CPH2449", "2201116SG", "moto g54 5G"? A code has digits and no space, or a dash
// between letter and digit groups. Names people see ("Galaxy Z Fold7", "Pixel 8") have a space.
function looksLikeModelCode(s) {
  const v = String(s || '').trim();
  if (!v) return true;
  if (/^[A-Z0-9]{1,6}-[A-Z0-9]+$/i.test(v)) return true;
  if (!/\s/.test(v) && /\d/.test(v)) return true;
  return false;
}

function brandName(brand) {
  const b = String(brand || '').trim();
  if (!b) return null;
  const known = BRANDS[b.toLowerCase()];
  if (known) return known;
  if (looksLikeModelCode(b) || !/^[A-Za-z][A-Za-z .&-]{1,19}$/.test(b)) return null;
  return b.charAt(0).toUpperCase() + b.slice(1);
}

// → { kind: 'named' | 'brand' | 'android' | 'unknown', name }
function deviceWords(info) {
  if (!info || typeof info !== 'object') return { kind: 'unknown', name: null };
  const platform = info.platform;
  const name = typeof info.name === 'string' ? info.name.trim() : '';
  if (platform === 'ios') return { kind: 'named', name: name === 'iPad' ? 'iPad' : 'iPhone' };
  if (platform === 'android') {
    if (name && !looksLikeModelCode(name) && name.length <= 40) return { kind: 'named', name };
    const b = brandName(info.brand);
    if (b) return { kind: 'brand', name: b };
    return { kind: 'android', name: null };
  }
  return { kind: 'unknown', name: null };
}

module.exports = { REFUSALS, refusalOf, isDeviceRefusal, parseStatus, isVerdict, versionBelow, deviceWords, looksLikeModelCode, brandName };
