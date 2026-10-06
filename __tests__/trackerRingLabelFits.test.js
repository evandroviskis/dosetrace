'use strict';
// 2026-10-06 (store screenshots, French): the big ring's caption "aujourd'hui" ran into the ring's
// arc — the caption box was the whole 132 pt ring, not its 88 pt opening. The captions now live in
// the opening (22 pt in from each side) and shrink to fit instead of overlapping the arc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../screens/components/TodayTracker.js'), 'utf8');

test('the big ring captions sit inside the ring opening', () => {
  const m = /bigIn:\s*\{([^}]*)\}/.exec(src);
  assert.ok(m, 'bigIn style');
  assert.match(m[1], /paddingHorizontal:\s*22\b/, '(132 - 88) / 2 = 22 pt in from each side');
});

test('the big ring captions shrink to fit instead of overlapping', () => {
  for (const tag of ['<Text style={s.bigCap} numberOfLines={1}', '<Text style={s.bigCapDay} numberOfLines={1}']) {
    const i = src.indexOf(tag);
    assert.ok(i >= 0, tag);
    const line = src.slice(i, src.indexOf('>', i + tag.length) + 1);
    assert.match(line, /adjustsFontSizeToFit/, tag);
    assert.match(line, /minimumFontScale=\{0\.7\}/, tag);
  }
});

test("each caption line is capped at the opening width where it sits (58 pt)", () => {
  for (const k of ["bigCap", "bigCapDay"]) {
    const m = new RegExp(k + ":\\s*\\{([^}]*)\\}").exec(src);
    assert.ok(m, k);
    assert.match(m[1], /maxWidth:\s*58\b/, k);
  }
});
