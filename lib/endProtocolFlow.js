// The one End as the screens run it (SG-16, docs/specs/still-going-end-date.md): "Encerrar" on
// "Ciclo concluído", "End protocol" in the empty-vial prompt and on the protocol page (A-85 option A,
// docs/design/a85-end-protocol.html). Ended through lib/protocolEnd endNow (dated by the course rules,
// vials off, the app-written Missed rows after the end removed, pending sync), every reminder of it
// cancelled, the delivered banners cleared, its inactivity snooze removed, and the one serialized re-plan
// (syncAllNotifications) run so the morning summary and vial alerts, which name protocols across the
// board, are rebuilt without it (simulator 2026-10-30:
// "Hoje: BPC-157." stayed scheduled after End until the app was opened again). The caller then closes its
// window, reloads and syncs. "Sim, terminou" keeps its own dating (endAtLastDose, DL-87).
// Tested: __tests__/a85EndProtocol.test.js, __tests__/a121EndDateUi.test.js (SG-16).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endProtocolNow } from './database';
import { cancelDoseReminder, dismissDeliveredDoseReminders, syncAllNotifications } from './notifications';

export function endProtocolFully(id) {
  const end = endProtocolNow(id);
  cancelDoseReminder(id).catch(() => {});
  dismissDeliveredDoseReminders(id).catch(() => {});
  AsyncStorage.removeItem(`dosetrace_tx_check_${id}`).catch(() => {});
  syncAllNotifications().catch(() => {});
  return end;
}
