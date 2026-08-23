#!/usr/bin/env node
/**
 * DoseTrace — App Store / Play screenshot compositor.
 *
 * This NEVER draws fake app content. It takes a REAL screenshot captured from
 * the running app (per SCREENSHOT_CAPTURE_PLAYBOOK.md) and places it, unaltered,
 * inside a colored frame with an honest caption, at the exact store resolution.
 *
 * Usage:
 *   1. Capture real screenshots from the Simulator (Cmd+S) into store_assets/real/
 *      named 01-body-hub.png … 06-recon.png (or edit SHOTS below).
 *   2. node store_assets/compose_screenshots.mjs
 *   3. Framed PNGs land in store_assets/final/.
 *
 * Raw, uncomposited screenshots are also perfectly acceptable to upload — this
 * step is optional polish.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = join(HERE, 'real');
const OUT = join(HERE, 'final');
const TMP = join(HERE, '.tmp');

// Target device frame (iPhone 6.7"). Also valid for Play phone uploads.
const W = 1320;
const H = 2868;

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Map each REAL capture → its honest caption + background gradient.
// Captions must not imply the app interprets, recommends, or diagnoses.
const SHOTS = [
  { file: '01-body-hub.png', caption: 'Your health records, in one private place', bg: ['#1E5FA8', '#123E6E'] },
  { file: '05-today.png', caption: 'Your day, and your routines, at a glance', bg: ['#3457A6', '#1E356B'] },
  { file: '06-recon.png', caption: 'Syringe math, straight from your numbers', bg: ['#5B4BB0', '#382C7A'] },
  { file: '07-bodymap.png', caption: 'A body map to note where you injected', bg: ['#2A6FB0', '#164A7A'] },
  { file: '08-rtu.png', caption: 'Track ready-to-use vials too', bg: ['#127C63', '#0B4A3C'] },
  { file: '09-oral.png', caption: 'Serving math from the amounts you enter', bg: ['#B9741C', '#7A4A0E'] },
  { file: '02-lab-chart.png', caption: 'See your own lab values over time', bg: ['#127C63', '#0B4A3C'] },
  { file: '03-vaccines.png', caption: 'Keep your vaccines and boosters organized', bg: ['#2A6FB0', '#164A7A'] },
  { file: '04-calculator.png', caption: 'Estimate your daily calories & protein', bg: ['#B9741C', '#7A4A0E'] },
];

function pageHTML({ caption, bg, dataUri }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${W}px; height: ${H}px; }
    .frame {
      width: ${W}px; height: ${H}px;
      background: linear-gradient(160deg, ${bg[0]} 0%, ${bg[1]} 100%);
      display: flex; flex-direction: column; align-items: center;
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    }
    .caption {
      color: #fff; font-size: 74px; font-weight: 800; line-height: 1.12;
      letter-spacing: -1px; text-align: center;
      padding: 118px 90px 0; max-width: ${W}px;
    }
    .shotWrap { flex: 1; display: flex; align-items: flex-end; justify-content: center; padding: 70px 0 0; }
    .shot {
      width: 84%;
      border-radius: 44px;
      box-shadow: 0 40px 90px rgba(0,0,0,0.38);
      border: 1px solid rgba(255,255,255,0.14);
    }
  </style></head><body>
    <div class="frame">
      <div class="caption">${caption}</div>
      <div class="shotWrap"><img class="shot" src="${dataUri}" /></div>
    </div>
  </body></html>`;
}

function main() {
  if (!existsSync(REAL)) {
    console.error(`Missing ${REAL}. Capture real screenshots there first (see SCREENSHOT_CAPTURE_PLAYBOOK.md).`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  let done = 0;
  for (const shot of SHOTS) {
    const src = join(REAL, shot.file);
    if (!existsSync(src)) {
      console.warn(`skip: ${shot.file} not found in real/`);
      continue;
    }
    const dataUri = 'data:image/png;base64,' + readFileSync(src).toString('base64');
    const html = pageHTML({ ...shot, dataUri });
    const htmlPath = join(TMP, shot.file.replace(/\.png$/, '.html'));
    writeFileSync(htmlPath, html);
    const outPath = join(OUT, shot.file);
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--window-size=${W},${H}`,
      `--screenshot=${outPath}`, `file://${htmlPath}`,
    ], { stdio: 'ignore' });
    console.log(`✓ ${shot.file} → final/`);
    done++;
  }
  console.log(done ? `\nDone: ${done} framed screenshot(s) in store_assets/final/` : '\nNo screenshots found in store_assets/real/.');
}

main();
