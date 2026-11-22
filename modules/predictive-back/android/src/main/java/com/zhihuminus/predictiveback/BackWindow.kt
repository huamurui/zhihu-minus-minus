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

  private fun findSurface(routeKey: String): View? =
    ReactFindViewUtil.findView(decor, "zhihu-back-surface-$routeKey")?.takeIf {
      it.isAttachedToWindow && it.width > 0 && it.height > 0 && it.isShown
    }

  private fun isCommitted(view: View) = committed.values.any { it.view === view }

  @RequiresApi(34)
  fun edgeSwipeFor(view: BackSwipeHost): EdgeSwipe? {
    val key = target ?: return null
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) != "zhihu-back-surface-$key") return null
    if (view.windowToken !== decor.windowToken || !view.hasWindowFocus() || imeVisible()) return null
    return callback as? PageGesture
  }

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
    surface.settle(1f, 120) {
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
) : OnBackAnimationCallback, EdgeSwipe {
  private var id: Int? = null
  private var surface: BackSurface? = null
  private var ignoredSystemGesture = false
  private var appTracking = false

  override fun onBackStarted(event: BackEvent) {
    if (!isCurrent(this)) return
    release()
    ignoredSystemGesture = false
    if (event.swipeEdge != BackEvent.EDGE_LEFT && event.swipeEdge != BackEvent.EDGE_RIGHT) return
    val view = findSurface(routeKey) ?: return
    // Consume this sequence even if its previous commit releases the view before UP.
    ignoredSystemGesture = !begin(view, event.swipeEdge == BackEvent.EDGE_RIGHT, false)
    surface?.applyProgress(event.progress)
  }

  private fun begin(view: View, fromRight: Boolean, app: Boolean): Boolean {
    if (isCommitted(view)) return false
    id = nextId()
    appTracking = app
    surface = BackSurface(view, readCornerRadii(), fromRight, followsFinger = app)
    return true
  }

  override fun beginApp(view: BackSwipeHost, fromRight: Boolean): Boolean {
    if (!isCurrent(this) || id != null) return false
    release()
    return begin(view, fromRight, true)
  }

  override fun moveApp(progress: Float) {
    if (appTracking && isCurrent(this)) surface?.applyProgress(progress)
  }

  override fun endApp(accept: Boolean) {
    if (!appTracking || !isCurrent(this)) return
    if (accept && surface?.attached == true) commitGesture() else cancelGesture()
  }

  override fun onBackProgressed(event: BackEvent) {
    if (!isCurrent(this) || id == null || appTracking) return
    surface?.applyProgress(event.progress)
  }

  override fun onBackCancelled() {
    if (!isCurrent(this)) return
    ignoredSystemGesture = false
    if (!appTracking) cancelGesture()
  }

  private fun cancelGesture() {
    if (id == null) return
    id = null
    appTracking = false
    surface?.let { it.settle(0f, 150, it::restore) }
  }

  fun release() {
    id = null
    appTracking = false
    surface?.restore()
    surface = null
  }

  override fun onBackInvoked() {
    if (!isCurrent(this)) return
    if (ignoredSystemGesture) {
      ignoredSystemGesture = false
      return
    }
    // Three-button navigation and accessibility actions can invoke without a gesture.
    if (surface?.attached != true || id == null || appTracking) {
      release()
      if (findSurface(routeKey)?.let(isCommitted) != true) ordinaryBack()
      return
    }
    commitGesture()
  }

  private fun commitGesture() {
    val source = surface ?: return
    val gestureId = id ?: return
    appTracking = false
    surface = null
    id = null
    commit(routeKey, gestureId, source)
  }
}
