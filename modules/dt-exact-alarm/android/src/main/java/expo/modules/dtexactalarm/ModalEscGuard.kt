package expo.modules.dtexactalarm

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.inspector.WindowInspector
import androidx.activity.ComponentDialog
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import com.facebook.react.views.modal.ReactModalHostView
import java.util.Collections
import java.util.WeakHashMap

// A-195 (root cause on the S25 and the Fold, Android 17, 2026-10-31): a hardware Esc (Bluetooth
// keyboard, DeX) closed the New protocol wizard without the discard question. Android 17 dismisses a
// dialog on the Esc key-DOWN; React Native 0.81's Modal only catches Back/Esc on key-UP
// (ReactModalHostView.kt), so the dialog was gone before JS was asked and showModal stayed true.
// React Native ships prebuilt, so its listener cannot be patched: each Modal dialog's key listener is
// replaced here with the same one plus the Esc key-down consumed. Esc/Back key-up go through the
// dialog's back dispatcher, where React Native's own callback calls onRequestClose.
// The Modal's host view is not in the activity's view tree (Fabric), so the dialogs are found among
// the app's windows (WindowInspector, Android 10+; older Android closes on the Esc key-up, which
// React Native already handles) whenever a window loses focus to a new one: the activity's, and
// every Modal dialog's, so a Modal opened over another Modal is found too.
object ModalEscGuard {
  private val patched = Collections.newSetFromMap(WeakHashMap<ComponentDialog, Boolean>())
  private val watched = Collections.newSetFromMap(WeakHashMap<View, Boolean>())

  fun install(activity: Activity) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    activity.runOnUiThread { watch(activity, activity.window?.decorView ?: return@runOnUiThread) }
  }

  private fun watch(activity: Activity, root: View) {
    if (!watched.add(root)) return
    root.viewTreeObserver.addOnWindowFocusChangeListener(
      ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
        if (!hasFocus) root.post { scan(activity) }
      })
  }

  private fun scan(activity: Activity) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    try {
      for (root in WindowInspector.getGlobalWindowViews()) {
        val dialog = root.findViewTreeOnBackPressedDispatcherOwner() as? ComponentDialog ?: continue
        if (!holdsModal(root)) continue
        watch(activity, root)
        patch(activity, dialog)
      }
    } catch (e: Throwable) {
      Log.w("DtExactAlarm", "Esc guard scan failed: ${e.message}")
    }
  }

  private fun holdsModal(view: View): Boolean = when (view) {
    is ReactModalHostView.DialogRootViewGroup -> true
    is ViewGroup -> (0 until view.childCount).any { holdsModal(view.getChildAt(it)) }
    else -> false
  }

  private fun patch(activity: Activity, dialog: ComponentDialog) {
    if (!patched.add(dialog)) return
    dialog.setOnKeyListener { _, keyCode, event ->
      if (keyCode == KeyEvent.KEYCODE_ESCAPE && event.action == KeyEvent.ACTION_DOWN) return@setOnKeyListener true
      if (event.action != KeyEvent.ACTION_UP) return@setOnKeyListener false
      if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
        dialog.onBackPressedDispatcher.onBackPressed()
        true
      } else {
        activity.onKeyUp(keyCode, event)
      }
    }
  }
}
