'use strict';
// Runs ONE function from an app source file under plain node, with its imports replaced by the
// test's fakes. The function is cut out by its header and the matching closing brace (strings,
// template literals and comments are skipped while counting), so the test runs the real code,
// not a copy of it. Used by the app-map link tests (docs/review/app-map.md).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// The source from `header` (e.g. 'export async function closeFoodDay(') to its closing brace.
function sliceBlock(src, header) {
  const start = src.indexOf(header);
  if (start < 0) throw new Error(`not found: ${header}`);
  let i = src.indexOf('{', start + header.length - 1);
  // Skip a destructured parameter list: the body brace follows the closing ")" of the params.
  const paren = src.indexOf('(', start);
  if (paren >= 0 && paren < i) {
    let depth = 0, j = paren;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) break; }
    }
    i = src.indexOf('{', j);
  }
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); continue; }
    if (ch === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k) + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      for (k++; k < src.length && src[k] !== ch; k++) if (src[k] === '\\') k++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error(`unbalanced: ${header}`);
}

// lib/database.js's own module-level helpers that its dose / protocol writes call (AD-95: the dose a
// Taken row was taken at, the dose history of a protocol edit) — in scope by default, so every test
// that runs those writes runs the real stamping; a test may still pass its own.
function databaseDefaults() {
  const { stampForTaken, nextDoseHistory } = require('../../lib/doseStamp');
  const src = fs.readFileSync(path.join(ROOT, 'lib/database.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const takenStamp = new Function('stampForTaken', `${sliceBlock(src, 'function takenStamp(')}\nreturn takenStamp;`)(stampForTaken);
  // eslint-disable-next-line no-new-func
  const takenAtCurrentDose = new Function('stampForTaken', `${sliceBlock(src, 'function takenAtCurrentDose(')}\nreturn takenAtCurrentDose;`)(stampForTaken);
  return { stampForTaken, nextDoseHistory, takenStamp, takenAtCurrentDose };
}

// Returns the named function, evaluated with `deps` in scope.
function loadFn(file, header, name, deps = {}) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const body = sliceBlock(src, header).replace(/^export\s+/, '');
  if (file === 'lib/database.js' && /takenStamp\(|nextDoseHistory\(|takenAtCurrentDose\(/.test(body)) deps = { ...databaseDefaults(), ...deps };
  const names = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `${body}\nreturn ${name};`)(...names.map((n) => deps[n]));
}

function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

module.exports = { sliceBlock, loadFn, read };
