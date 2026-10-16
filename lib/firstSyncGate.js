// The session's one first-sync gate (A-122, shared since A-123): opens on the session's first sync /
// import result (success or error) or a known-offline state, closes again during a full import and
// on return to the foreground until that sync's result — which it asks for itself, opening after a cap if no pass starts (council fix 1) (A-123 F4; lib/stillGoingGate.js createFirstSyncGate). "Still going?" on Today and the Missed scan
// (lib/doseActions scanMissedDoses: Today, the Dose log, the Settings report) wait on this same
// instance. Created when the module loads, before App starts the sync, so the first pass's result
// is never missed by a screen that mounts later. Never create a second gate.
import { AppState } from 'react-native';
import { addSyncListener, isOnlineNow, requestSync } from './sync';
import { createFirstSyncGate } from './stillGoingGate';

// Registered when this module loads — before any screen's own AppState listener (Today's
// refreshIfNewDay), so the gate is closed before the new-day scan asks it.
const addForegroundListener = (fn) => AppState.addEventListener('change', (state) => { if (state === 'active') fn(); });

export const firstSyncGate = createFirstSyncGate({ addSyncListener, isOnlineNow, addForegroundListener, requestSync });
