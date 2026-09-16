package com.zhihuminus.pullrefresh

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class PullEvent(
  @Field val offset: Double,
  @Field val progress: Double,
  @Field val dragging: Boolean
) : Record

@SuppressLint("ViewConstructor")
class PullRefreshView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext), NestedScrollingParent3 {
  private val onPull by EventDispatcher<PullEvent>()
  private val onRefreshTriggered by EventDispatcher<Unit>()
  private val nestedScrollingHelper = NestedScrollingParentHelper(this)
  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  @Suppress("DEPRECATION")
  private val vibrator: Vibrator? by lazy {
    context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
  }

  private var thresholdPx = dpToPx(DEFAULT_THRESHOLD_DP)
  private var holdDistancePx = dpToPx(DEFAULT_HOLD_DISTANCE_DP)
  private var maxPullDistancePx = dpToPx(DEFAULT_MAX_PULL_DISTANCE_DP)
  private var pullOffsetPx = 0f
  private var downX = 0f
  private var downY = 0f
  private var interceptingTouch = false
  private var pullEnabled = true
  private var hapticsEnabled = true
  private var refreshing = false
  private var refreshLatched = false
  private var thresholdHapticArmed = true
  private var lastHapticTickAt = 0L
  private var settleAnimator: ValueAnimator? = null

  init {
    orientation = VERTICAL
    clipChildren = false
  }

  fun setPullEnabled(enabled: Boolean) {
    pullEnabled = enabled
    if (!enabled && !refreshing && pullOffsetPx > 0f) {
      interceptingTouch = false
      parent?.requestDisallowInterceptTouchEvent(false)
      refreshLatched = false
      animatePullTo(0f)
    }
  }

  fun setHapticsEnabled(enabled: Boolean) {
    hapticsEnabled = enabled
    if (!enabled) {
      lastHapticTickAt = 0L
    }
  }

  fun setRefreshing(value: Boolean) {
    if (refreshing == value) return

    refreshing = value
    if (value) {
      refreshLatched = true
      thresholdHapticArmed = false
      lastHapticTickAt = 0L
      animatePullTo(holdDistancePx)
    } else {
      refreshLatched = false
      thresholdHapticArmed = true
      lastHapticTickAt = 0L
      animatePullTo(0f)
    }
  }

  fun setThreshold(valueDp: Float) {
    thresholdPx = dpToPx(valueDp.coerceAtLeast(1f))
    constrainDistances()
  }

  fun setHoldDistance(valueDp: Float) {
    holdDistancePx = dpToPx(valueDp.coerceAtLeast(0f))
    constrainDistances()
  }

  fun setMaxPullDistance(valueDp: Float) {
    maxPullDistancePx = dpToPx(valueDp.coerceAtLeast(1f))
    constrainDistances()
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (!canStartPull()) return false

    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        settleAnimator?.cancel()
        downX = event.x
        downY = event.y
        interceptingTouch = false
      }

      MotionEvent.ACTION_MOVE -> {
        val horizontalDistance = abs(event.x - downX)
        val verticalDistance = event.y - downY
        if (
          verticalDistance > touchSlop &&
          verticalDistance > horizontalDistance &&
          !contentCanScrollUp()
        ) {
          interceptingTouch = true
          parent?.requestDisallowInterceptTouchEvent(true)
          return true
        }
      }

      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        interceptingTouch = false
      }
    }

    return false
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!pullEnabled || refreshing) return false

    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        if (!interceptingTouch) return false
        val fingerDistance = max(0f, event.y - downY)
        updatePullOffset(applyDragResistance(fingerDistance), true)
        return true
      }

      MotionEvent.ACTION_UP -> {
        if (interceptingTouch) {
          interceptingTouch = false
          settleAfterRelease()
          parent?.requestDisallowInterceptTouchEvent(false)
          return true
        }
      }

      MotionEvent.ACTION_CANCEL -> {
        if (interceptingTouch) {
          interceptingTouch = false
          refreshLatched = false
          animatePullTo(0f)
          parent?.requestDisallowInterceptTouchEvent(false)
          return true
        }
      }
    }

    return super.onTouchEvent(event)
  }

  override fun onStartNestedScroll(
    child: View,
    target: View,
    axes: Int,
    type: Int
  ): Boolean =
    pullEnabled &&
      !refreshing &&
      type == ViewCompat.TYPE_TOUCH &&
      (axes and ViewCompat.SCROLL_AXIS_VERTICAL) != 0

  override fun onNestedScrollAccepted(
    child: View,
    target: View,
    axes: Int,
    type: Int
  ) {
    nestedScrollingHelper.onNestedScrollAccepted(child, target, axes, type)
  }

  override fun onStopNestedScroll(target: View, type: Int) {
    nestedScrollingHelper.onStopNestedScroll(target, type)
    if (
      type == ViewCompat.TYPE_TOUCH &&
      !interceptingTouch &&
      !refreshing &&
      pullOffsetPx > 0f
    ) {
      settleAfterRelease()
    }
  }

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int
  ) {
    if (dy <= 0 || pullOffsetPx <= 0f || refreshing) return

    val consumedY = min(dy.toFloat(), pullOffsetPx)
    updatePullOffset(pullOffsetPx - consumedY, type == ViewCompat.TYPE_TOUCH)
    consumed[1] += consumedY.toInt()
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int
  ) {
    val ignoredConsumed = IntArray(2)
    onNestedScroll(
      target,
      dxConsumed,
      dyConsumed,
      dxUnconsumed,
      dyUnconsumed,
      type,
      ignoredConsumed
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray
  ) {
    if (
      dyUnconsumed >= 0 ||
      type != ViewCompat.TYPE_TOUCH ||
      !pullEnabled ||
      refreshing ||
      target.canScrollVertically(-1)
    ) {
      return
    }

    val dragDistance = -dyUnconsumed.toFloat()
    val resistance = resistanceForOffset(pullOffsetPx)
    updatePullOffset(
      min(maxPullDistancePx, pullOffsetPx + dragDistance * resistance),
      type == ViewCompat.TYPE_TOUCH
    )
    consumed[1] += dyUnconsumed
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    onStartNestedScroll(child, target, axes, ViewCompat.TYPE_TOUCH)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    onNestedScrollAccepted(child, target, axes, ViewCompat.TYPE_TOUCH)
  }

  override fun onStopNestedScroll(target: View) {
    onStopNestedScroll(target, ViewCompat.TYPE_TOUCH)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) {
    onNestedPreScroll(target, dx, dy, consumed, ViewCompat.TYPE_TOUCH)
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int
  ) {
    onNestedScroll(
      target,
      dxConsumed,
      dyConsumed,
      dxUnconsumed,
      dyUnconsumed,
      ViewCompat.TYPE_TOUCH
    )
  }

  override fun getNestedScrollAxes(): Int = nestedScrollingHelper.nestedScrollAxes

  fun dispose() {
    settleAnimator?.cancel()
    settleAnimator = null
  }

  private fun canStartPull(): Boolean =
    pullEnabled && !refreshing && childCount > 0

  private fun contentCanScrollUp(): Boolean {
    val content = getChildAt(0) ?: return false
    return canScrollUp(content)
  }

  private fun canScrollUp(view: View): Boolean {
    if (view.canScrollVertically(-1)) return true
    if (view !is ViewGroup) return false

    for (index in 0 until view.childCount) {
      if (canScrollUp(view.getChildAt(index))) return true
    }
    return false
  }

  private fun applyDragResistance(fingerDistance: Float): Float {
    val thresholdFingerDistance = thresholdPx / BASE_DRAG_RESISTANCE
    if (fingerDistance <= thresholdFingerDistance) {
      return min(maxPullDistancePx, fingerDistance * BASE_DRAG_RESISTANCE)
    }

    val extraFingerDistance = fingerDistance - thresholdFingerDistance
    return min(
      maxPullDistancePx,
      thresholdPx + extraFingerDistance * EXTRA_DRAG_RESISTANCE
    )
  }

  private fun resistanceForOffset(offset: Float): Float {
    if (thresholdPx <= 0f) return BASE_DRAG_RESISTANCE
    val progress = (offset / thresholdPx).coerceIn(0f, 1f)
    return BASE_DRAG_RESISTANCE - progress * RESISTANCE_DROP
  }

  private fun settleAfterRelease() {
    if (!pullEnabled || refreshing || refreshLatched) return

    if (pullOffsetPx >= thresholdPx) {
      emitThresholdReachedIfNeeded()
      refreshLatched = true
      animatePullTo(holdDistancePx)
      onRefreshTriggered(Unit)
    } else {
      animatePullTo(0f)
    }
  }

  private fun animatePullTo(target: Float) {
    settleAnimator?.cancel()
    val constrainedTarget = target.coerceIn(0f, maxPullDistancePx)
    if (abs(pullOffsetPx - constrainedTarget) < 0.5f) {
      updatePullOffset(constrainedTarget, false)
      return
    }

    settleAnimator = ValueAnimator.ofFloat(pullOffsetPx, constrainedTarget).apply {
      duration = if (constrainedTarget == 0f) RESET_DURATION_MS else HOLD_DURATION_MS
      interpolator = DecelerateInterpolator()
      addUpdateListener { animator ->
        updatePullOffset(animator.animatedValue as Float, false)
      }
      start()
    }
  }

  private fun updatePullOffset(offset: Float, dragging: Boolean) {
    pullOffsetPx = offset.coerceIn(0f, maxPullDistancePx)

    updateProgressHaptic(dragging)

    if (pullOffsetPx < thresholdPx * THRESHOLD_REARM_PROGRESS) {
      thresholdHapticArmed = true
    }
    emitThresholdReachedIfNeeded()

    getChildAt(0)?.translationY = pullOffsetPx
    onPull(
      PullEvent(
        offset = (pullOffsetPx / density).toDouble(),
        progress = (pullOffsetPx / thresholdPx).coerceAtLeast(0f).toDouble(),
        dragging = dragging
      )
    )
  }

  private fun emitThresholdReachedIfNeeded() {
    if (
      !refreshing &&
      thresholdHapticArmed &&
      pullOffsetPx >= thresholdPx
    ) {
      thresholdHapticArmed = false
      if (hapticsEnabled) {
        emitVibration(durationMs = 34L, amplitude = 55)
      }
    }
  }

  private fun updateProgressHaptic(dragging: Boolean) {
    if (
      !dragging ||
      !hapticsEnabled ||
      refreshing ||
      pullOffsetPx < 2f ||
      pullOffsetPx >= thresholdPx
    ) {
      if (!dragging || pullOffsetPx < 2f) {
        lastHapticTickAt = 0L
      }
      return
    }

    val progress = (pullOffsetPx / thresholdPx).coerceIn(0f, 1f)
    // Android 马达的连续反馈很容易变成嗡鸣；用低振幅短脉冲保留距离感。
    val amplitudeControl = hasAmplitudeControl()
    val amplitude = (2f + progress * 14f).toInt()
    // 不支持振幅控制的马达，用时长渐变；同时留出间隔，避免脉冲叠成嗡鸣。
    val durationMs = if (amplitudeControl) {
      (3f + progress * 5f).toLong()
    } else {
      (1f + progress * 7f).toLong()
    }
    val baseIntervalMs = (36f - progress * 18f).toLong()
    val intervalMs = max(baseIntervalMs, durationMs + if (amplitudeControl) 4L else 6L)
    val now = SystemClock.uptimeMillis()
    if (lastHapticTickAt == 0L || now - lastHapticTickAt >= intervalMs) {
      emitVibration(durationMs = durationMs, amplitude = amplitude)
      lastHapticTickAt = now
    }
  }

  private fun hasAmplitudeControl(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && vibrator?.hasAmplitudeControl() == true

  private fun emitVibration(durationMs: Long, amplitude: Int) {
    // VibrationEffect 不接受 0ms；对非振幅控制设备来说，0ms 就代表不发这一拍。
    if (durationMs <= 0L) return

    val activeVibrator = vibrator ?: return
    if (!activeVibrator.hasVibrator()) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val effectiveAmplitude = if (activeVibrator.hasAmplitudeControl()) {
        amplitude.coerceIn(1, 255)
      } else {
        VibrationEffect.DEFAULT_AMPLITUDE
      }
      activeVibrator.vibrate(
        VibrationEffect.createOneShot(durationMs, effectiveAmplitude)
      )
    } else {
      @Suppress("DEPRECATION")
      activeVibrator.vibrate(durationMs)
    }
  }

  private fun constrainDistances() {
    maxPullDistancePx = max(maxPullDistancePx, thresholdPx)
    holdDistancePx = holdDistancePx.coerceIn(0f, maxPullDistancePx)
    updatePullOffset(pullOffsetPx, false)
  }

  private fun dpToPx(valueDp: Float): Float = valueDp * density

  private companion object {
    const val DEFAULT_THRESHOLD_DP = 76f
    const val DEFAULT_HOLD_DISTANCE_DP = 68f
    const val DEFAULT_MAX_PULL_DISTANCE_DP = 128f
    const val BASE_DRAG_RESISTANCE = 0.5f
    const val EXTRA_DRAG_RESISTANCE = 0.28f
    const val RESISTANCE_DROP = 0.16f
    const val RESET_DURATION_MS = 220L
    const val HOLD_DURATION_MS = 160L
    const val THRESHOLD_REARM_PROGRESS = 0.99f
  }
}
