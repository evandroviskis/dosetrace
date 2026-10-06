// Store screenshot slides, style A (founder 2026-10-06): app ground #DDE0DB, headline in
// Geist Bold with one cobalt phrase, subline, the real capture below with rounded corners.
// Input: store/screenshots/raw/<lang>/0N_*.png (1320×2868 simulator captures) and
// store/screenshots/captions.json. Output: store/screenshots/apple/<lang>/ (1320×2868, the
// 6.9" size) and store/screenshots/play/<lang>/ (1440×2868, under Play's 2:1 limit).
// Usage: node scripts/store-slides.cjs [lang ...]   (headless Chrome renders each slide)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'store/screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT = (w) => 'file://' + path.join(ROOT, `node_modules/@expo-google-fonts/geist/${w}/Geist_${w}.ttf`);
const STORES = { apple: 1320, play: 1440 };
const H = 2868;

const captions = JSON.parse(fs.readFileSync(path.join(SHOTS, 'captions.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const headline = (h) => esc(h).replace(/\*([^*]+)\*/g, '<em>$1</em>');

function slideHtml({ W, lang, cap, raw, last }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face{font-family:G;font-weight:400;src:url("${FONT('400Regular')}")}
@font-face{font-family:G;font-weight:700;src:url("${FONT('700Bold')}")}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#DDE0DB;font-family:G,sans-serif}
#head{position:absolute;left:${Math.round(W * 0.085)}px;right:${Math.round(W * 0.085)}px;top:150px;height:450px;display:flex;flex-direction:column;justify-content:center;gap:30px}
h1{margin:0;font-weight:700;color:#111315;font-size:104px;line-height:1.05;letter-spacing:-0.025em;text-wrap:balance}
h1 em{font-style:normal;color:#2350D8}
p{margin:0;font-weight:400;color:#454A4F;font-size:46px;line-height:1.3;text-wrap:pretty}
.langs{color:#2350D8;font-size:34px;letter-spacing:0.01em}
img{position:absolute;width:1000px;left:${(W - 1000) / 2}px;top:650px;border-radius:92px;box-shadow:0 36px 90px rgba(17,19,21,.20),0 0 0 2px rgba(17,19,21,.06)}
</style></head><body>
<div id="head"><h1>${headline(cap.h)}</h1><p>${esc(cap.s)}</p>${last ? `<p class="langs">${esc(captions.langs_line)}</p>` : ''}</div>
<img src="file://${raw}">
<script>
// Shrink headline, then subline, until the caption block fits its 450 px box (never clipped).
document.fonts.ready.then(() => {
  const head = document.getElementById('head'), h1 = head.querySelector('h1'), ps = head.querySelectorAll('p');
  const fits = () => head.scrollHeight <= 450 && h1.scrollWidth <= h1.clientWidth;
  let hs = 104, ss = 46;
  while (!fits() && hs > 72) { hs -= 2; h1.style.fontSize = hs + 'px'; }
  while (!fits() && ss > 34) { ss -= 1; ps.forEach((p) => { if (!p.classList.contains('langs')) p.style.fontSize = ss + 'px'; }); }
  document.body.dataset.fit = fits() ? 'ok' : 'overflow';
  document.title = hs + '/' + ss + '/' + document.body.dataset.fit;
});
</script></body></html>`;
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'pt', 'es', 'fr', 'de', 'it'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-slides-'));
const report = [];
for (const lang of langs) {
  const caps = captions[lang];
  if (!caps) throw new Error('no captions for ' + lang);
  caps.forEach((cap, i) => {
    const raw = path.join(SHOTS, 'raw', lang, cap.file + '.png');
    if (!fs.existsSync(raw)) throw new Error('missing ' + raw);
    for (const [store, W] of Object.entries(STORES)) {
      const html = path.join(tmp, `${store}-${lang}-${cap.file}.html`);
      fs.writeFileSync(html, slideHtml({ W, lang, cap, raw, last: i === caps.length - 1 }));
      const outDir = path.join(SHOTS, store, lang);
      fs.mkdirSync(outDir, { recursive: true });
      const out = path.join(outDir, cap.file + '.png');
      execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        `--window-size=${W},${H}`, '--virtual-time-budget=3000', '--allow-file-access-from-files',
        `--screenshot=${out}`, 'file://' + html], { stdio: 'ignore' });
      // The fit result, read back from the same page (dump-dom shows the title the script set).
      const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--force-device-scale-factor=1',
        `--window-size=${W},${H}`, '--virtual-time-budget=3000', '--allow-file-access-from-files',
        '--dump-dom', 'file://' + html], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const fit = (/<title>([^<]*)<\/title>/.exec(dom) || [])[1] || '?';
      report.push(`${store}/${lang}/${cap.file} ${fit}`);
    }
  });
}
console.log(report.join('\n'));
