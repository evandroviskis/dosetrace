package expo.modules.dtexactalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager

// A-111 (founder's Fold 2026-10-07): a Play update clears the app's alarms and expo-notifications'
// own re-arm kept only 8 of 245 — every dose reminder was gone until the app was opened. After an
// update (and a reboot) this runs expo-background-task's worker once, now: it executes the registered
// JS reminder refresh headless (lib/backgroundTasks), which rebuilds every reminder from the app's
// data. Scheduling is non-destructive, so running it next to expo's re-arm is harmless.
class RefreshOnUpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_MY_PACKAGE_REPLACED && action != Intent.ACTION_BOOT_COMPLETED) return
    try {
      @Suppress("UNCHECKED_CAST")
      val worker = Class.forName("expo.modules.backgroundtask.BackgroundTaskWork") as Class<out ListenableWorker>
      val data = Data.Builder().putString("appScopeKey", context.packageName).build()
      val request = OneTimeWorkRequest.Builder(worker).setInputData(data).build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniqueWork("DOSETRACE_REFRESH_AFTER_UPDATE", ExistingWorkPolicy.REPLACE, request)
    } catch (e: Throwable) {
      Log.w("DtExactAlarm", "reminder refresh after $action not started: ${e.message}")
    }
  }
}
