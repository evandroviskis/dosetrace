'use strict';
// Loads the app's own lib/localDate.js (authored as ESM for Metro) under plain
// Node, the same way __tests__/i18n.test.js loads translations: strip `export`
// and evaluate. The file has no imports, so this is safe and self-contained.
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../lib/localDate.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+function/g, 'function') + '\nmodule.exports = { localISO, localDaysAgoISO };')(mod, mod.exports);

module.exports = { localISOForTest: mod.exports.localISO, localDaysAgoISOForTest: mod.exports.localDaysAgoISO };
