'use strict';
// A-197 (found on the Fold, 2026-10-28, development client + Metro logs): on Android, with the app
// alive in the background, React Native pauses JS timers, and React Native's fetch (whatwg-fetch)
// hands every response over through setTimeout(…, 0). The background run therefore froze at its
// first network answer (the server answered device_status_by_secret 200, the app never got it), a
// replaced phone kept all its reminders, and the stuck run blocked the next one. Fix (1), JS-only:
// while a background run is active, the global fetch goes through an XMLHttpRequest that resolves in
// its own load event — no JS timer — with a native timeout so a stuck network cannot hang the run.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createBgSafeFetch, xhrFetch, BG_FETCH_TIMEOUT_MS } = require('../lib/bgSafeFetch');

// A minimal XMLHttpRequest stand-in: records what was sent and lets the test fire the events.
function fakeXhrClass(log) {
  return class FakeXhr {
    constructor() { this.headers = {}; this.status = 0; this.responseText = ''; this.timeout = 0; log.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    getAllResponseHeaders() { return 'content-type: application/json\r\nx-test: 1\r\n'; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; if (this.onabort) this.onabort(); }
  };
}

// Response / Headers as React Native provides them (whatwg-fetch); Node 24 has compatible globals.
const env = { Response: global.Response, Headers: global.Headers };

test('A-197: the background-safe fetch resolves on the load event without any JS timer', async () => {
  const log = [];
  const realSetTimeout = global.setTimeout;
  let timerUsed = false;
  global.setTimeout = (...a) => { timerUsed = true; return realSetTimeout(...a); };
  try {
    const p = xhrFetch('https://x.supabase.co/rest/v1/rpc/device_status_by_secret', {
      method: 'POST', headers: { apikey: 'k', 'Content-Type': 'application/json' }, body: '{"p_secret":"s"}',
    }, { XMLHttpRequest: fakeXhrClass(log), ...env });
    const xhr = log[0];
    assert.equal(xhr.method, 'POST');
    assert.equal(xhr.url, 'https://x.supabase.co/rest/v1/rpc/device_status_by_secret');
    assert.equal(xhr.headers.apikey, 'k');
    assert.equal(xhr.body, '{"p_secret":"s"}');
    assert.equal(xhr.timeout, BG_FETCH_TIMEOUT_MS, 'a native timeout, never a JS timer');
    xhr.status = 200; xhr.responseText = '{"status":"replaced"}';
    xhr.onload();
    const res = await p;
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-test'), '1');
    assert.deepEqual(await res.json(), { status: 'replaced' });
    assert.equal(timerUsed, false, 'no setTimeout on the way to the answer');
  } finally {
    global.setTimeout = realSetTimeout;
  }
});

test('A-197: a network error, a native timeout and an abort all reject at once', async () => {
  const log = [];
  const X = fakeXhrClass(log);
  const p1 = xhrFetch('https://x/a', {}, { XMLHttpRequest: X, ...env });
  log[0].onerror();
  await assert.rejects(p1, /Network request failed/);
  const p2 = xhrFetch('https://x/b', {}, { XMLHttpRequest: X, ...env });
  log[1].ontimeout();
  await assert.rejects(p2, /timed out/);
  const ac = new AbortController();
  const p3 = xhrFetch('https://x/c', { signal: ac.signal }, { XMLHttpRequest: X, ...env });
  ac.abort();
  await assert.rejects(p3, (e) => e && e.name === 'AbortError');
  assert.equal(log[2].aborted, true);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(xhrFetch('https://x/d', { signal: pre.signal }, { XMLHttpRequest: X, ...env }), (e) => e && e.name === 'AbortError');
});

test('A-197: the global fetch uses the background-safe path only while a background run is active', async () => {
  let active = false;
  const calls = [];
  const normal = async (url) => { calls.push(['normal', url]); return 'N'; };
  const safe = async (url) => { calls.push(['safe', url]); return 'S'; };
  const f = createBgSafeFetch({ normalFetch: normal, safeFetch: safe, isBackgroundRun: () => active });
  assert.equal(await f('https://x/1'), 'N');
  active = true;
  assert.equal(await f('https://x/2'), 'S');
  active = false;
  assert.equal(await f('https://x/3'), 'N');
  assert.deepEqual(calls.map((c) => c[0]), ['normal', 'safe', 'normal']);
});

test('A-197: index.js installs the background-safe fetch before the app mounts (Android only)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(src, /installBgSafeFetch\(\)/);
  assert.ok(src.indexOf('installBgSafeFetch()') < src.indexOf('registerRootComponent(App)'));
  const mod = fs.readFileSync(path.join(__dirname, '..', 'lib', 'bgSafeFetch.js'), 'utf8');
  assert.match(mod, /Platform\.OS !== 'android'/);
});

test('A-197 review 8: a status the Response refuses (0) rejects instead of hanging the run', async () => {
  const log = [];
  const p = xhrFetch('https://x/z', {}, { XMLHttpRequest: fakeXhrClass(log), ...env });
  log[0].status = 0; log[0].responseText = '';
  log[0].onload();
  await assert.rejects(p, /Network request failed/);
});
