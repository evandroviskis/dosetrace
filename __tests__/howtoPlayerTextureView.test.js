'use strict';
// Fold 2026-11-26 (inner screen, book layout): the player's time ran (0:01 → 0:03 of 0:12) but the
// picture stayed empty — only the dark frame showed. On Android expo-video draws into a SurfaceView by
// default, a separate layer that ignores the rounded, clipped frame around it. A TextureView draws
// inside the view tree, so the frame, its corners and the screens around it all show the video.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'HowtoPlayer.js'), 'utf8');

test('HV-3: the video is drawn in a TextureView on Android, inside the rounded frame', () => {
  const view = src.match(/<VideoView[^>]*\/>/);
  assert.ok(view, 'the player renders a VideoView');
  assert.match(view[0], /surfaceType="textureView"/);
});
