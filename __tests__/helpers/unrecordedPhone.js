'use strict';
// The real unrecorded-period write path (lib/doseActions saveUnrecordedAnswer / undoUnrecordedAnswer) and
// the real lib/database.js writes it calls, over the in-memory SQLite of the sync harness. Used by the
// UP-17 / UP-35 / UP-36 tests.
const { loadFn } = require('./extractFn');
const PE = require('../../lib/protocolEnd');
const UP = require('../../lib/unrecordedPeriod');
const { vialCapacity } = require('../../lib/supplyLow');

function unrecordedPhone(db, { now } = {}) {
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, PE });
  const dbFns = {
    getProtocolById: fromDb('getProtocolById'),
    getActiveVials: fromDb('getActiveVials'),
    getVialById: fromDb('getVialById'),
    insertDoseLog: fromDb('insertDoseLog'),
    updateDoseLog: fromDb('updateDoseLog'),
    deleteDoseLog: fromDb('deleteDoseLog'),
    updateVial: fromDb('updateVial'),
    updateProtocol: fromDb('updateProtocol'),
    getLogsSince: fromDb('getLogsSince'),
    withImmediateTransaction: fromDb('withImmediateTransaction'),
  };
  const DateFixed = now ? class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } } : Date;
  const deps = { ...dbFns, ...UP, vialCapacity, Date: DateFixed };
  const save = loadFn('lib/doseActions.js', 'export function saveUnrecordedAnswer(', 'saveUnrecordedAnswer', deps);
  const undo = loadFn('lib/doseActions.js', 'export function undoUnrecordedAnswer(', 'undoUnrecordedAnswer', deps);
  const logs = (userId) => dbFns.getLogsSince(userId, '2000-01-01T00:00:00.000Z');
  return { save, undo, logs, db: dbFns };
}

module.exports = { unrecordedPhone };
