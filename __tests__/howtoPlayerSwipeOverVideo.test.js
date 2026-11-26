'use strict';
// iPhone simulator 2026-11-26 (EAS simulator build 8d97797f): a swipe down over the video did not close
// the player (HV-4: the swipe closes it like ×). Measured with an on-screen log: the raw touch events
// (start, every move, end) all reach the player's root view, but the PanResponder never ran a single
// move check — it drops every move whose timestamp equals the one it already counted, and the moves
// it got carried the same timestamp. The player now reads the swipe from where the finger went down
// and where it lifted (raw touch events, no PanResponder), so no timestamp can swallow it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('../lib/howtoVideos');
const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'HowtoPlayer.js'), 'utf8');

test('HV-4: a swipe down or to the right past 80 points closes; a tap or a short drag does not', () => {
  assert.equal(H.swipeCloses({ dx: 0, dy: 250 }), true); // down over the video
  assert.equal(H.swipeCloses({ dx: 240, dy: 3 }), true); // to the right
  assert.equal(H.swipeCloses({ dx: 0, dy: 81 }), true);
  assert.equal(H.swipeCloses({ dx: 0, dy: 80 }), false);
  assert.equal(H.swipeCloses({ dx: 2, dy: 1 }), false); // a tap on × or pause
  assert.equal(H.swipeCloses({ dx: 0, dy: -250 }), false); // up
  assert.equal(H.swipeCloses({ dx: -240, dy: 0 }), false); // to the left
  assert.equal(H.swipeCloses({ dx: 200, dy: 210 }), true); // diagonal down-right
  assert.equal(H.swipeCloses({ dx: NaN, dy: undefined }), false);
});

test('HV-4: the player reads the swipe from raw touches on its root, with no PanResponder', () => {
  assert.doesNotMatch(src, /PanResponder\.create|import [^;]*PanResponder/);
  const root = src.slice(src.indexOf('<View style={[s.root'), src.indexOf('<View style={s.top}>'));
  assert.match(root, /onTouchStart=\{/);
  assert.match(root, /onTouchEnd=\{/);
  assert.match(root, /onTouchCancel=\{/);
  assert.match(src, /swipeCloses\(/);
});

test('HV-4: a second finger or a cancelled touch never closes the player', () => {
  assert.match(src, /touches\.length !== 1/);
  const cancel = src.slice(src.indexOf('onTouchCancel='), src.indexOf('onTouchCancel=') + 80);
  assert.doesNotMatch(cancel, /onClose/);
});
