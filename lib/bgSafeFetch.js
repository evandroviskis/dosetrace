'use strict';
// A-197 (Fold, 2026-10-28): on Android, with the app alive in the background, React Native pauses
// JS timers (JavaTimerManager: paused on host pause unless a headless JS task is active), and React
// Native's fetch (whatwg-fetch) hands every response over through setTimeout(…, 0). A background run
// (the reminder refresh, a notification action) therefore froze at its first network answer: the
// server answered, the app never got it, the run never finished and blocked the next one — a
// replaced phone kept all its reminders (OD-16). Fix (1), JS-only: while a background run is active
// (lib/backgroundMode), the global fetch goes through an XMLHttpRequest that resolves in its own
// load event — no JS timer — with a native timeout, so a stuck network cannot hang the run either.
// Everything else keeps React Native's fetch. Fix (2), native, runs the task as a headless JS task.
// Pure CommonJS (node --test); React Native pieces are injected or required lazily.

// The native timeout (OkHttp) of a background request: the JS abort timers are paused too.
const BG_FETCH_TIMEOUT_MS = 20000;

function abortError() {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

function parseHeaders(raw, Headers) {
  const h = new Headers();
  String(raw || '').split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(':');
    if (i <= 0) return;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) { try { h.append(k, v); } catch { /* an unusual header never breaks the answer */ } }
  });
  return h;
}

// [name, value] pairs from a Headers object, an array of pairs or a plain object.
function headerEntries(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers;
  if (typeof headers.forEach === 'function') {
    const out = [];
    headers.forEach((v, k) => out.push([k, v]));
    return out;
  }
  return Object.entries(headers);
}

// A fetch over XMLHttpRequest that settles in the request's own events (no JS timer).
// deps: { XMLHttpRequest, Response, Headers } — React Native's globals by default.
function xhrFetch(input, init = {}, deps = {}) {
  const XHR = deps.XMLHttpRequest || global.XMLHttpRequest;
  const Res = deps.Response || global.Response;
  const Hdr = deps.Headers || global.Headers;
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const opts = init || {};
  return new Promise((resolve, reject) => {
    const signal = opts.signal;
    if (signal && signal.aborted) { reject(abortError()); return; }
    const xhr = new XHR();
    let done = false;
    const settle = (fn, v) => { if (done) return; done = true; if (signal && onAbort) { try { signal.removeEventListener('abort', onAbort); } catch { /* ignore */ } } fn(v); };
    const onAbort = () => { try { xhr.abort(); } catch { /* ignore */ } settle(reject, abortError()); };
    xhr.onload = () => {
      // A status the Response refuses (0, or outside 200–599) rejects instead of hanging the run.
      try {
        const status = xhr.status;
        const body = 'response' in xhr && xhr.response != null && typeof xhr.response === 'string' ? xhr.response : xhr.responseText;
        const headers = parseHeaders(typeof xhr.getAllResponseHeaders === 'function' ? xhr.getAllResponseHeaders() : '', Hdr);
        // 204 / 304 carry no body (the Response constructor refuses one).
        const noBody = status === 204 || status === 304 || status === 205;
        settle(resolve, new Res(noBody ? null : body, { status, statusText: xhr.statusText || '', headers }));
      } catch {
        settle(reject, new TypeError('Network request failed'));
      }
    };
    xhr.onerror = () => settle(reject, new TypeError('Network request failed'));
    xhr.ontimeout = () => settle(reject, new TypeError('Network request timed out'));
    xhr.onabort = () => settle(reject, abortError());
    xhr.open(opts.method || 'GET', url, true);
    xhr.timeout = BG_FETCH_TIMEOUT_MS;
    for (const [k, v] of headerEntries(opts.headers)) xhr.setRequestHeader(k, v);
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);
    xhr.send(opts.body == null ? null : opts.body);
  });
}

// The global fetch: the background-safe path while a background run is active, React Native's
// fetch otherwise.
function createBgSafeFetch({ normalFetch, safeFetch, isBackgroundRun }) {
  return function bgSafeFetch(input, init) {
    let bg = false;
    try { bg = !!isBackgroundRun(); } catch { bg = false; }
    return bg ? safeFetch(input, init) : normalFetch(input, init);
  };
}

let installed = false;
// Called at module scope from index.js, before the app mounts (Android may start it headless).
function installBgSafeFetch() {
  if (installed) return;
  let Platform;
  try { ({ Platform } = require('react-native')); } catch { return; }
  if (!Platform || Platform.OS !== 'android') return;
  const normalFetch = global.fetch;
  if (typeof normalFetch !== 'function') return;
  const BG = require('./backgroundMode');
  global.fetch = createBgSafeFetch({
    normalFetch: (...a) => normalFetch(...a),
    safeFetch: (input, init) => xhrFetch(input, init),
    isBackgroundRun: () => BG.active(),
  });
  installed = true;
}

module.exports = { xhrFetch, createBgSafeFetch, installBgSafeFetch, BG_FETCH_TIMEOUT_MS };
