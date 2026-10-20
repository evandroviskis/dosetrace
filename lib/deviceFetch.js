'use strict';
// A-119 OD-7 / OD-17: every request to the project's data and functions carries this phone's device id
// and app version (x-dt-device, x-dt-app-version), which the server's guard reads. Auth requests do
// not need them. If the id cannot be read the request still goes (without it): the server then
// refuses it with a distinct code once the account has a device (DT002), and the rows stay pending.
// Plain CommonJS: the base fetch and the header source are injected (lib/supabase.js wires them).

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input);
}

function withDeviceHeaders(baseFetch, getHeaders, baseUrl) {
  return async function deviceFetch(input, init) {
    const u = urlOf(input);
    const ours = !baseUrl || u.startsWith(baseUrl);
    if (!ours || /\/auth\/v1\//.test(u)) return baseFetch(input, init);
    let extra = {};
    try { extra = (await getHeaders()) || {}; } catch { extra = {}; }
    if (!Object.keys(extra).length) return baseFetch(input, init);
    const from = (init && init.headers) || (input && typeof input === 'object' && input.headers) || undefined;
    const headers = new Headers(from);
    for (const [k, v] of Object.entries(extra)) if (v != null) headers.set(k, String(v));
    return baseFetch(input, { ...(init || {}), headers });
  };
}

module.exports = { withDeviceHeaders };
