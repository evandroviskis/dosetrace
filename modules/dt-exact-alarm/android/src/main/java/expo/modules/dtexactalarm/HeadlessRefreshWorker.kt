package expo.modules.dtexactalarm

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

// A-197 fix 2 (Fold 2026-10-28): the Android reminder refresh ran through expo-background-task, which
// hands the run to JS by an event over a weak, silent reference; with the app alive in the background
// the event was lost (native "Executing task", no JS) and, when it did arrive, React Native kept JS
// timers paused, so the first network answer never came back. A replaced phone kept every reminder.
// This worker runs the same JS refresh (AppRegistry task TASK_KEY, lib/backgroundTasks) as a React
// Native headless JS task: in the live React context when its instance is up (a headless task
// un-pauses the timers), otherwise after starting React headless. Never in the foreground (the app's
// own resync covers it, and the takeover screens must not race a background verdict). It waits for
// the task to finish, with a cap.
class HeadlessRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  companion object {
    private const val TAG = "DtHeadlessRefresh"
    const val TASK_KEY = "DoseTraceReminderRefresh"
    private const val PERIODIC_NAME = "DOSETRACE_REMINDER_REFRESH"
    private const val TASK_TIMEOUT_MS = 120_000L
    private const val START_TIMEOUT_MS = 60_000L

    // The running task, ended from JS (headlessRefreshDone): React Native's own "task finished" call
    // never reaches native in this app (NativeHeadlessJsTaskSupport is null in JS; Fold 2026-10-30),
    // so without it every run held the worker for the full timeout.
    @Volatile private var pending: CompletableDeferred<Unit>? = null

    fun notifyDone() { pending?.complete(Unit) }

    // Every intervalMinutes (Android's minimum is 15) with internet. UPDATE applies a changed spec to
    // installed phones without moving the next run.
    fun schedule(context: Context, intervalMinutes: Long) {
      val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      val request = PeriodicWorkRequest.Builder(HeadlessRefreshWorker::class.java, maxOf(15L, intervalMinutes), TimeUnit.MINUTES)
        .setConstraints(constraints)
        .build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    // One run now (after an update or a reboot, A-111): no network needed (stored session, local data).
    fun runOnce(context: Context, uniqueName: String) {
      val request = OneTimeWorkRequest.Builder(HeadlessRefreshWorker::class.java).build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniqueWork(uniqueName, ExistingWorkPolicy.REPLACE, request)
    }
  }

  private val main = Handler(Looper.getMainLooper())

  override suspend fun doWork(): Result {
    val app = applicationContext as? ReactApplication ?: return Result.failure()
    val host = app.reactHost ?: run { Log.w(TAG, "no ReactHost"); return Result.failure() }

    // A context whose JS instance is up: the current one, or the one React finishes starting.
    // (A context exists before its bundle loads; a task started on it never reaches JS.)
    val ready = CompletableDeferred<ReactContext>()
    val instanceListener = object : ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) { ready.complete(context) }
    }
    main.post {
      host.addReactInstanceEventListener(instanceListener)
      val c = host.currentReactContext
      if (c != null && c.hasActiveReactInstance()) ready.complete(c) else host.start()
    }
    val context = withTimeoutOrNull(START_TIMEOUT_MS) { ready.await() }
    main.post { host.removeReactInstanceEventListener(instanceListener) }
    if (context == null) { Log.w(TAG, "React did not start"); return Result.retry() }

    val finished = CompletableDeferred<Unit>()
    pending = finished
    var taskId = -1
    var tasks: HeadlessJsTaskContext? = null
    val listener = object : HeadlessJsTaskEventListener {
      override fun onHeadlessJsTaskStart(id: Int) {}
      override fun onHeadlessJsTaskFinish(id: Int) { if (id == taskId) finished.complete(Unit) }
    }
    main.post {
      try {
        // getInstance on the UI thread: its map is not synchronized, and a second instance would never
        // un-pause the timers.
        val t = HeadlessJsTaskContext.getInstance(context)
        tasks = t
        t.addTaskEventListener(listener)
        // Not allowed in the foreground: startTask throws there and the run ends at once.
        taskId = t.startTask(HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), TASK_TIMEOUT_MS, false))
        Log.i(TAG, "started headless task $taskId")
      } catch (e: Throwable) {
        Log.i(TAG, "headless task not started: ${e.message}")
        finished.complete(Unit)
      }
    }
    val done = withTimeoutOrNull(TASK_TIMEOUT_MS + 10_000L) { finished.await() } != null
    if (pending === finished) pending = null
    main.post {
      tasks?.let { t ->
        t.removeTaskEventListener(listener)
        if (taskId >= 0 && t.isTaskRunning(taskId)) t.finishTask(taskId)
      }
    }
    Log.i(TAG, "headless task $taskId ${if (done) "finished" else "timed out"}")
    return Result.success()
  }
}
