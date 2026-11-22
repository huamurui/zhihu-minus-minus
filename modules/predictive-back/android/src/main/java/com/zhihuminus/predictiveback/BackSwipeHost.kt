package com.zhihuminus.predictiveback

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.accessibility.AccessibilityManager
import android.widget.TextView
import androidx.annotation.RequiresApi
import com.facebook.react.uimanager.events.NativeGestureUtil
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

internal interface EdgeSwipe {
  fun beginApp(view: BackSwipeHost, fromRight: Boolean): Boolean
  fun moveApp(progress: Float)
  fun endApp(accept: Boolean)
}

/** An app-owned horizontal drag just inside Android's gesture-navigation area. */
class BackSwipeHost(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val accessibility = context.getSystemService(AccessibilityManager::class.java)
  private var swipe: EdgeSwipe? = null
  private var velocity: VelocityTracker? = null
  private var startX = 0f
  private var startY = 0f
  private var startTime = 0L
  private var fromRight = false
  private var claimed = false

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (Build.VERSION.SDK_INT < 34) return super.dispatchTouchEvent(event)
    val action = event.actionMasked
    if (action == MotionEvent.ACTION_DOWN) {
      cancelTouch()
      prepare(event)
    }
    val gesture = swipe
    if (gesture != null) {
      if (event.pointerCount != 1 || action == MotionEvent.ACTION_CANCEL) {
        gesture.endApp(false)
        swipe = null
      } else {
        // Local coordinates change as the host follows the drag. Use screen
        // coordinates for both distance and fling velocity throughout.
        val raw = MotionEvent.obtainNoHistory(event)
        raw.setLocation(event.rawX, event.rawY)
        velocity?.addMovement(raw)
        raw.recycle()
        if (action == MotionEvent.ACTION_MOVE) drag(event, gesture)
      }
    }
    val handled = super.dispatchTouchEvent(event)
    val intercepted = claimed
    if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
      if (claimed && action == MotionEvent.ACTION_UP) swipe?.endApp(shouldCommit(event))
      resetTouch(event)
    }
    return handled || intercepted
  }

  @RequiresApi(34)
  private fun prepare(event: MotionEvent) {
    if (!hasWindowFocus() || accessibility?.isTouchExplorationEnabled == true) return
    if ((findFocus() as? TextView)?.hasSelection() == true) return
    val insets = rootWindowInsets?.getInsets(WindowInsets.Type.systemGestures()) ?: return
    val density = resources.displayMetrics.density
    // Leave Android's reported edge untouched. A zero horizontal inset
    // identifies a side without system gesture navigation (e.g. three buttons).
    fun inBand(x: Float, inset: Int): Boolean =
      inset > 0 && x >= inset && x <= minOf(width * 0.2f, maxOf(56f * density, inset + 28f * density))
    fromRight = when {
      inBand(event.x, insets.left) -> false
      inBand(width - event.x, insets.right) -> true
      else -> return
    }
    val module = appContext.registry.getModule("ZhihuPredictiveBack") as? PredictiveBackModule
    swipe = module?.edgeSwipeFor(this) ?: return
    startX = event.rawX
    startY = event.rawY
    startTime = event.eventTime
    velocity = VelocityTracker.obtain()
  }

  private fun distance(event: MotionEvent) =
    if (fromRight) startX - event.rawX else event.rawX - startX

  private fun drag(event: MotionEvent, gesture: EdgeSwipe) {
    val dx = distance(event)
    val dy = abs(event.rawY - startY)
    if (claimed && dy > maxOf(2f * touchSlop, abs(dx) * 1.6f)) {
      gesture.endApp(false)
      swipe = null
      return
    }
    if (!claimed) {
      if (event.eventTime - startTime >= ViewConfiguration.getLongPressTimeout() ||
        dx < -touchSlop || (dy > touchSlop && dy >= abs(dx))
      ) {
        swipe = null
        return
      }
      if (dx < touchSlop || dx < dy * 1.4f) return
      if (!gesture.beginApp(this, fromRight)) {
        swipe = null
        return
      }
      claimed = true
      // A nested pager may already have requested exclusive input on DOWN.
      // Override that request only after a horizontal drag qualified in the band.
      super.requestDisallowInterceptTouchEvent(false)
      parent?.requestDisallowInterceptTouchEvent(true)
      NativeGestureUtil.notifyNativeGestureStarted(this, event)
    }
    gesture.moveApp((dx / width.coerceAtLeast(1)).coerceIn(0f, 1f))
  }

  private fun shouldCommit(event: MotionEvent): Boolean {
    velocity?.computeCurrentVelocity(1000)
    val vx = (velocity?.xVelocity ?: 0f) * if (fromRight) -1f else 1f
    val fling = 900f * resources.displayMetrics.density
    val dx = distance(event)
    if (dx <= 2 * touchSlop || vx < -fling) return false
    return dx >= width * 0.3f || (vx >= fling && vx > abs(velocity?.yVelocity ?: 0f))
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean =
    claimed || super.onInterceptTouchEvent(event)

  override fun onTouchEvent(event: MotionEvent): Boolean =
    claimed || swipe != null || super.onTouchEvent(event)

  // Fabric/Yoga positions the header and body independently. LinearLayout's
  // default placement would overwrite those frames when the Android view relayouts.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) = Unit

  private fun resetTouch(event: MotionEvent) {
    if (claimed) {
      NativeGestureUtil.notifyNativeGestureEnded(this, event)
      parent?.requestDisallowInterceptTouchEvent(false)
    }
    velocity?.recycle()
    velocity = null
    swipe = null
    claimed = false
  }

  private fun cancelTouch() {
    if (!claimed && swipe == null && velocity == null) return
    swipe?.endApp(false)
    val now = SystemClock.uptimeMillis()
    val cancel = MotionEvent.obtain(startTime, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0)
    resetTouch(cancel)
    cancel.recycle()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (!hasWindowFocus) cancelTouch()
  }

  override fun onDetachedFromWindow() {
    cancelTouch()
    super.onDetachedFromWindow()
  }
}
