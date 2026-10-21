'use strict';
// A-127 UN-3 / UN-4 on Android: Google Play's own in-app update (flexible for the invitation,
// immediate for the required screen). It needs a native module that is NOT installed in this build
// (no new native dependency is added without the founder: see the A-127 report, open question —
// the candidate is the Expo module "expo-in-app-updates"; "sp-react-native-in-app-updates" is the
// alternative). Until one is linked, lib/updateRuntime passes null here and "Atualizar" opens the
// DoseTrace page in the Play Store instead (lib/updateFlow).
//
// The native side is injected as { startFlexible, startImmediate, onDownloaded, completeUpdate }:
//   startFlexible()   → true when Play started the background download (false / throws: not possible
//                       now — not installed from Play, no update visible to Play yet, API missing);
//   startImmediate()  → true when Play took over with its full-screen update;
//   onDownloaded(fn)  → fn() when the flexible download finished (our "Reiniciar" bar); → unsubscribe;
//   completeUpdate()  → installs the downloaded version and restarts the app.

function createPlayUpdate(native) {
  const ok = !!native && typeof native.startFlexible === 'function' && typeof native.startImmediate === 'function';
  const call = async (fn) => {
    try { return (await fn()) === true; } catch { return false; }
  };
  return {
    available: ok,
    startFlexible: () => (ok ? call(native.startFlexible) : Promise.resolve(false)),
    startImmediate: () => (ok ? call(native.startImmediate) : Promise.resolve(false)),
    onDownloaded: (fn) => {
      if (!ok || typeof native.onDownloaded !== 'function') return () => {};
      try { return native.onDownloaded(fn) || (() => {}); } catch { return () => {}; }
    },
    completeUpdate: async () => {
      if (!ok || typeof native.completeUpdate !== 'function') return false;
      try { await native.completeUpdate(); return true; } catch { return false; }
    },
  };
}

module.exports = { createPlayUpdate };
