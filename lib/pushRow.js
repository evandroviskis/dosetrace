'use strict';
// A-127 / A-156 review round 2, item 3: the push token row (lib/notifications registerPushToken) is
// re-written on every foreground, but only when something on it changed — the account, the app
// version (a store auto-update), the language, the time zone, the device id — or once a day as a
// heartbeat (a new Expo token is picked up there). The check runs BEFORE the Expo token is fetched,
// so an unchanged foreground makes no call to exp.host and no upsert. A forced write (sign-in, a
// language change, "Use here", the version-news yes) always goes. Plain CommonJS for node --test.

const DAY_MS = 24 * 3600 * 1000;
const CLOCK_SLACK_MS = 60 * 1000;

// The cheap fields (known without exp.host) as one comparable string.
function pushRowPrint({ userId, appVersion, language, timezone, deviceId } = {}) {
  return JSON.stringify([userId || null, appVersion || null, language || null, timezone || null, deviceId || null]);
}

// prev = { print, token, at } as stored after the last write that worked.
function pushRowDue({ prev, cheap, now, force }) {
  if (force) return true;
  if (!prev || typeof prev !== 'object') return true;
  if (prev.print !== pushRowPrint(cheap)) return true;
  if (!Number.isFinite(prev.at)) return true;
  if (prev.at > now + CLOCK_SLACK_MS) return true; // stamped by a clock that was ahead
  return now - prev.at >= DAY_MS;
}

// A-173: the phone's notifications are off. A stored row (the last token written) is removed so the
// panel never counts this phone as reachable; no stored row → nothing to do (no call each foreground).
function pushRowWhenBlocked(prev) {
  const token = prev && typeof prev === 'object' && typeof prev.token === 'string' && prev.token ? prev.token : null;
  return { remove: token };
}

module.exports = { pushRowPrint, pushRowDue, pushRowWhenBlocked, DAY_MS };
