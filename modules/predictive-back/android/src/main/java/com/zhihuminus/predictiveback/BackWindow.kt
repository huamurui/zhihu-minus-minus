package com.zhihuminus.predictiveback

import android.content.Intent
import android.os.Build
import android.view.RoundedCorner
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.window.SystemOnBackInvokedCallbacks
import androidx.annotation.RequiresApi
import com.facebook.react.ReactActivity
import com.facebook.react.uimanager.util.ReactFindViewUtil

@RequiresApi(33)
internal class BackWindow(
  val activity: ReactActivity,
  private val nextId: () -> Int,
  private val emit: (Map<String, Any>) -> Unit,
) : ViewTreeObserver.OnGlobalLayoutListener, ViewTreeObserver.OnWindowFocusChangeListener {
  private val decor = activity.window.decorView
  private val dispatcher = activity.onBackInvokedDispatcher
  private var target: String? = null
  private var hasBackHandler = false
  private var allowHomePreview = false
  private var keyboardVisible = imeVisible()
  private var configured = false
  private var callback: OnBackInvokedCallback? = null
  private var cancelGesture: (() -> Unit)? = null
  private val committed = mutableMapOf<Int, BackSurface>()
  private var refreshedAttributes = false
  private var refreshPosted = false
  private val refreshWindow = Runnable {
    refreshPosted = false
    if (canRefreshWindow()) {
      // On some devices a cold-started window receives no gesture progress
      // until WindowManager syncs its attributes after decor attachment.
      refreshedAttributes = true
      val window = activity.window
      window.attributes = window.attributes
    }
  }

  init {
    decor.viewTreeObserver.addOnGlobalLayoutListener(this)
    decor.viewTreeObserver.addOnWindowFocusChangeListener(this)
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
    } else scheduleWindowRefresh()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    if (hasFocus) scheduleWindowRefresh()
  }

  fun close() {
    decor.removeCallbacks(refreshWindow)
    decor.viewTreeObserver.removeOnGlobalLayoutListener(this)
    decor.viewTreeObserver.removeOnWindowFocusChangeListener(this)
    unregister()
    committed.values.toList().forEach { it.restore() }
  }

  fun releaseSurface(gestureId: Int) {
    committed[gestureId]?.restore()
  }

  private fun unregister() {
    val registered = callback
    callback = null
    cancelGesture?.invoke()
    cancelGesture = null
    registered?.let(dispatcher::unregisterOnBackInvokedCallback)
  }

  private fun canRefreshWindow() =
    !refreshedAttributes && Build.VERSION.SDK_INT >= 34 && callback is PageGesture &&
      decor.isAttachedToWindow && decor.hasWindowFocus() && !imeVisible() &&
      !activity.isFinishing && !activity.isDestroyed

  private fun scheduleWindowRefresh() {
    if (!refreshPosted && canRefreshWindow()) {
      refreshPosted = true
      decor.post(refreshWindow)
    }
  }

  private fun imeVisible() = decor.rootWindowInsets?.isVisible(WindowInsets.Type.ime()) == true

  private fun readCornerRadii(): FloatArray {
    val manager = activity.windowManager
    val window = manager.currentWindowMetrics
    val insets = decor.rootWindowInsets ?: window.windowInsets
    val bounds = window.bounds
    // Some devices omit corners from the view insets. The display is a valid
    // fallback only when this window covers it; an inset or split window can
    // legitimately have square corners even on a rounded display.
    val display = if (!activity.isInMultiWindowMode && bounds == manager.maximumWindowMetrics.bounds &&
      decor.width == bounds.width() && decor.height == bounds.height()) decor.display else null
    fun radius(position: Int): Float {
      val corner = insets.getRoundedCorner(position) ?: display?.getRoundedCorner(position)
      return (corner?.radius ?: 0).toFloat()
    }
    return floatArrayOf(
      radius(RoundedCorner.POSITION_TOP_LEFT),
      radius(RoundedCorner.POSITION_TOP_RIGHT),
      radius(RoundedCorner.POSITION_BOTTOM_RIGHT),
      radius(RoundedCorner.POSITION_BOTTOM_LEFT),
    )
  }

  private fun findSurface(nativeId: String): View? =
    ReactFindViewUtil.findView(decor, nativeId)?.takeIf {
      it.isAttachedToWindow && it.width > 0 && it.height > 0 && it.isShown
    }

  private fun isCommitted(view: View) = committed.values.any { it.owns(view) }

  private fun commit(routeKey: String, id: Int, surface: BackSurface) {
    committed[id] = surface
    var finished = false
    fun finish() {
      if (finished) return
      finished = true
      emit(mapOf("phase" to "finish", "routeKey" to routeKey, "gestureId" to id))
    }
    // Ownership outlives the route callback. Its replacement must not reset
    // the old view before Fabric has finished displaying its exiting layer.
    val recoverUnconsumed = Runnable {
      if (target == routeKey) releaseSurface(id)
    }
    surface.onRelease = {
      decor.removeCallbacks(recoverUnconsumed)
      committed.remove(id)
      finish()
    }
    emit(mapOf("phase" to "commit", "routeKey" to routeKey, "gestureId" to id))
    surface.settle(committing = true) {
      finish()
      // If JS was interrupted before consuming the commit, restore the still
      // active route's pixels without dispatching another navigation action.
      if (surface.attached) decor.postDelayed(recoverUnconsumed, 1000L)
    }
  }

  private fun updateRegistration() {
    unregister()
    keyboardVisible = imeVisible()
    if (keyboardVisible || !configured) return
    val routeKey = target
    val previewHome = allowHomePreview && routeKey == null && !hasBackHandler && Build.VERSION.SDK_INT >= 34
    callback = when {
      routeKey != null && Build.VERSION.SDK_INT >= 34 ->
        PageGesture(routeKey, nextId, ::findSurface, ::isCommitted, ::readCornerRadii, ::commit, ::forwardToReact) { callback === it }.also {
          cancelGesture = it::release
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
    scheduleWindowRefresh()
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
  private val findSurface: (String) -> View?,
  private val isCommitted: (View) -> Boolean,
  private val readCornerRadii: () -> FloatArray,
  private val commit: (String, Int, BackSurface) -> Unit,
  private val ordinaryBack: () -> Unit,
  private val isCurrent: (PageGesture) -> Boolean,
) : OnBackAnimationCallback {
  private var id: Int? = null
  private var surface: BackSurface? = null
  private var ignoredSystemGesture = false
  private var receivedProgress = false
  private fun sourceView() = findSurface("zhihu-back-surface-$routeKey")

  override fun onBackStarted(event: BackEvent) {
    if (!isCurrent(this)) return
    release()
    ignoredSystemGesture = false
    if (event.swipeEdge != BackEvent.EDGE_LEFT && event.swipeEdge != BackEvent.EDGE_RIGHT) return
    val view = sourceView() ?: return
    // Consume this sequence even if its previous commit releases the view before UP.
    if (isCommitted(view)) {
      ignoredSystemGesture = true
      return
    }
    id = nextId()
    val destination = findSurface("zhihu-back-destination-$routeKey")?.takeUnless(isCommitted)
    surface = BackSurface(view, destination, readCornerRadii(), event.swipeEdge == BackEvent.EDGE_RIGHT)
    applyProgress(event.progress)
  }

  override fun onBackProgressed(event: BackEvent) {
    if (isCurrent(this) && id != null) applyProgress(event.progress)
  }

  private fun applyProgress(progress: Float) {
    if (progress > 0f) receivedProgress = true
    surface?.applyProgress(progress)
  }

  override fun onBackCancelled() {
    if (!isCurrent(this)) return
    ignoredSystemGesture = false
    if (id == null) return
    id = null
    surface?.let { it.settle(committing = false, onEnd = it::restore) }
  }

  fun release() {
    id = null
    receivedProgress = false
    surface?.restore()
    surface = null
  }

  override fun onBackInvoked() {
    if (!isCurrent(this)) return
    if (ignoredSystemGesture) {
      ignoredSystemGesture = false
      return
    }
    val source = surface
    val gestureId = id
    // Buttons, accessibility actions and some system gestures supply no progress.
    if (source?.attached != true || gestureId == null || !receivedProgress) {
      release()
      if (sourceView()?.let(isCommitted) != true) ordinaryBack()
      return
    }
    surface = null
    id = null
    commit(routeKey, gestureId, source)
  }
}
