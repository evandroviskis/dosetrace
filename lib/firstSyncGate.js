// The session's one first-sync gate (A-122, shared since A-123): opens on the session's first sync /
// import result (success or error) or a known-offline state, closes again during a full import
// (lib/stillGoingGate.js createFirstSyncGate). "Still going?" on Today and the Missed scan
// (lib/doseActions scanMissedDoses: Today, the Dose log, the Settings report) wait on this same
// instance. Created when the module loads, before App starts the sync, so the first pass's result
// is never missed by a screen that mounts later. Never create a second gate.
import { addSyncListener, isOnlineNow } from './sync';
import { createFirstSyncGate } from './stillGoingGate';

export const firstSyncGate = createFirstSyncGate({ addSyncListener, isOnlineNow });
