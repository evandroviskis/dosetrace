#!/usr/bin/env node
// A-206 GB-7 (founder 2026-10-31): the iPhone's native tab bar (react-native-bottom-tabs) takes its
// icons as images, not React components. This renders DoseTrace's five tab glyphs (App.js TodayGlyph,
// ProtocolsGlyph, JourneyGlyph, BodyGlyph, SettingsGlyph) to PNG template images: 24 pt, black on
// transparent, @1x/@2x/@3x, outline (tab not selected) and filled (selected). iOS tints them (ink).
// The paths below are App.js's own; __tests__/a206NativeTabs.test.js fails if they drift apart.
//
// Run: node scripts/render-tab-icons.cjs   (uses headless Google Chrome; writes assets/tab-icons/)
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '..', 'assets', 'tab-icons');
const SIZE = 24;
const INK = '#000000'; // template image: iOS replaces the colour with the tint (ink), only alpha counts

const GEAR = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z';

// The same shapes, strokes and fills as App.js (focused = filled).
const GLYPHS = {
  today: (f) => [[3, 3], [14, 3], [3, 14], [14, 14]]
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="7" height="7" rx="2.2" fill="${f ? INK : 'none'}" stroke="${INK}" stroke-width="${f ? 0 : 1.9}"/>`).join(''),
  protocols: (f) => `<path d="M10.5 20.5 20.5 10.5a5.66 5.66 0 0 0-8-8L2.5 12.5a5.66 5.66 0 0 0 8 8Z" stroke="${INK}" stroke-width="${f ? 2.2 : 1.9}" stroke-linejoin="round" fill="${f ? INK : 'none'}" fill-opacity="${f ? 0.16 : 0}"/>`
    + `<path d="M8.5 8.5 15.5 15.5" stroke="${INK}" stroke-width="${f ? 2.2 : 1.9}" stroke-linecap="round"/>`,
  journey: (f) => `<path d="M6 21 V4" stroke="${INK}" stroke-width="${f ? 2.2 : 1.9}" stroke-linecap="round"/>`
    + `<path d="M6 4.5 C9.5 2.8 13 6.2 17.5 4.5 L17.5 10.5 C13 12.2 9.5 8.8 6 10.5 Z" stroke="${INK}" stroke-width="${f ? 2.2 : 1.9}" stroke-linejoin="round" fill="${f ? INK : 'none'}" fill-opacity="${f ? 0.16 : 0}"/>`,
  body: (f) => `<circle cx="12" cy="7.5" r="3.6" fill="${f ? INK : 'none'}" stroke="${INK}" stroke-width="${f ? 0 : 1.9}"/>`
    + `<path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" stroke="${INK}" stroke-width="${f ? 2.2 : 1.9}" stroke-linecap="round" fill="${f ? INK : 'none'}" fill-opacity="${f ? 0.16 : 0}"/>`,
  settings: (f) => `<path d="${GEAR}" stroke="${INK}" stroke-width="${f ? 2 : 1.7}" stroke-linejoin="round" fill="${f ? INK : 'none'}" fill-opacity="${f ? 0.14 : 0}"/>`
    + `<circle cx="12" cy="12" r="3" stroke="${INK}" stroke-width="${f ? 2 : 1.7}" fill="${f ? INK : 'none'}" fill-opacity="${f ? 0.5 : 0}"/>`,
};

function page(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head>`
    + `<body><svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none">${inner}</svg></body></html>`;
}

function render(html, scale, out, tmp) {
  const file = path.join(tmp, 'icon.html');
  fs.writeFileSync(file, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    `--force-device-scale-factor=${scale}`, `--window-size=${SIZE},${SIZE}`,
    '--default-background-color=00000000', `--screenshot=${out}`, `file://${file}`,
  ], { stdio: 'ignore' });
  const png = fs.readFileSync(out);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  if (w !== SIZE * scale || h !== SIZE * scale) throw new Error(`${out}: ${w}x${h}, expected ${SIZE * scale}`);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-tab-icons-'));
  try {
    for (const [name, glyph] of Object.entries(GLYPHS)) {
      for (const filled of [false, true]) {
        const base = filled ? `${name}-filled` : name;
        for (const scale of [1, 2, 3]) {
          const out = path.join(OUT, scale === 1 ? `${base}.png` : `${base}@${scale}x.png`);
          render(page(glyph(filled)), scale, out, tmp);
          console.log('wrote', path.relative(process.cwd(), out));
        }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main();
module.exports = { GLYPHS, GEAR };
