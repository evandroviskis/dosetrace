package expo.modules.dtexactalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

// A-111 (founder's Fold 2026-10-07): a Play update clears the app's alarms and expo-notifications'
// own re-arm kept only 8 of 245 — every dose reminder was gone until the app was opened. After an
// update (and a reboot) this runs the reminder refresh once, now (A-197: as a headless JS task,
// HeadlessRefreshWorker; it was expo-background-task's worker before), which rebuilds every reminder
// from the app's data. Scheduling is non-destructive, so running it next to expo's re-arm is harmless.
class RefreshOnUpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_MY_PACKAGE_REPLACED && action != Intent.ACTION_BOOT_COMPLETED) return
    try {
      // A-197 fix 2: the refresh runs as a React Native headless JS task (HeadlessRefreshWorker).
      HeadlessRefreshWorker.runOnce(context, "DOSETRACE_REFRESH_AFTER_UPDATE")
      // The periodic run too: a phone nobody opens (a replaced one) must keep checking (review 6).
      HeadlessRefreshWorker.schedule(context, 360)
    } catch (e: Throwable) {
      Log.w("DtExactAlarm", "reminder refresh after $action not started: ${e.message}")
    }
  }
}
