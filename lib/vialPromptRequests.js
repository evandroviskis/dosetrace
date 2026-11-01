'use strict';
// DV-038 (AD-48): the "All doses logged" new-vial prompt has one owner — Today's queue (it waits for the
// take's Undo window and for Today to be in front). Another screen that finishes a vial (the Dose log's
// Missed → Complete) asks it here. A request made before Today listens is kept and delivered when it
// does. Pure, no React Native import (node --test).
const listeners = new Set();
let waiting = [];

function requestVialPrompt(item) {
  if (!listeners.size) { waiting.push(item); return; }
  for (const fn of listeners) fn(item);
}

function onVialPromptRequest(fn) {
  listeners.add(fn);
  const kept = waiting;
  waiting = [];
  kept.forEach(fn);
  return () => { listeners.delete(fn); };
}

module.exports = { requestVialPrompt, onVialPromptRequest };
