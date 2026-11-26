'use strict';
// How-to videos in the FAQ (docs/specs/howto-videos.md HV-1..HV-12): the pure rules of lib/howtoVideos.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/howtoVideos.js');
const { translations: tr } = require('../i18n/translations.js');

const B = H.HOWTO_BASE;
const e = (over = {}) => ({ lang: 'pt', variant: 'ios', url: `${B}pt/recon-ios.mp4`, dur: 42, ...over });
const man = (videos) => H.parseManifest({ v: 1, videos });
const tFor = (l) => (k) => (k in tr[l] ? tr[l][k] : k);

test('HV-6: the manifest lives in our public howto bucket, fetched with a 3 s timeout', () => {
  assert.equal(B, 'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/');
  assert.equal(H.MANIFEST_URL, `${B}manifest.json`);
  assert.equal(H.HOWTO_TIMEOUT_MS, 3000);
});

test('HV-6: a valid manifest is kept with its entries, a broken file is null (fails closed)', () => {
  const m = man({ recon_calc: [e(), e({ lang: 'en', url: `${B}en/a.mp4`, minApp: '1.3.2', maxApp: '1.9' })] });
  assert.equal(m.v, 1);
  assert.equal(m.videos.recon_calc.length, 2);
  assert.equal(m.videos.recon_calc[1].minApp, '1.3.2');
  assert.deepEqual(H.parseManifest(JSON.stringify({ v: 1, videos: { a: [e()] } })).videos.a[0].url, `${B}pt/recon-ios.mp4`);
  for (const bad of [null, undefined, '', '{not json', '[]', 42, { v: 2, videos: {} }, { videos: {} }, { v: 1 }, { v: 1, videos: [] }, { v: '1', videos: {} }]) {
    assert.equal(H.parseManifest(bad), null, JSON.stringify(bad));
  }
});

test('HV-6: a URL outside our bucket host is never accepted', () => {
  assert.ok(H.isHowtoUrl(`${B}pt/recon-ios.mp4`));
  assert.ok(H.isHowtoUrl(`${B}recon_calc-pt-fold-open.mp4`));
  for (const u of [
    'http://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/a.mp4',
    'https://evil.example/storage/v1/object/public/howto/a.mp4',
    'https://mqfvnqfusqyhqhowfweh.supabase.co.evil.example/storage/v1/object/public/howto/a.mp4',
    'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/other/a.mp4',
    'https://mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/sign/howto/a.mp4',
    `${B}../other/a.mp4`,
    `${B}pt/../../a.mp4`,
    `${B}a.mp4?redirect=https://evil.example`,
    `${B}a.mp4#x`,
    `${B}//evil.example/a.mp4`,
    `${B}`,
    `${B}.hidden`,
    'https://user@mqfvnqfusqyhqhowfweh.supabase.co/storage/v1/object/public/howto/a.mp4',
    null, 42,
  ]) assert.equal(H.isHowtoUrl(u), false, String(u));
  const m = man({ q1: [e({ url: 'https://evil.example/a.mp4' })], q2: [e()] });
  assert.equal(m.videos.q1, undefined, 'the entry with a foreign URL is dropped');
  assert.equal(m.videos.q2.length, 1);
});

test('HV-6: an invalid entry is dropped on its own (language, variant, duration, version range, bySex)', () => {
  const m = man({ q: [
    e({ lang: 'ru' }), e({ lang: 'PT' }), e({ variant: 'ipad' }), e({ variant: 'ios-x' }),
    e({ dur: 0 }), e({ dur: -3 }), e({ dur: '42' }), e({ dur: NaN }), e({ dur: 99999 }),
    e({ minApp: 'abc' }), e({ maxApp: 3 }),
    e({ variant: 'ios-f' }), // a sex suffix without bySex
    e({ bySex: true }), // bySex without a sex suffix
    e({ variant: 'ios-f', bySex: true, url: `${B}f.mp4` }),
  ] });
  assert.deepEqual(m.videos.q.map((x) => x.variant), ['ios-f']);
});

test('HV-8: the phone family', () => {
  assert.equal(H.phoneVariant({ os: 'ios', book: false }), 'ios');
  assert.equal(H.phoneVariant({ os: 'android', book: false }), 'android');
  assert.equal(H.phoneVariant({ os: 'android', book: true }), 'fold-open');
  assert.equal(H.phoneVariant({ os: 'ios', book: true }), 'ios-fold-open');
});

test('HV-1 / HV-7: only the app language, never a fallback to another language', () => {
  const m = man({ recon_calc: [e({ lang: 'en', url: `${B}en.mp4` })] });
  assert.equal(H.pickVideo(m, { id: 'recon_calc', lang: 'pt', os: 'ios' }), null);
  assert.equal(H.pickVideo(m, { id: 'recon_calc', lang: 'en', os: 'ios' }).url, `${B}en.mp4`);
  assert.equal(H.pickVideo(m, { id: 'other', lang: 'en', os: 'ios' }), null, 'no entry for the question → nothing');
  assert.equal(H.pickVideo(null, { id: 'recon_calc', lang: 'en', os: 'ios' }), null, 'no manifest → nothing');
  assert.equal(H.pickVideo(m, { id: 'recon_calc', lang: 'xx', os: 'ios' }), null);
});

test('HV-8: a missing variant falls back to the plain phone variant of the same system, never another system', () => {
  const m = man({ q: [e({ variant: 'ios', url: `${B}ios.mp4` }), e({ variant: 'android', url: `${B}and.mp4` }), e({ variant: 'fold-open', url: `${B}fold.mp4` })] });
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'android', book: true }).url, `${B}fold.mp4`);
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'android', book: false }).url, `${B}and.mp4`);
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', book: true }).url, `${B}ios.mp4`, 'ios-fold-open missing → ios');
  const onlyIos = man({ q: [e({ variant: 'ios' })] });
  assert.equal(H.pickVideo(onlyIos, { id: 'q', lang: 'pt', os: 'android', book: false }), null, 'an Android phone never plays the iPhone video');
  const onlyFold = man({ q: [e({ variant: 'fold-open' })] });
  assert.equal(H.pickVideo(onlyFold, { id: 'q', lang: 'pt', os: 'android', book: false }), null, 'a folded phone never plays the open-Fold video');
});

test('HV-8: bySex videos follow the profile sex; never the other sex; unknown sex → the plain video only', () => {
  const both = man({ site: [
    e({ variant: 'ios-f', bySex: true, url: `${B}f.mp4` }),
    e({ variant: 'ios-m', bySex: true, url: `${B}m.mp4` }),
  ] });
  assert.equal(H.pickVideo(both, { id: 'site', lang: 'pt', os: 'ios', sex: 'female' }).url, `${B}f.mp4`);
  assert.equal(H.pickVideo(both, { id: 'site', lang: 'pt', os: 'ios', sex: 'male' }).url, `${B}m.mp4`);
  assert.equal(H.pickVideo(both, { id: 'site', lang: 'pt', os: 'ios', sex: null }), null, 'no sex in the profile → no body video');
  const onlyF = man({ site: [e({ variant: 'ios-f', bySex: true, url: `${B}f.mp4` })] });
  assert.equal(H.pickVideo(onlyF, { id: 'site', lang: 'pt', os: 'ios', sex: 'male' }), null, 'never the other sex');
  const withPlain = man({ site: [e({ variant: 'ios-f', bySex: true, url: `${B}f.mp4` }), e({ variant: 'ios', url: `${B}plain.mp4` })] });
  assert.equal(H.pickVideo(withPlain, { id: 'site', lang: 'pt', os: 'ios', sex: 'male' }).url, `${B}plain.mp4`);
  // Fold open, female: fold-open-f, fold-open, android-f, android.
  assert.deepEqual(H.variantOrder({ os: 'android', book: true, sex: 'female' }), ['fold-open-f', 'fold-open', 'android-f', 'android']);
  assert.deepEqual(H.variantOrder({ os: 'ios', book: false, sex: null }), ['ios']);
  const foldF = man({ site: [e({ variant: 'android-f', bySex: true, url: `${B}af.mp4` }), e({ variant: 'android-m', bySex: true, url: `${B}am.mp4` })] });
  assert.equal(H.pickVideo(foldF, { id: 'site', lang: 'pt', os: 'android', book: true, sex: 'female' }).url, `${B}af.mp4`);
  // Changing the sex in the profile switches the variant at the next open (the pick reads it each time).
  assert.equal(H.pickVideo(foldF, { id: 'site', lang: 'pt', os: 'android', book: true, sex: 'male' }).url, `${B}am.mp4`);
});

test('HV-6: an entry outside the app version range shows no row; an unknown app version only plays unranged entries', () => {
  const m = man({ q: [e({ minApp: '1.3.2', maxApp: '1.4' })] });
  assert.ok(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', appVersion: '1.3.2' }));
  assert.ok(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', appVersion: '1.4.0' }));
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', appVersion: '1.3.1' }), null);
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', appVersion: '1.4.1' }), null);
  assert.equal(H.pickVideo(m, { id: 'q', lang: 'pt', os: 'ios', appVersion: null }), null);
  const open = man({ q: [e()] });
  assert.ok(H.pickVideo(open, { id: 'q', lang: 'pt', os: 'ios', appVersion: null }));
});

test('HV-1 / HV-5: the row is play online, the offline line offline, nothing without a video', () => {
  assert.equal(H.rowState(e(), true), 'play');
  assert.equal(H.rowState(e(), false), 'offline');
  assert.equal(H.rowState(null, true), null);
  assert.equal(H.rowState(null, false), null);
});

test('HV-1 / HV-3: durations in m:ss', () => {
  assert.equal(H.formatDuration(42), '0:42');
  assert.equal(H.formatDuration(42.9), '0:42');
  assert.equal(H.formatDuration(65), '1:05');
  assert.equal(H.formatDuration(600), '10:00');
  assert.equal(H.formatDuration(3723), '1:02:03');
  assert.equal(H.formatDuration(0), '0:00');
  assert.equal(H.formatDuration(-5), '0:00');
  assert.equal(H.formatDuration(NaN), '0:00');
  assert.equal(H.formatDuration(undefined), '0:00');
});

test('HV-2: the screen-reader label in the 6 languages ("Vídeo, 42 segundos: <pergunta>")', () => {
  const q = 'Como funciona a calculadora de reconstituição?';
  assert.equal(H.rowA11yLabel(e(), q, tFor('pt'), 'pt'), `Vídeo, 42 segundos: ${q}`);
  assert.equal(H.rowA11yLabel(e({ dur: 1 }), q, tFor('pt'), 'pt'), `Vídeo, 1 segundo: ${q}`);
  assert.equal(H.rowA11yLabel(e({ dur: 65 }), q, tFor('pt'), 'pt'), `Vídeo, 1 minuto e 5 segundos: ${q}`);
  assert.equal(H.rowA11yLabel(e({ dur: 120 }), q, tFor('pt'), 'pt'), `Vídeo, 2 minutos: ${q}`);
  assert.equal(H.rowA11yLabel(e(), 'How does it work?', tFor('en'), 'en'), 'Video, 42 seconds: How does it work?');
  assert.equal(H.rowA11yLabel(e({ dur: 61 }), 'Q', tFor('en'), 'en'), 'Video, 1 minute and 1 second: Q');
  for (const l of ['es', 'fr', 'de', 'it']) {
    const label = H.rowA11yLabel(e(), 'Q', tFor(l), l);
    assert.match(label, /42/, l);
    assert.match(label, /Q$/, l);
    assert.doesNotMatch(label, /\{|\}|howto_/, `${l}: every placeholder filled`);
  }
});

test('HV-9: the events carry only the question id, the language and the variant', () => {
  assert.deepEqual(H.eventProps('recon_calc', e({ variant: 'fold-open' })), { question: 'recon_calc', lang: 'pt', variant: 'fold-open' });
  assert.deepEqual(Object.keys(H.eventProps('q', e({ minApp: '1.0' }))).sort(), ['lang', 'question', 'variant']);
  const { HEALTH_KEYS } = require('../lib/analyticsEvent.js');
  for (const k of Object.keys(H.eventProps('q', e()))) assert.ok(!HEALTH_KEYS.includes(k), `${k} is not dropped by lib/analyticsEvent`);
});

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } };
}
const good = JSON.stringify({ v: 1, videos: { q: [e()] } });

test('HV-6: a good manifest is saved on the phone (the last good copy)', async () => {
  const store = memStore();
  const s = H.createManifestStore({ store, fetchManifest: async () => ({ status: 200, text: good }) });
  assert.equal(await s.cached(), null);
  const r = await s.refresh();
  assert.equal(r.reachable, true);
  assert.equal(r.manifest.videos.q.length, 1);
  assert.equal((await s.cached()).videos.q.length, 1);
  assert.ok(store.m.has(H.MANIFEST_KEY));
});

test('HV-5 / HV-6: offline, a timeout or a server error → the last good copy, not reachable', async () => {
  const store = memStore({ [H.MANIFEST_KEY]: good });
  const offline = H.createManifestStore({ store, fetchManifest: async () => { throw new Error('Network request failed'); } });
  let r = await offline.refresh();
  assert.equal(r.reachable, false);
  assert.equal(r.manifest.videos.q.length, 1);
  const slow = H.createManifestStore({ store, timeoutMs: 20, fetchManifest: () => new Promise(() => {}) });
  r = await slow.refresh();
  assert.equal(r.reachable, false, 'a fetch that never answers stops at the timeout');
  const down = H.createManifestStore({ store, fetchManifest: async () => ({ status: 503, text: '' }) });
  r = await down.refresh();
  assert.equal(r.reachable, false);
  assert.ok(r.manifest);
  const none = H.createManifestStore({ store: memStore(), fetchManifest: async () => { throw new Error('offline'); } });
  r = await none.refresh();
  assert.deepEqual(r, { manifest: null, reachable: false }, 'offline with nothing on the phone: no row at all');
});

test('HV-6: a broken file shows no row and keeps the last good copy; a missing file removes it', async () => {
  const store = memStore({ [H.MANIFEST_KEY]: good });
  const broken = H.createManifestStore({ store, fetchManifest: async () => ({ status: 200, text: '{"v":1,"videos":' }) });
  let r = await broken.refresh();
  assert.deepEqual(r, { manifest: null, reachable: true });
  assert.equal(store.m.get(H.MANIFEST_KEY), good, 'the last good copy stays');
  const missing = H.createManifestStore({ store, fetchManifest: async () => ({ status: 400, text: '{"error":"not_found"}' }) });
  r = await missing.refresh();
  assert.deepEqual(r, { manifest: null, reachable: true });
  assert.equal(store.m.has(H.MANIFEST_KEY), false);
});

test('HV-6: a broken copy on the phone reads as nothing', async () => {
  const s = H.createManifestStore({ store: memStore({ [H.MANIFEST_KEY]: 'garbage' }), fetchManifest: async () => { throw new Error('x'); } });
  assert.equal(await s.cached(), null);
});
