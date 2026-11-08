'use strict';
// Android crash, S25 2026-11-06 (2 of 5 switches of the projection +7d → +30d): "Attempt to invoke virtual method
// 'boolean android.graphics.Bitmap.isRecycled()' on a null object reference" at Canvas.drawBitmap inside
// com.horcrux.svg GroupView.drawGroup (react-native-svg 15.12.1), under SvgView.drawOutput → root group → group.
// A react-native-svg GroupView whose opacity is not 1 draws its children into a full-size layer bitmap and then
// draws that bitmap (GroupView.java drawGroup: "if (mOpacity != 1)" creates mLayerBitmap at the start, draws it
// at the end); when the opacity is 1 at the start and not 1 at the end, mLayerBitmap was never created and the
// draw crashes. Upstream patched only the symptom (a null check, software-mansion/react-native-svg#2694, 15.13.0).
// The curve animated the opacity of three groups (the gridlines dip 1 → 0 → 1 on every horizon change; the Now
// dots and the readout marker fade in): exactly the groups drawn at that moment. Fix in JS: no Svg group ever
// gets an opacity. Each faded layer is its own Svg inside an Animated.View whose opacity animates (a plain
// Android view alpha, no react-native-svg layer bitmap); the order of the layers on screen is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const CURVE = fs.readFileSync(path.join(ROOT, 'screens', 'SerumCurveScreen.js'), 'utf8');

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn));
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
const jsxName = (n) => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : '');

function svgFiles() {
  const out = [];
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.js$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8');
        if (src.includes("from 'react-native-svg'")) out.push([path.relative(ROOT, p), src]);
      }
    }
  };
  visit(path.join(ROOT, 'screens'));
  visit(path.join(ROOT, 'components'));
  return out;
}

test('react-native-svg: no group anywhere in the app is animated (an animated G opacity is the Android layer-bitmap crash)', () => {
  for (const [file, src] of svgFiles()) {
    assert.doesNotMatch(src, /createAnimatedComponent\(\s*G\s*\)/, `${file}: animated G`);
  }
});

test('curve: no Svg group (G) is drawn at all, so none can carry an opacity', () => {
  const ast = parse(CURVE, { sourceType: 'module', plugins: ['jsx'] });
  const svgImports = [];
  const elements = new Set();
  walk(ast, (n) => {
    if (n.type === 'ImportDeclaration' && n.source.value === 'react-native-svg') {
      for (const s of n.specifiers) svgImports.push(s.imported ? s.imported.name : 'default');
    }
    if (n.type === 'JSXOpeningElement') elements.add(jsxName(n.name));
  });
  assert.ok(!svgImports.includes('G'), `G imported: ${svgImports.join(', ')}`);
  assert.ok(!elements.has('G') && !elements.has('AG'), 'a G element is drawn');
});

test('curve: the gridlines, the readout marker and the Now dots fade as Animated.View layers, in the same order', () => {
  // the three fades are view styles (useAnimatedStyle), never Svg animated props
  for (const name of ['gridFade', 'readoutFade', 'markerFade']) {
    assert.match(CURVE, new RegExp(`const ${name} = useAnimatedStyle\\(`), `${name} is a view style`);
    assert.match(CURVE, new RegExp(`<Animated\\.View pointerEvents="none" style=\\{\\[s\\.chartLayer, ${name}\\]\\}>`), `${name} wraps its own Svg`);
  }
  assert.doesNotMatch(CURVE, /gridProps|markerProps|readoutGProps/, 'the group animated props are gone');
  // stacking order (back to front) as before: zone, grid, Now line, readout, curves + opening moment, Now dots
  const at = (re) => { const m = CURVE.search(re); assert.ok(m >= 0, String(re)); return m; };
  const order = [
    at(/<ARect y=\{PLOT_TOP\}/),
    at(/style=\{\[s\.chartLayer, gridFade\]\}/),
    at(/<ALine stroke=\{colors\.ink\} strokeWidth=\{1\.4\} animatedProps=\{nowLineProps\}/),
    at(/style=\{\[s\.chartLayer, readoutFade\]\}/),
    at(/<CurveLine\b/),
    at(/style=\{\[s\.chartLayer, markerFade\]\}/),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'layer order unchanged');
  // every layer covers the chart exactly
  assert.match(CURVE, /chartLayer: \{ position: 'absolute', left: 0, top: 0 \}/);
  assert.match(CURVE, /<View onTouchStart=\{finishIntro\} style=\{\{ width: chartWidth, height: chartHeight \}\}>/);
});
