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
// This worker runs the same JS refresh (AppRegistry task TASK_KEY, index.js) as a React Native
// headless JS task: in the live React context when there is one (a headless task un-pauses the
// timers), otherwise after starting React headless. It waits for the task to finish, with a cap.
class HeadlessRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  companion object {
    private const val TAG = "DtHeadlessRefresh"
    const val TASK_KEY = "DoseTraceReminderRefresh"
    private const val PERIODIC_NAME = "DOSETRACE_REMINDER_REFRESH"
    private const val TASK_TIMEOUT_MS = 120_000L
    private const val START_TIMEOUT_MS = 60_000L

    // Every intervalMinutes (Android's minimum is 15) with internet; KEEP: registering again at every
    // app open never moves the next run.
    fun schedule(context: Context, intervalMinutes: Long) {
      val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
      val request = PeriodicWorkRequest.Builder(HeadlessRefreshWorker::class.java, maxOf(15L, intervalMinutes), TimeUnit.MINUTES)
        .setConstraints(constraints)
        .build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
      WorkManager.getInstance(context.applicationContext).cancelUniqueWork(PERIODIC_NAME)
    }

    // One run now (after an update or a reboot, A-111).
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

    val context = host.currentReactContext ?: withTimeoutOrNull(START_TIMEOUT_MS) {
      val ready = CompletableDeferred<ReactContext>()
      val listener = object : ReactInstanceEventListener {
        override fun onReactContextInitialized(context: ReactContext) { ready.complete(context) }
      }
      main.post {
        host.addReactInstanceEventListener(listener)
        host.currentReactContext?.let { ready.complete(it) } ?: host.start()
      }
      try { ready.await() } finally { main.post { host.removeReactInstanceEventListener(listener) } }
    } ?: run { Log.w(TAG, "React did not start"); return Result.retry() }

    val finished = CompletableDeferred<Unit>()
    var taskId = -1
    val tasks = HeadlessJsTaskContext.getInstance(context)
    val listener = object : HeadlessJsTaskEventListener {
      override fun onHeadlessJsTaskStart(id: Int) {}
      override fun onHeadlessJsTaskFinish(id: Int) { if (id == taskId) finished.complete(Unit) }
    }
    main.post {
      try {
        tasks.addTaskEventListener(listener)
        // Allowed in the foreground: the refresh is then the app's normal resync.
        taskId = tasks.startTask(HeadlessJsTaskConfig(TASK_KEY, Arguments.createMap(), TASK_TIMEOUT_MS, true))
        Log.i(TAG, "started headless task $taskId")
      } catch (e: Throwable) {
        Log.w(TAG, "headless task not started: ${e.message}")
        finished.complete(Unit)
      }
    }
    val done = withTimeoutOrNull(TASK_TIMEOUT_MS + 10_000L) { finished.await() } != null
    main.post { tasks.removeTaskEventListener(listener) }
    Log.i(TAG, "headless task $taskId ${if (done) "finished" else "timed out"}")
    return Result.success()
  }
}
