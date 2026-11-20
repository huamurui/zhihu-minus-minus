package expo.modules.pullrefresh

import android.content.Context
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.core.view.ViewCompat
import androidx.core.widget.NestedScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.ViewEvent
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockConstruction
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "mdpi", manifest = Config.NONE)
class PullRefreshGestureTest {
  private val context = RuntimeEnvironment.getApplication()
  private var refreshEvents = 0
  private var downTime = 0L

  // Record the Expo event at the JS boundary while using real Android view dispatch.
  private val events = mockConstruction(ViewEvent::class.java) { callback, creation ->
    if (creation.arguments().first() == "onRefreshTriggered") {
      @Suppress("UNCHECKED_CAST")
      doAnswer {
        refreshEvents++
        null
      }.`when`(callback as ViewEvent<Unit>).invoke(Unit)
    }
  }

  @After fun releaseEventMock() = events.close()

  private val refresh = PullRefreshView(context, mock(AppContext::class.java)).apply {
    setHapticsEnabled(false)
    setThreshold(60f)
    setHoldDistance(48f)
  }

  private var touchRoot: ViewGroup = refresh

  private fun mount(child: View, inPager: Boolean = false) {
    if (inPager) {
      // ComposePagerView resolves the direction on the first move and asks the list's
      // parent to keep the gesture in the child. Nested scrolling must still work.
      touchRoot = object : FrameLayout(context) {
        private var resolved = false
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
          if (event.actionMasked == MotionEvent.ACTION_DOWN) resolved = false
          if (event.actionMasked == MotionEvent.ACTION_MOVE && !resolved) {
            resolved = true
            child.parent.requestDisallowInterceptTouchEvent(true)
          }
          return super.dispatchTouchEvent(event)
        }
      }.apply { addView(refresh, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)) }
    }
    refresh.addView(child, LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
    touchRoot.measure(
      View.MeasureSpec.makeMeasureSpec(360, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(760, View.MeasureSpec.EXACTLY)
    )
    touchRoot.layout(0, 0, 360, 760)
  }

  private fun dispatch(action: Int, x: Int, y: Int) {
    if (action == MotionEvent.ACTION_DOWN) downTime = SystemClock.uptimeMillis()
    val event = MotionEvent.obtain(
      downTime, SystemClock.uptimeMillis(), action, x.toFloat(), y.toFloat(), 0
    )
    try {
      touchRoot.dispatchTouchEvent(event)
    } finally {
      event.recycle()
    }
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(24))
  }

  private fun settle() = shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400))

  private fun installVibrator(): Vibrator {
    val vibrator = mock(Vibrator::class.java)
    `when`(vibrator.hasVibrator()).thenReturn(true)
    shadowOf(context).setSystemService(Context.VIBRATOR_SERVICE, vibrator)
    refresh.setHapticsEnabled(true)
    return vibrator
  }

  private fun assertSinglePulseCount(vibrator: Vibrator, expected: Int) {
    val effects = ArgumentCaptor.forClass(VibrationEffect::class.java)
    verify(vibrator, times(expected)).vibrate(effects.capture())
    val oneShotType = VibrationEffect.createOneShot(1L, VibrationEffect.DEFAULT_AMPLITUDE).javaClass
    for (effect in effects.allValues) {
      assertEquals(oneShotType, effect.javaClass)
    }
  }

  @Test fun slowPullIsSilentUntilTheThresholdAndReversingDoesNotVibrate() {
    val vibrator = installVibrator()
    mount(View(context))
    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    for (y in 30..139 step 3) dispatch(MotionEvent.ACTION_MOVE, 20, y)
    assertSinglePulseCount(vibrator, 0)
    dispatch(MotionEvent.ACTION_MOVE, 20, 140)
    assertSinglePulseCount(vibrator, 1)

    // A one-pixel wobble at the threshold should not signal readiness twice.
    dispatch(MotionEvent.ACTION_MOVE, 20, 139)
    dispatch(MotionEvent.ACTION_MOVE, 20, 140)
    assertSinglePulseCount(vibrator, 1)
    dispatch(MotionEvent.ACTION_MOVE, 20, 100)
    assertSinglePulseCount(vibrator, 1)
    dispatch(MotionEvent.ACTION_MOVE, 20, 180)
    assertSinglePulseCount(vibrator, 2)
    dispatch(MotionEvent.ACTION_CANCEL, 20, 180)
    settle()
    assertSinglePulseCount(vibrator, 2)
  }

  @Test fun jumpingAcrossTheWholePullConfirmsOnceAndHonorsTheHapticsSetting() {
    val vibrator = installVibrator()
    mount(View(context))
    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 130)
    dispatch(MotionEvent.ACTION_UP, 20, 130)
    settle()
    assertSinglePulseCount(vibrator, 0)

    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 320)
    assertSinglePulseCount(vibrator, 1)
    dispatch(MotionEvent.ACTION_UP, 20, 320)
    refresh.setRefreshing(true)
    settle()
    refresh.setRefreshing(false)
    settle()
    assertSinglePulseCount(vibrator, 1)

    refresh.setHapticsEnabled(false)
    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 320)
    refresh.setHapticsEnabled(true)
    dispatch(MotionEvent.ACTION_MOVE, 20, 340)
    dispatch(MotionEvent.ACTION_CANCEL, 20, 340)
    settle()
    assertSinglePulseCount(vibrator, 1)
  }

  @Test fun refreshesWhenTheChildDoesNotHandleDown() {
    val blank = View(context)
    mount(blank)
    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 220)
    assertTrue(blank.translationY >= 60f)
    dispatch(MotionEvent.ACTION_UP, 20, 220)
    settle()
    assertEquals(48f, blank.translationY, .01f)
    assertEquals(1, refreshEvents)
  }

  @Test fun nestedScrollConsumesItsOwnContentBeforeThePullBegins() {
    val scroll = NestedScrollView(context).apply {
      isNestedScrollingEnabled = true
      addView(View(context).apply { minimumHeight = 1800 })
    }
    mount(scroll, inPager = true)
    scroll.scrollTo(0, 180)
    assertEquals(180, scroll.scrollY)
    dispatch(MotionEvent.ACTION_DOWN, 30, 30)
    dispatch(MotionEvent.ACTION_MOVE, 30, 110)
    assertTrue(scroll.scrollY in 1 until 180)
    assertEquals(0f, scroll.translationY, 0f)
    dispatch(MotionEvent.ACTION_MOVE, 30, 260)
    assertTrue(scroll.translationY > 0f && scroll.translationY < 60f)
    dispatch(MotionEvent.ACTION_MOVE, 30, 460)
    assertEquals(0, scroll.scrollY)
    assertTrue(scroll.translationY >= 60f)
    dispatch(MotionEvent.ACTION_UP, 30, 460)
    settle()
    assertEquals(48f, scroll.translationY, .01f)
    assertEquals(1, refreshEvents)
  }

  @Test fun nestedTravelPreservesThresholdAndReverseDistanceAcrossDifferentMoveBatches() {
    val child = View(context).apply { isClickable = true }
    mount(child)
    refresh.setThreshold(76f)
    val offsets = mutableListOf<Float>()
    fun pull(distance: Int) {
      val consumed = IntArray(2)
      refresh.onNestedScroll(child, 0, 0, 0, -distance, ViewCompat.TYPE_TOUCH, consumed)
      assertEquals(-distance, consumed[1])
    }
    for (chunks in listOf(listOf(160), listOf(40, 40, 40, 40))) {
      dispatch(MotionEvent.ACTION_DOWN, 20, 20)
      for (chunk in chunks) pull(chunk)
      assertTrue(child.translationY >= 76f)
      offsets.add(child.translationY)

      val consumed = IntArray(2)
      refresh.onNestedPreScroll(child, 0, 40, consumed, ViewCompat.TYPE_TOUCH)
      assertEquals(40, consumed[1])
      val offsetAfterReversing = child.translationY
      consumed.fill(0)
      refresh.onNestedPreScroll(child, 0, 180, consumed, ViewCompat.TYPE_TOUCH)
      assertEquals(120, consumed[1])
      assertEquals(0f, child.translationY, 0f)
      pull(120)
      assertEquals(offsetAfterReversing, child.translationY, .01f)
      pull(40)
      dispatch(MotionEvent.ACTION_UP, 20, 180)
      refresh.setRefreshing(true)
      refresh.setRefreshing(false)
      settle()
    }
    assertEquals(offsets.first(), offsets.last(), .01f)
    assertEquals(2, refreshEvents)
  }

  @Test fun aFrameworkScrollViewCancelledByThePagerCanRefreshOnItsNextGesture() {
    // React Native's vertical ScrollView uses the platform's nested-scrolling callbacks.
    val scroll = ScrollView(context).apply {
      isNestedScrollingEnabled = true
      addView(View(context).apply { minimumHeight = 1800 })
    }
    mount(scroll, inPager = true)
    for (end in listOf(MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP)) {
      dispatch(MotionEvent.ACTION_DOWN, 20, 20)
      dispatch(MotionEvent.ACTION_MOVE, 20, 100)
      dispatch(MotionEvent.ACTION_MOVE, 20, 260)
      assertTrue(scroll.translationY >= 60f)
      dispatch(end, 20, 260)
      settle()
      assertEquals(if (end == MotionEvent.ACTION_CANCEL) 0f else 48f, scroll.translationY, .01f)
      assertEquals(if (end == MotionEvent.ACTION_CANCEL) 0 else 1, refreshEvents)
    }
  }

  @Test fun horizontalAndCancelledPullsDoNotPreventAnotherRefresh() {
    val child = View(context).apply { isClickable = true }
    mount(child)
    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 250, 40)
    dispatch(MotionEvent.ACTION_UP, 250, 40)
    settle()
    assertEquals(0f, child.translationY, 0f)
    assertEquals(0, refreshEvents)

    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 220)
    assertTrue(child.translationY >= 60f)
    dispatch(MotionEvent.ACTION_CANCEL, 20, 220)
    settle()
    assertEquals(0f, child.translationY, 0f)
    assertEquals(0, refreshEvents)

    dispatch(MotionEvent.ACTION_DOWN, 20, 20)
    dispatch(MotionEvent.ACTION_MOVE, 20, 220)
    dispatch(MotionEvent.ACTION_UP, 20, 220)
    settle()
    assertEquals(48f, child.translationY, .01f)
    assertEquals(1, refreshEvents)
  }
}
