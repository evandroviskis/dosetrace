'use strict';
// Council regulatory review (1.3.1): the AI protocol assistant checked the AI consent only when it
// opened (ProtocolsScreen openAssistant), so withdrawing it with the Settings "AI use" switch while
// the window was open did not stop that session. Now every send to the AI (a typed answer the phone
// cannot read itself, the label photo) checks the consent first, as the food chat does per send;
// withdrawn → the same DoseTrace consent sheet, and nothing is sent unless the user agrees again.
// Runs the REAL send / photo (screens/components/ProtocolAssistant.js) and the REAL
// assistantConsent (screens/ProtocolsScreen.js) with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');

const ASSIST = 'screens/components/ProtocolAssistant.js';
const SCREEN = 'screens/ProtocolsScreen.js';
const t = (k) => k;

// The screen side: the consent record + the sheet the user answers.
function screen({ consent = true } = {}) {
  const st = { consent, sheets: [], granted: 0 };
  const assistantConsent = loadFn(SCREEN, 'function assistantConsent(', 'assistantConsent', {
    t,
    hasAIConsent: async () => st.consent,
    grantAIConsent: async () => { st.granted++; st.consent = true; },
    setWizSheet: (cfg) => st.sheets.push(cfg),
    Linking: { openURL: async () => {} },
    AI_PRIVACY_URL: 'https://dosetrace.io/privacy-policy',
  });
  return { st, assistantConsent };
}

// The window side: one typed answer the phone cannot read itself → it goes to the AI.
function windowWith(askConsent, { typed = 'about twice a week, mornings', localResult = null } = {}) {
  const out = { understood: [], started: 0, scanned: 0, texts: [], busy: [], convs: [] };
  const conv = { step: 'schedule', messages: [] };
  const deps = {
    text: typed, conv, busy: false, language: 'en',
    A: {
      textStep: () => 'schedule',
      localUnderstand: () => localResult,
      answerText: (c) => c,
      notice: (c) => c,
      labelRead: (c) => c,
    },
    setText: (v) => out.texts.push(v),
    setConv: (v) => out.convs.push(v),
    setBusy: (v) => out.busy.push(v),
    session: { current: {
      ensureStarted: async () => { out.started++; return { data: {} }; },
      understand: async (step, typedText) => { out.understood.push(typedText); return { data: { result: {} } }; },
    } },
    startFailed: () => {},
    assistantErrorNotice: () => ({ key: 'x' }),
    formatDay: (x) => x,
    now: () => new Date('2026-10-21T10:00:00Z'),
    scanLabel: async () => { out.scanned++; return { vial: {} }; },
  };
  deps.consentNow = loadFn(ASSIST, 'async function consentNow(', 'consentNow', { askConsent, asking: { current: false } });
  const send = loadFn(ASSIST, 'async function send(', 'send', deps);
  const photo = loadFn(ASSIST, 'async function photo(', 'photo', deps);
  return { out, send, photo };
}

test('AP consent: withdrawn while the assistant is open → the next send shows the consent sheet and sends nothing', async () => {
  const sc = screen({ consent: true }); // given when the window opened
  const w = windowWith(sc.assistantConsent);
  await w.send();
  assert.equal(w.out.understood.length, 1, 'with consent the answer goes');
  sc.st.consent = false; // Settings › Data & privacy › AI use switched off
  const p = w.send();
  await new Promise((r) => setImmediate(r));
  assert.equal(sc.st.sheets.length, 1, 'the consent sheet is shown');
  assert.equal(sc.st.sheets[0].title, 'ai_consent_title');
  assert.equal(sc.st.sheets[0].body, 'ai_consent_body');
  sc.st.sheets[0].buttons.find((b) => b.label === 'cancel').onPress();
  await p;
  assert.equal(w.out.understood.length, 1, 'nothing more went to the AI');
  assert.equal(w.out.started, 1, 'no new start either');
  assert.deepEqual(w.out.texts, [''], 'the declined answer stays typed in the box');
});

test('AP consent: Agree on the sheet grants the consent again and the answer goes', async () => {
  const sc = screen({ consent: false });
  const w = windowWith(sc.assistantConsent);
  const p = w.send();
  await new Promise((r) => setImmediate(r));
  const agree = sc.st.sheets[0].buttons.find((b) => b.label === 'ai_consent_agree');
  await agree.onPress();
  await p;
  assert.equal(sc.st.granted, 1);
  assert.equal(w.out.understood.length, 1);
});

test('AP consent: closing the sheet without a button (tap outside, Android back) sends nothing', async () => {
  const sc = screen({ consent: false });
  const w = windowWith(sc.assistantConsent);
  const p = w.send();
  await new Promise((r) => setImmediate(r));
  sc.st.sheets[0].onDismiss();
  await p;
  assert.equal(w.out.understood.length, 0);
});

test('AP consent: the label photo checks the consent too', async () => {
  const sc = screen({ consent: false });
  const w = windowWith(sc.assistantConsent);
  const p = w.photo(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(sc.st.sheets.length, 1);
  sc.st.sheets[0].buttons.find((b) => b.label === 'cancel').onPress();
  await p;
  assert.equal(w.out.scanned, 0, 'no photo taken or sent');
  assert.equal(w.out.started, 0);
});

test('AP consent: an answer the phone reads itself (a plain number) never asks — nothing goes to the AI', async () => {
  let asked = 0;
  const w = windowWith(async () => { asked++; return false; }, { typed: '20 mg', localResult: { amount: 20 } });
  await w.send();
  assert.equal(asked, 0);
  assert.equal(w.out.understood.length, 0);
  assert.equal(w.out.convs.length, 1, 'answered on the phone');
});

test('AP consent: without a consent check the window sends nothing (fails closed)', async () => {
  const w = windowWith(undefined);
  await w.send();
  await w.photo(false);
  assert.equal(w.out.understood.length, 0);
  assert.equal(w.out.scanned, 0);
});

test('AP consent: My Protocols hands the per-send check to the assistant', () => {
  const src = read(SCREEN);
  const tag = src.slice(src.indexOf('<ProtocolAssistant'), src.indexOf('/>', src.indexOf('<ProtocolAssistant')));
  assert.match(tag, /askConsent=\{assistantConsent\}/);
});
