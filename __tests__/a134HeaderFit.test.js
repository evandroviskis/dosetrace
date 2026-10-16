'use strict';
// A-134 (1) — both-theme render pass 2026-10-16 (iOS sim, appreview): in My Protocols › Edit
// the header clipped its buttons in German and French — "Abbrechen" wrapped onto two lines
// ("Abbrech / en") and "Speichern" / "Enregistrer" were cut to "Speich…" / "Enregi…".
// Cause: the two sides of the header were a fixed 70 pt wide and the title took every other
// point (flex: 1), so a label longer than 70 pt could only wrap or be cut.
// Fix (same look, no redesign): the two sides share the room the title leaves (flex: 1 each,
// so the title stays centred), every label sits on one line and may shrink a little
// (adjustsFontSizeToFit, minimumFontScale 0.8) before it would ever be cut. Save no longer
// swaps to the long "Wird gespeichert..." / "Salvataggio in corso..." text while saving:
// it stays "Save" and dims (the iOS way; same as the food chat's Done, headDoneOff).
// The same fixed-side pattern lived in the paywall header (Back, 76 pt: "Indietro" did not
// fit) and the legal reader (a 60 pt spacer against a growing Done, title off-centre).
//
// The width check uses a coarse SF Pro estimate (em per character class) at 375 pt, the
// narrowest iPhone the app supports; it is deliberately generous to the text (wider than
// real glyphs), so a pass here means the label fits on a real phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const MIN_SCALE = 0.8;
const SCREEN = 375;

// em width per character (SF Pro Text advance widths, rounded UP per class); semibold ~4% wider.
// Calibrated on the sim capture: "Enregistrer" 17 pt semibold ≈ 86 pt real, ≈ 89 pt here.
function textWidth(s, size, semibold) {
  let em = 0;
  for (const ch of String(s)) {
    if (ch === ' ') em += 0.26;
    else if (/[.,:;'’!|ijlI]/.test(ch)) em += 0.28;
    else if (/[tf]/.test(ch)) em += 0.33;
    else if (/[r]/.test(ch)) em += 0.37;
    else if (/[s]/.test(ch)) em += 0.47;
    else if (/[mwMW]/.test(ch)) em += 0.84;
    else if (/[A-ZÀ-Ý]/.test(ch)) em += 0.66;
    else if (ch === '…') em += 0.9;
    else em += 0.55;
  }
  return em * size * (semibold ? 1.04 : 1);
}

// The style object literal named `name` inside a makeStyles block.
function styleOf(src, name) {
  const m = src.match(new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`));
  assert.ok(m, `style ${name} exists`);
  return m[1];
}

// A header row: two sides sharing the room the title leaves, each label on one line.
function assertSharedSides(src, file, sideStyle, titleStyle) {
  const side = styleOf(src, sideStyle);
  assert.doesNotMatch(side, /(^|[^A-Za-z])width:/, `${file} ${sideStyle}: no fixed width`);
  assert.match(side, /flex: 1\b/, `${file} ${sideStyle}: the sides share the room (flex: 1)`);
  const title = styleOf(src, titleStyle);
  assert.doesNotMatch(title, /(^|[^A-Za-z])flex: 1\b/, `${file} ${titleStyle}: the title no longer takes every other point`);
}

function assertFitsText(jsx, label) {
  assert.match(jsx, /numberOfLines=\{1\}/, `${label}: one line`);
  assert.match(jsx, /adjustsFontSizeToFit/, `${label}: shrinks before it is cut`);
  const m = jsx.match(/minimumFontScale=\{([0-9.]+)\}/);
  assert.ok(m, `${label}: minimumFontScale`);
  assert.ok(Number(m[1]) >= MIN_SCALE, `${label}: minimumFontScale >= ${MIN_SCALE}`);
}

// Room each side gets at 375 pt (flex: 1 sides with a minWidth, the title at its own width):
// the row minus its padding and gaps minus the title, never under the side's minWidth. The
// title must then fit what is left at the same minimum scale.
function sideRoom(title, padding, gap, minSide, titleLines = 1) {
  const inner = SCREEN - 2 * padding - 2 * gap;
  const titleW = textWidth(title, 17, true);
  const room = Math.max(minSide, (inner - titleW) / 2);
  // a title allowed two lines needs half its width per line (+ one word of slack)
  const need = titleLines === 1 ? titleW * MIN_SCALE : (titleW / 2 + 17 * 3) * MIN_SCALE;
  assert.ok(need <= inner - 2 * room, `title "${title}" needs ${need.toFixed(0)} pt, has ${(inner - 2 * room).toFixed(0)} pt`);
  return room;
}
const minWidthOf = (src, name) => Number(styleOf(src, name).match(/minWidth: (\d+)/)[1]);

test('A-134 (1): Edit protocol header — Cancel and Save each on one full line, in all 6 languages', () => {
  const src = read('screens/ProtocolsScreen.js');
  assertSharedSides(src, 'ProtocolsScreen', 'wnavSide', 'wnavTitle');
  const head = src.slice(src.indexOf('<View style={s.wnav}>'), src.indexOf('<View style={s.prog}>'));
  assert.ok(head.length > 0);
  const cancel = head.match(/<Text style=\{s\.wnavCancel\}[^>]*>/);
  assert.ok(cancel, 'Cancel text');
  assertFitsText(cancel[0], 'Cancel');
  const save = head.match(/<Text style=\{\[s\.wnavSave[^>]*>/);
  assert.ok(save, 'Save text');
  assertFitsText(save[0], 'Save');
  assert.doesNotMatch(head, /t\('protocols_saving'\)/, 'Save keeps its label while saving (dims instead)');
  assert.match(head, /saving && s\.wnavSaveOff/);
  assert.match(styleOf(src, 'wnavSaveOff'), /color: c\.ink3/, 'the dim colour is a theme token');
  const pad = Number(styleOf(src, 'wnav').match(/paddingHorizontal: (\d+)/)[1]);
  const gap = Number((styleOf(src, 'wnav').match(/gap: (\d+)/) || [0, 0])[1]);
  for (const l of LANGS) {
    const room = sideRoom(tr[l].protocols_edit_protocol, pad, gap, minWidthOf(src, 'wnavSide'));
    for (const [key, semibold] of [['cancel', false], ['save', true]]) {
      const w = textWidth(tr[l][key], 17, semibold) * MIN_SCALE;
      assert.ok(w <= room, `${l} ${key} "${tr[l][key]}" needs ${w.toFixed(0)} pt, side has ${room.toFixed(0)} pt`);
    }
  }
});

test('A-134 (1): the same header pattern — paywall Back and legal reader Done fit in all 6 languages', () => {
  const pay = read('screens/PaywallScreen.js');
  assertSharedSides(pay, 'PaywallScreen', 'navSide', 'navTitle');
  const back = pay.match(/<Text style=\{s\.navBackText\}[^>]*>/);
  assert.ok(back);
  assertFitsText(back[0], 'Paywall Back');
  const legal = read('components/LegalModal.js');
  assertSharedSides(legal, 'LegalModal', 'navSide', 'modalTitle');
  assert.doesNotMatch(legal, /width: 60/, 'no fixed 60 pt spacer');
  // the legal titles are long ("Medizinischer Haftungsausschluss"): up to two lines, never cut
  assert.match(legal, /<Text style=\{s\.modalTitle\} numberOfLines=\{2\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>/);
  const done = legal.match(/<Text style=\{s\.modalClose\}[^>]*>/);
  assert.ok(done);
  assertFitsText(done[0], 'Legal Done');
  for (const l of LANGS) {
    // Paywall: 16 pt row padding, chevron 10 + gap 6 before the word.
    const pRoom = sideRoom(tr[l].paywall_title, 16, 8, minWidthOf(pay, 'navSide'));
    const bw = textWidth(tr[l].back, 17, false) * MIN_SCALE + 16;
    assert.ok(bw <= pRoom, `${l} Back "${tr[l].back}" needs ${bw.toFixed(0)} pt, side has ${pRoom.toFixed(0)} pt`);
    for (const titleKey of ['settings_terms', 'settings_privacy_policy', 'settings_disclaimer']) {
      const lRoom = sideRoom(tr[l][titleKey], 20, 8, minWidthOf(legal, 'navSide'), 2);
      const dw = textWidth(tr[l].done, 17, true) * MIN_SCALE;
      assert.ok(dw <= lRoom, `${l} Done "${tr[l].done}" with ${titleKey}: needs ${dw.toFixed(0)} pt, side has ${lRoom.toFixed(0)} pt`);
    }
  }
});
