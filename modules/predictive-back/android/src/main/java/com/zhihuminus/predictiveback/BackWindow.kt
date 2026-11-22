package com.zhihuminus.predictiveback

import android.content.Intent
import android.os.Build
import android.view.RoundedCorner
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.window.SystemOnBackInvokedCallbacks
import androidx.annotation.RequiresApi
import com.facebook.react.ReactActivity

@RequiresApi(33)
internal class BackWindow(
  val activity: ReactActivity,
  private val nextId: () -> Int,
  private val emit: (Map<String, Any>) -> Unit,
) : ViewTreeObserver.OnGlobalLayoutListener {
  private val decor = activity.window.decorView
  private val dispatcher = activity.onBackInvokedDispatcher
  private var target: String? = null
  private var hasBackHandler = false
  private var allowHomePreview = false
  private var keyboardVisible = imeVisible()
  private var configured = false
  private var callback: OnBackInvokedCallback? = null
  private var cancelGesture: (() -> Unit)? = null

  init {
    decor.viewTreeObserver.addOnGlobalLayoutListener(this)
  }

  fun configure(routeKey: String?, enabled: Boolean, previewHome: Boolean) {
    if (configured && target == routeKey && hasBackHandler == enabled && allowHomePreview == previewHome) return
    configured = true
    target = routeKey
    hasBackHandler = enabled
    allowHomePreview = previewHome
    updateRegistration()
  }

  override fun onGlobalLayout() {
    val visible = imeVisible()
    if (keyboardVisible != visible) {
      keyboardVisible = visible
      updateRegistration()
    }
  }

  fun close() {
    decor.viewTreeObserver.removeOnGlobalLayoutListener(this)
    unregister()
  }

  private fun unregister() {
    val registered = callback
    callback = null
    cancelGesture?.invoke()
    cancelGesture = null
    registered?.let(dispatcher::unregisterOnBackInvokedCallback)
  }

  private fun imeVisible() = decor.rootWindowInsets?.isVisible(WindowInsets.Type.ime()) == true

  private fun readCornerRadii(): Map<String, Double> {
    val manager = activity.windowManager
    val window = manager.currentWindowMetrics
    val insets = decor.rootWindowInsets ?: window.windowInsets
    val bounds = window.bounds
    // Some devices omit corners from the view insets. The display is a valid
    // fallback only when this window covers it; an inset or split window can
    // legitimately have square corners even on a rounded display.
    val display = if (!activity.isInMultiWindowMode && bounds == manager.maximumWindowMetrics.bounds &&
      decor.width == bounds.width() && decor.height == bounds.height()) decor.display else null
    val density = decor.resources.displayMetrics.density.toDouble()
    fun radius(position: Int): Double {
      val corner = insets.getRoundedCorner(position) ?: display?.getRoundedCorner(position)
      return (corner?.radius ?: 0) / density
    }
    return mapOf(
      "topLeft" to radius(RoundedCorner.POSITION_TOP_LEFT),
      "topRight" to radius(RoundedCorner.POSITION_TOP_RIGHT),
      "bottomRight" to radius(RoundedCorner.POSITION_BOTTOM_RIGHT),
      "bottomLeft" to radius(RoundedCorner.POSITION_BOTTOM_LEFT),
    )
  }

  private fun updateRegistration() {
    unregister()
    keyboardVisible = imeVisible()
    if (keyboardVisible || !configured) return
    val routeKey = target
    val previewHome = allowHomePreview && routeKey == null && !hasBackHandler && Build.VERSION.SDK_INT >= 34
    callback = when {
      routeKey != null && Build.VERSION.SDK_INT >= 34 ->
        PageGesture(routeKey, nextId, emit, ::readCornerRadii, ::forwardToReact) { callback === it }.also {
          cancelGesture = it::onBackCancelled
        }
      // RN 0.88 installs its own hardwareBackPress callback starting on API 36.
      !previewHome && Build.VERSION.SDK_INT < 36 ->
        OnBackInvokedCallback(::forwardToReact)
      previewHome && Build.VERSION.SDK_INT >= 36 &&
        activity.isTaskRoot && activity.intent?.action == Intent.ACTION_MAIN &&
        activity.intent?.hasCategory(Intent.CATEGORY_LAUNCHER) == true ->
        // This platform callback preserves Android's back-to-home animation despite
        // ReactActivity's permanently enabled callback. A deep link may have a
        // different destination, so leave its normal task navigation intact.
        SystemOnBackInvokedCallbacks.moveTaskToBackCallback(activity)
      else -> null
    }
    callback?.let { dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, it) }
  }

  private fun forwardToReact() {
    // Run the usual Expo/RN back handlers, including WebViews and unsaved drafts.
    if (!activity.reactActivityDelegate.onBackPressed()) activity.invokeDefaultOnBackPressed()
  }
}

@RequiresApi(34)
private class PageGesture(
  private val routeKey: String,
  private val nextId: () -> Int,
  private val emit: (Map<String, Any>) -> Unit,
  private val readCornerRadii: () -> Map<String, Double>,
  private val ordinaryBack: () -> Unit,
  private val isCurrent: (PageGesture) -> Boolean,
) : OnBackAnimationCallback {
  private var id: Int? = null
  private var edge = "left"

  override fun onBackStarted(event: BackEvent) {
    if (!isCurrent(this)) return
    onBackCancelled()
    if (event.swipeEdge != BackEvent.EDGE_LEFT && event.swipeEdge != BackEvent.EDGE_RIGHT) return
    id = nextId()
    edge = if (event.swipeEdge == BackEvent.EDGE_RIGHT) "right" else "left"
    report("start", event.progress, readCornerRadii())
  }

  override fun onBackProgressed(event: BackEvent) {
    if (isCurrent(this)) report("progress", event.progress)
  }

  override fun onBackCancelled() {
    report("cancel", 0f)
    id = null
  }

  override fun onBackInvoked() {
    if (!isCurrent(this)) return
    // Three-button navigation and accessibility actions can invoke without a gesture.
    if (id == null) ordinaryBack() else report("commit", 1f)
    id = null
  }

  private fun report(phase: String, progress: Float, corners: Map<String, Double>? = null) {
    val gestureId = id ?: return
    val event = mutableMapOf<String, Any>(
      "phase" to phase,
      "routeKey" to routeKey,
      "gestureId" to gestureId,
      "edge" to edge,
      "progress" to progress.toDouble(),
    )
    if (corners != null) event["cornerRadii"] = corners
    emit(event)
  }
}
