'use strict';
// DT Council, test build 3 (2026-10-17), item 5 — confirmed in code: Today's pendingVialRef held ONE
// waiting vial prompt (queueVialPrompt overwrote it), so two recon vials finishing inside one Undo
// window (take A empties its vial, take B empties another before A's bar closes) lost A's prompt:
// A's protocol never asked "Protocol finished / Log new vial". Now a queue (lib/undoBar
// enqueueVialPrompt / nextVialPrompt): each vial gets its prompt, one after another; an undone or
// deleted take drops only its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const undoBar = require('../lib/undoBar');

const A = { protocol: { id: 1, name: 'BPC' }, logId: 11 };
const B = { protocol: { id: 2, name: 'TB' }, logId: 12 };
const none = () => false;

test('TB3-5: two vials finishing in one Undo window → both prompts, A then B', () => {
  const { enqueueVialPrompt, nextVialPrompt } = undoBar;
  let q = enqueueVialPrompt([], A);
  q = enqueueVialPrompt(q, B);
  assert.equal(q.length, 2, 'A is kept when B is queued');
  let r = nextVialPrompt({ queue: q, undoShowing: true, focused: true, promptShowing: false, undone: none, deleted: none });
  assert.equal(r.action, 'wait', 'behind the Undo bar');
  r = nextVialPrompt({ queue: q, undoShowing: false, focused: true, promptShowing: false, undone: none, deleted: none });
  assert.equal(r.action, 'show');
  assert.equal(r.item, A);
  q = r.queue;
  r = nextVialPrompt({ queue: q, undoShowing: false, focused: true, promptShowing: true, undone: none, deleted: none });
  assert.equal(r.action, 'wait', 'never over the prompt already open');
  r = nextVialPrompt({ queue: q, undoShowing: false, focused: true, promptShowing: false, undone: none, deleted: none });
  assert.equal(r.action, 'show');
  assert.equal(r.item, B, 'then B');
  assert.equal(nextVialPrompt({ queue: r.queue, undoShowing: false, focused: true, promptShowing: false, undone: none, deleted: none }).action, 'none');
});

test('TB3-5: Undo of B (or deleting a take) drops only that prompt; all dropped → "drop"', () => {
  const { enqueueVialPrompt, nextVialPrompt } = undoBar;
  const q = enqueueVialPrompt(enqueueVialPrompt([], A), B);
  const r = nextVialPrompt({ queue: q, undoShowing: false, focused: true, promptShowing: false, undone: (id) => id === 12, deleted: none });
  assert.equal(r.action, 'show');
  assert.equal(r.item, A);
  assert.deepEqual(r.queue, []);
  const d = nextVialPrompt({ queue: q, undoShowing: false, focused: true, promptShowing: false, undone: (id) => id === 12, deleted: (id) => id === 11 });
  assert.equal(d.action, 'drop');
  assert.deepEqual(d.queue, []);
  assert.equal(nextVialPrompt({ queue: [], undoShowing: false, focused: false, promptShowing: false, undone: none, deleted: none }).action, 'none');
  assert.equal(nextVialPrompt({ queue: q, undoShowing: false, focused: false, promptShowing: false, undone: none, deleted: none }).action, 'wait', 'never over another tab');
});

test('TB3-5: the same protocol queued twice keeps one prompt (the newer take)', () => {
  const { enqueueVialPrompt } = undoBar;
  const A2 = { protocol: { id: 1, name: 'BPC' }, logId: 13 };
  assert.deepEqual(enqueueVialPrompt(enqueueVialPrompt([], A), A2), [A2]);
});

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
function fnCode(name) {
  let hit = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string' || hit) return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) { hit = src.slice(node.start, node.end); return; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

test('TB3-5: Today queues every waiting prompt and opens the next when one closes', () => {
  assert.match(src, /const pendingVialsRef = useRef\(\[\]\);/);
  assert.ok(!/pendingVialRef\b/.test(src), 'the single slot is gone');
  assert.match(fnCode('queueVialPrompt'), /pendingVialsRef\.current = enqueueVialPrompt\(pendingVialsRef\.current, \{ protocol, logId \}\);/);
  const release = fnCode('releasePendingVial');
  assert.match(release, /nextVialPrompt\(\{/);
  assert.match(release, /promptShowing: vialPromptShownRef\.current/);
  assert.match(release, /showVialPromptFor\(next\.item\.protocol, 0\)/);
  const close = fnCode('closeVialPrompt');
  assert.match(close, /vialPromptShownRef\.current = false;/);
  assert.match(close, /if \(pendingVialsRef\.current\.length\) \{ setTimeout\(releasePendingVial, 450\); return; \}/, 'the next vial after this one has faded out');
  assert.match(fnCode('showVialPromptFor'), /vialPromptShownRef\.current = true;/);
  const drop = fnCode('dropPendingVial');
  assert.match(drop, /pendingVialsRef\.current = pendingVialsRef\.current\.filter\(\(p\) => p\.logId !== logId\);/);
});
