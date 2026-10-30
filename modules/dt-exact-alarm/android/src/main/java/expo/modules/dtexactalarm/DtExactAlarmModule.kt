package expo.modules.dtexactalarm

import android.app.AlarmManager
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// A-106: Android 12+ needs "Alarms & reminders" for exact alarms; without it expo-notifications
// falls back to inexact alarms (up to ~1 h late). Below Android 12 exact alarms need no permission.
class DtExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DtExactAlarm")

    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function true
      val context = appContext.reactContext ?: return@Function true
      val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return@Function true
      am.canScheduleExactAlarms()
    }

    // A-110 RG-3: "Pause app activity if unused" (app hibernation, Android 11+). Exempt = Android will
    // not freeze DoseTrace after months without opening it. Android 10 and older have no hibernation.
    Function("isExemptFromHibernation") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function true
      val context = appContext.reactContext ?: return@Function true
      context.packageManager.isAutoRevokeWhitelisted()
    }

    // A-197 fix 2: the reminder refresh as a React Native headless JS task (HeadlessRefreshWorker).
    Function("scheduleRefresh") { intervalMinutes: Int ->
      val context = appContext.reactContext ?: return@Function false
      HeadlessRefreshWorker.schedule(context, intervalMinutes.toLong())
      true
    }

    // The headless refresh task ended (lib/backgroundTasks): the worker stops waiting.
    Function("headlessRefreshDone") {
      HeadlessRefreshWorker.notifyDone()
    }

    // A-194: the Fold's taskbar area under the tab bar is painted with the window background, which
    // never followed the app theme (a light strip in dark). The app passes its ground colour here.
    Function("setWindowBackground") { color: String ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread { activity.window.setBackgroundDrawable(ColorDrawable(Color.parseColor(color))) }
      true
    }

  }
}
