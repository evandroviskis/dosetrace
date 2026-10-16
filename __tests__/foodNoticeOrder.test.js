'use strict';
// A-133 (2) — store capture 2026-10-16: right after a chip answer the "Updated — …" bubble
// showed BELOW the next question ("Anything to drink?"); after reopening, the order was
// right. Cause: the live thread is buildThread(...) and then the transient notice was pushed
// at the very END, after the question/follow-up/evening prompt that buildThread always puts
// last. A notice answers what the user just did, so it belongs before the app's next prompt:
// withNotice inserts it there, and the live order of everything else equals the rebuilt order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildThread, withNotice } = require('../lib/foodThread');

const at = (day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
const T = '2026-10-16';
const answered = { food: 'Whey genérico', qty: 1, unit: 'batido', kcal: 180, protein_g: 25, carb_g: 8, msg: 'm1', ask: { kind: 'brand', options: ['Whey genérico'] }, asked: true, ask_done: { kind: 'brand', answer: 'Whey genérico', food: 'batido de proteína' } };
const rows = [{ id: 1, source: 'ai', parse_status: 'done', sync_status: 'synced', raw_text: 'un batido de proteína', entry_date: T, created_at: at(T, 9), parsed_items: JSON.stringify([answered]) }];
const question = { id: 'drink', tense: 'past' };
const updated = { type: 'notice', key: 'notice', kind: 'updated', text: '1 × Whey genérico · ~180 kcal' };

test('A-133: the Updated notice comes right after the answer, above the next question', () => {
  const live = withNotice(buildThread(rows, { todayISO: T, question }), updated);
  const types = live.map((x) => x.type);
  assert.deepEqual(types.slice(-3), ['asked', 'notice', 'question']);
});

test('A-133: the live thread keeps the rebuilt (reopened) order of everything else', () => {
  const rebuilt = buildThread(rows, { todayISO: T, question });
  const live = withNotice(buildThread(rows, { todayISO: T, question }), updated);
  assert.deepEqual(live.filter((x) => x.type !== 'notice').map((x) => x.key), rebuilt.map((x) => x.key));
});

test('A-133: the notice also goes above an open follow-up or the evening question', () => {
  const open = [{ ...rows[0], parsed_items: JSON.stringify([{ ...answered, ask_done: undefined }]) }];
  const fu = withNotice(buildThread(open, { todayISO: T }), updated).map((x) => x.type);
  assert.deepEqual(fu.slice(-2), ['notice', 'followup']);
  const ev = withNotice(buildThread(rows, { todayISO: T, question, evening: T }), updated).map((x) => x.type);
  assert.deepEqual(ev.slice(-3), ['notice', 'question', 'evening']);
});

test('A-133: with no prompt open the notice is last; no notice changes nothing', () => {
  const th = buildThread(rows, { todayISO: T });
  assert.equal(withNotice(th, updated).at(-1).type, 'notice');
  assert.deepEqual(withNotice(th, null), th);
});

test('A-133: the chat places its notice with withNotice (no push after the prompt)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
  assert.match(src, /withNotice\(/);
  assert.doesNotMatch(src, /th\.push\(\{ type: 'notice'/);
});
