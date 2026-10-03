'use strict';
// Pre-build pass 2026-10-03, m1 (shot 34): "Build it with AI" → typed "BPC-157" → Close before
// answering "powder, ready to use or pill?" → the form showed "Saved as your own label — not from
// the list": the name came back without its compound id, because the list match only ran once
// the type was known. A name that matches the catalog keeps its compound id on the way back to
// the form (matched on the form's type, else on the one catalog entry with that exact name);
// a name the user chose to keep as their own, or a name not on the list, stays their own label.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/protocolAssistant');
const { newProtocolForm } = require('../lib/protocolForm');

const NOW = new Date(2026, 9, 3, 10, 0);
const CATALOG = {
  recon: [{ key: 'lyo_bpc_157', label: 'BPC-157' }, { key: 'lyo_klow', label: 'KLOW' }],
  rtu: [{ key: 'rtu_testosterone_cypionate', label: 'Testosterone Cypionate' }],
  oral: [{ key: 'oral_creatine', label: 'Creatine' }],
};
const start = (form) => A.startConversation('build', form || newProtocolForm(NOW), { language: 'en', now: NOW, catalog: CATALOG });
const say = (s, text) => A.answerText(s, text, { intent: 'answer', compound: text });

test('closing before the type question keeps the matched compound id (the form type)', () => {
  const s = say(start(), 'BPC-157');
  assert.equal(s.step, 'form');
  const { form } = A.formFromConversation(s, newProtocolForm(NOW));
  assert.equal(form.name, 'BPC-157');
  assert.equal(form.compoundId, 'lyo_bpc_157');
});

test('a different casing or an alias-free exact name still matches; the label is the list\'s spelling', () => {
  const s = say(start(), 'bpc-157');
  const { form } = A.formFromConversation(s, newProtocolForm(NOW));
  assert.equal(form.compoundId, 'lyo_bpc_157');
  assert.equal(form.name, 'BPC-157');
});

test('a listed name of ANOTHER type is not matched across types (the id must fit the form type)', () => {
  const s = say(start(), 'Creatine');
  const { form } = A.formFromConversation(s, newProtocolForm(NOW)); // form type recon
  assert.equal(form.compoundId, null);
  const oral = A.formFromConversation(say(start(), 'Creatine'), { ...newProtocolForm(NOW), type: 'oral' }).form;
  assert.equal(oral.compoundId, 'oral_creatine');
});

test('a name not on the list stays the user\'s own label', () => {
  const s = say(start(), 'My blend 7');
  const { form } = A.formFromConversation(s, newProtocolForm(NOW));
  assert.equal(form.name, 'My blend 7');
  assert.equal(form.compoundId, null);
});
