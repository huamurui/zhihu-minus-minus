package expo.modules.pullrefresh

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.VibrationEffect.Composition.PRIMITIVE_CLICK
import android.os.Vibrator
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.ScrollView
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import androidx.core.widget.NestedScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.ceil
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
  private enum class Gesture { IDLE, TRACKING, DIRECT, NESTED }

  private var gesture = Gesture.IDLE
  private var startedAtTop = false
  private var fingerDistance = 0f
  private var pullEnabled = true
  private var hapticsEnabled = true
  private var refreshing = false
  private var refreshLatched = false
  private var thresholdHapticArmed = true
  private var settleAnimator: ValueAnimator? = null

  init {
    orientation = VERTICAL
    clipChildren = false
  }

  fun setPullEnabled(enabled: Boolean) {
    pullEnabled = enabled
    if (!enabled) finishGesture(cancelled = true)
    if (!enabled && !refreshing && refreshLatched) {
      refreshLatched = false
      animatePullTo(0f)
    }
  }

  fun setHapticsEnabled(enabled: Boolean) {
    hapticsEnabled = enabled
  }

  fun setRefreshing(value: Boolean) {
    if (refreshing == value) return

    refreshing = value
    if (value) {
      finishGesture(cancelled = true)
      refreshLatched = true
      animatePullTo(holdDistancePx)
    } else {
      refreshLatched = false
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

  // Children may disallow interception or stop a nested scroll on CANCEL as well as UP.
  // Observe the real end of the touch stream and settle exactly once for either drag path.
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        gesture = if (canStartPull()) Gesture.TRACKING else Gesture.IDLE
        startedAtTop = gesture == Gesture.TRACKING && !contentCanScrollUp()
      }
      MotionEvent.ACTION_MOVE -> if (gesture == Gesture.TRACKING) {
        val dx = abs(event.x - downX)
        if (dx > touchSlop && dx > abs(event.y - downY)) gesture = Gesture.IDLE
      }
    }
    val handled = super.dispatchTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_UP -> finishGesture(cancelled = false)
      MotionEvent.ACTION_CANCEL -> finishGesture(cancelled = true)
    }
    return handled
  }

  private fun finishGesture(cancelled: Boolean) {
    val wasPulling = gesture == Gesture.DIRECT || gesture == Gesture.NESTED
    gesture = Gesture.IDLE
    if (!wasPulling) return
    parent?.requestDisallowInterceptTouchEvent(false)
    if (refreshing || refreshLatched) return
    if (cancelled) animatePullTo(0f) else settleAfterRelease()
  }

  private fun startDirectPull(event: MotionEvent): Boolean {
    val dy = event.y - downY
    if (
      gesture != Gesture.TRACKING || !startedAtTop || dy <= touchSlop ||
      dy <= abs(event.x - downX) || contentCanScrollUp()
    ) return false

    beginPull(Gesture.DIRECT)
    updatePullOffset(applyDragResistance(fingerDistance + dy), true)
    return true
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean =
    event.actionMasked == MotionEvent.ACTION_MOVE && startDirectPull(event)

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (gesture == Gesture.IDLE) return false
    if (event.actionMasked == MotionEvent.ACTION_MOVE) {
      if (gesture == Gesture.DIRECT) {
        val distance = max(0f, fingerDistance + event.y - downY)
        updatePullOffset(applyDragResistance(distance), true)
      } else {
        // No child accepted DOWN (e.g. a short list). This view owns MOVE directly.
        startDirectPull(event)
      }
    }
    return true
  }

  private fun beginPull(owner: Gesture) {
    settleAnimator?.cancel()
    gesture = owner
    // A new drag can catch an unfinished return animation at its displayed position.
    fingerDistance = min(pullOffsetPx, thresholdPx) / BASE_DRAG_RESISTANCE +
      max(0f, pullOffsetPx - thresholdPx) / EXTRA_DRAG_RESISTANCE
    parent?.requestDisallowInterceptTouchEvent(true)
  }

  override fun onStartNestedScroll(
    child: View,
    target: View,
    axes: Int,
    type: Int
  ): Boolean =
    gesture == Gesture.TRACKING &&
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
  }

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int
  ) {
    if (type != ViewCompat.TYPE_TOUCH || gesture != Gesture.NESTED || dy <= 0) return
    val consumedY = min(dy.toFloat(), fingerDistance)
    if (consumedY <= 0f) return
    fingerDistance -= consumedY
    updatePullOffset(applyDragResistance(fingerDistance), true)
    consumed[1] += ceil(consumedY).toInt()
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
      (gesture != Gesture.TRACKING && gesture != Gesture.NESTED) ||
      target.canScrollVertically(-1)
    ) return

    if (gesture == Gesture.TRACKING) beginPull(Gesture.NESTED)
    fingerDistance -= dyUnconsumed.toFloat()
    updatePullOffset(applyDragResistance(fingerDistance), true)
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

  override fun onDetachedFromWindow() {
    finishGesture(cancelled = true)
    super.onDetachedFromWindow()
  }

  fun dispose() {
    settleAnimator?.cancel()
    settleAnimator = null
  }

  private fun canStartPull(): Boolean =
    pullEnabled && !refreshing && !refreshLatched && childCount > 0

  private fun contentCanScrollUp(): Boolean =
    findVerticalScroller(getChildAt(0))?.canScrollVertically(-1) == true

  private fun findVerticalScroller(view: View?): View? {
    if (view == null || view.visibility != View.VISIBLE) return null
    // The outer list owns the top edge; an embedded scrolled card must not block it.
    if (view is ScrollView || view is NestedScrollView ||
      view.canScrollVertically(-1) || view.canScrollVertically(1)) return view
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findVerticalScroller(view.getChildAt(index))?.let { return it }
      }
    }
    return null
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

  private fun settleAfterRelease() {
    if (!pullEnabled || refreshing || refreshLatched) return

    if (pullOffsetPx >= thresholdPx) {
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

    if (pullOffsetPx >= thresholdPx && thresholdHapticArmed) {
      thresholdHapticArmed = false
      if (dragging && pullEnabled && hapticsEnabled && !refreshing && !refreshLatched) {
        playThresholdHaptic()
      }
    } else if (pullOffsetPx < thresholdPx * THRESHOLD_REARM_PROGRESS) {
      thresholdHapticArmed = true
    }

    getChildAt(0)?.translationY = pullOffsetPx
    onPull(
      PullEvent(
        offset = (pullOffsetPx / density).toDouble(),
        progress = (pullOffsetPx / thresholdPx).coerceAtLeast(0f).toDouble(),
        dragging = dragging
      )
    )
  }

  private fun playThresholdHaptic() {
    val motor = vibrator ?: return
    if (!motor.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && motor.areAllPrimitivesSupported(PRIMITIVE_CLICK)) {
      motor.vibrate(VibrationEffect.startComposition().addPrimitive(PRIMITIVE_CLICK, 0.65f).compose())
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val amplitude = if (motor.hasAmplitudeControl()) 152 else VibrationEffect.DEFAULT_AMPLITUDE
      motor.vibrate(VibrationEffect.createOneShot(15L, amplitude))
    } else {
      @Suppress("DEPRECATION")
      motor.vibrate(15L)
    }
  }

  private fun constrainDistances() {
    maxPullDistancePx = max(maxPullDistancePx, thresholdPx)
    holdDistancePx = holdDistancePx.coerceIn(0f, maxPullDistancePx)
    updatePullOffset(pullOffsetPx, false)
  }

  private fun dpToPx(valueDp: Float): Float = valueDp * density

  private companion object {
    const val THRESHOLD_REARM_PROGRESS = 0.985f
    const val DEFAULT_THRESHOLD_DP = 76f
    const val DEFAULT_HOLD_DISTANCE_DP = 68f
    const val DEFAULT_MAX_PULL_DISTANCE_DP = 128f
    const val BASE_DRAG_RESISTANCE = 0.5f
    const val EXTRA_DRAG_RESISTANCE = 0.28f
    const val RESET_DURATION_MS = 220L
    const val HOLD_DURATION_MS = 160L
  }
}
