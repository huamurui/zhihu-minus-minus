package com.zhihuminus.predictiveback

import android.app.Activity
import android.graphics.Insets
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.uimanager.ReactAccessibilityDelegate.AccessibilityRole
import com.facebook.react.uimanager.RootView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModuleRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowViewRootImpl
import org.robolectric.shadows.ShadowWindowManagerGlobal.startPredictiveBackGesture
import org.robolectric.util.ReflectionHelpers

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "mdpi", manifest = Config.NONE)
class PredictiveBackGestureTest {
  // Robolectric's default window reports no system gesture edges.
  @Implements(className = "android.view.ViewRootImpl", isInAndroidSdk = false)
  class GestureInsetsWindow : ShadowViewRootImpl() {
    companion object {
      var edges: Insets = Insets.of(24, 0, 24, 0)
    }
    @Implementation protected fun getWindowInsets(forceConstruct: Boolean): WindowInsets =
      WindowInsets.Builder().setInsets(WindowInsets.Type.systemGestures(), edges).build()
  }

  private val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
  private val activity = controller.get()
  private val registry = mock(ModuleRegistry::class.java)
  private val appContext = mock(AppContext::class.java).also { doReturn(registry).`when`(it).registry }
  private val host = BackSwipeHost(activity, appContext)
  private val actions = listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP)

  @Before fun mount() {
    GestureInsetsWindow.edges = Insets.of(24, 0, 24, 0)
    val root = object : FrameLayout(activity), RootView by mock(RootView::class.java) {}
    root.addView(host)
    activity.setContentView(root)
    host.layout(0, 0, 360, 500)
    controller.windowFocusChanged(true)
  }

  private fun mockBackGesture(): EdgeSwipe {
    val module = mock(PredictiveBackModule::class.java)
    val gesture = mock(EdgeSwipe::class.java)
    doReturn(module).`when`(registry).getModule("ZhihuPredictiveBack")
    doReturn(gesture).`when`(module).edgeSwipeFor(host)
    doReturn(true).`when`(gesture).beginApp(host, false)
    doReturn(true).`when`(gesture).beginApp(host, true)
    return gesture
  }

  private fun drag(source: Int, tool: Int, startX: Float, stepX: Float = 70f, y: Float = 100f) {
    val downTime = SystemClock.uptimeMillis()
    val pointer = MotionEvent.PointerProperties().apply { id = 0; toolType = tool }
    actions.forEachIndexed { index, action ->
      val point = MotionEvent.PointerCoords().apply {
        x = startX + stepX * index
        this.y = y
        pressure = 1f
        size = 1f
      }
      val mouse = source == InputDevice.SOURCE_MOUSE || tool == MotionEvent.TOOL_TYPE_MOUSE
      val buttons = if (mouse && action != MotionEvent.ACTION_UP) MotionEvent.BUTTON_PRIMARY else 0
      val event = MotionEvent.obtain(downTime, downTime + 30L * index, action, 1, arrayOf(pointer),
        arrayOf(point), 0, buttons, 1f, 1f, 0, 0, source, 0)
      try {
        host.dispatchTouchEvent(event)
      } finally {
        event.recycle()
      }
    }
  }

  @Test
  @Config(shadows = [GestureInsetsWindow::class])
  fun mouseDragsReachChildWhileFingerDragsNavigateFromEdgeAndContent() {
    host.allowContentSwipe = true
    val gesture = mockBackGesture()
    val received = mutableListOf<Int>()
    val child = View(activity).apply {
      id = View.generateViewId()
      setOnTouchListener { _, event -> received.add(event.actionMasked) }
    }
    host.addView(child)
    child.layout(0, 0, 360, 500)
    for (x in listOf(34f, 120f)) {
      for ((source, tool) in listOf(
        InputDevice.SOURCE_MOUSE to MotionEvent.TOOL_TYPE_MOUSE,
        InputDevice.SOURCE_MOUSE to MotionEvent.TOOL_TYPE_UNKNOWN,
        InputDevice.SOURCE_TOUCHSCREEN to MotionEvent.TOOL_TYPE_MOUSE,
      )) {
        received.clear()
        drag(source, tool, x)
        assertEquals(actions, received)
      }
      received.clear()
      drag(InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER, x)
      assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL), received)
    }
    verify(gesture, times(2)).beginApp(host, false)
    verify(gesture, times(2)).endApp(true)
  }

  @Test
  @Config(shadows = [GestureInsetsWindow::class])
  fun answerPagerKeepsBothInnerEdgeDragsWhileItsHeaderCanNavigateBack() {
    val gesture = mockBackGesture()
    val received = mutableListOf<Int>()
    val pageContent = View(activity).apply {
      id = View.generateViewId()
      setOnTouchListener { _, event -> received.add(event.actionMasked) }
    }
    // A single loaded answer cannot yet scroll in either direction.
    val pager = FrameLayout(activity).apply {
      id = View.generateViewId()
      setTag(com.facebook.react.R.id.accessibility_role, AccessibilityRole.PAGER)
      addView(pageContent)
    }
    val header = View(activity).apply { id = View.generateViewId(); isClickable = true }
    host.addView(header)
    host.addView(pager)
    header.layout(0, 0, 360, 60)
    pager.layout(0, 60, 360, 500)
    pageContent.layout(0, 0, 360, 440)

    for ((x, step) in listOf(34f to 70f, 326f to -70f, 120f to 70f)) {
      received.clear()
      drag(InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER, x, step)
      assertEquals(actions, received)
    }
    verify(gesture, never()).beginApp(host, false)
    verify(gesture, never()).beginApp(host, true)

    drag(InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER, 34f, y = 30f)
    verify(gesture).beginApp(host, false)
    verify(gesture).endApp(true)
  }

  @Test
  @Config(shadows = [GestureInsetsWindow::class])
  fun fallbackFollowsEachWindowInsetAndKeepsOutOfSystemOwnedEdges() {
    val gesture = mockBackGesture()
    val received = mutableListOf<Int>()
    val child = View(activity).apply {
      id = View.generateViewId()
      setOnTouchListener { _, event -> received.add(event.actionMasked) }
    }
    host.addView(child)
    child.layout(0, 0, host.width, host.height)
    val edgeSlop = ViewConfiguration.get(activity).scaledEdgeSlop
    fun expectBack(startX: Float, stepX: Float, claimed: Boolean) {
      received.clear()
      drag(InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER, startX, stepX)
      val expected = if (claimed) listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_CANCEL) else actions
      assertEquals("start x=$startX, insets=${GestureInsetsWindow.edges}", expected, received)
    }

    GestureInsetsWindow.edges = Insets.of(90, 0, 7, 0)
    expectBack(89f, 40f, false)
    expectBack(90f + edgeSlop / 2f, 40f, true)
    expectBack(90f + edgeSlop + 1f, 40f, false)
    expectBack(host.width - 7f - edgeSlop / 2f, -40f, true)
    expectBack(host.width - 6f, -40f, false)

    GestureInsetsWindow.edges = Insets.of(0, 0, 16, 0)
    expectBack(1f, 40f, false)
    expectBack(host.width - 16f - edgeSlop / 2f, -40f, true)
    GestureInsetsWindow.edges = Insets.NONE
    host.allowContentSwipe = true
    expectBack(host.width / 2f, 40f, false)

    // Even when the two fallback bands overlap, neither can claim the system's area.
    GestureInsetsWindow.edges = Insets.of(20, 0, 8, 0)
    host.layout(0, 0, 28 + edgeSlop / 2, host.height)
    expectBack(host.width - 7f, 40f, false)
    expectBack(19f, -40f, false)
    verify(gesture).beginApp(host, false)
    verify(gesture, times(2)).beginApp(host, true)
  }

  @Test
  @Config(shadows = [GestureInsetsWindow::class])
  fun horizontallyScrollableChildKeepsDragsInBothFallbackBandsAndOptedInContent() {
    val gesture = mockBackGesture()
    host.allowContentSwipe = true
    val received = mutableListOf<Int>()
    // A horizontal widget at its first item can report only one scroll direction.
    val widget = object : View(activity) {
      override fun canScrollHorizontally(direction: Int) = direction > 0
    }.apply {
      id = View.generateViewId()
      setOnTouchListener { _, event -> received.add(event.actionMasked) }
    }
    host.addView(widget)
    widget.layout(0, 0, host.width, host.height)
    val innerX = GestureInsetsWindow.edges.left + ViewConfiguration.get(activity).scaledEdgeSlop / 2f
    for ((x, step) in listOf(innerX to 40f, host.width - innerX to -40f, host.width / 2f to 40f)) {
      received.clear()
      drag(InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER, x, step)
      assertEquals(actions, received)
    }
    verify(gesture, never()).beginApp(host, false)
    verify(gesture, never()).beginApp(host, true)
  }

  @Test fun replacementCallbackWaitsForPreviousCommitToReleaseItsView() {
    // Opt this activity into predictive back as the application's manifest does.
    ReflectionHelpers.callInstanceMethod<Unit>(activity.applicationInfo, "setEnableOnBackInvokedCallback",
      ReflectionHelpers.ClassParameter.from(Boolean::class.javaPrimitiveType, true))
    val react = mock(ReactActivity::class.java)
    val delegate = mock(ReactActivityDelegate::class.java)
    doReturn(activity.window).`when`(react).window
    doReturn(activity.windowManager).`when`(react).windowManager
    doReturn(activity.onBackInvokedDispatcher).`when`(react).onBackInvokedDispatcher
    doReturn(delegate).`when`(react).reactActivityDelegate
    doReturn(true).`when`(delegate).onBackPressed()
    val commits = mutableListOf<Int>()
    var sequence = 0
    val window = BackWindow(react, { ++sequence }) { event ->
      if (event["phase"] == "commit") commits.add(event["gestureId"] as Int)
    }
    fun systemGesture(beforeInvoke: () -> Unit = {}) {
      requireNotNull(startPredictiveBackGesture(BackEvent.EDGE_LEFT)).use { gesture ->
        gesture.moveBy(110f, 0f)
        beforeInvoke()
      }
    }

    try {
      host.setTag(com.facebook.react.R.id.view_tag_native_id, "zhihu-back-surface-A")
      window.configure("A", true, false)
      val first = requireNotNull(window.edgeSwipeFor(host))
      systemGesture()
      val committedId = commits.single()
      window.configure("A", false, false)
      val replacement = requireNotNull(window.edgeSwipeFor(host))
      val callback = replacement as OnBackAnimationCallback
      assertNotSame(first, replacement)
      assertFalse(replacement.beginApp(host, false))
      callback.onBackInvoked()
      verify(delegate, never()).onBackPressed()

      systemGesture { window.releaseSurface(committedId) }
      assertEquals(listOf(committedId), commits)
      verify(delegate, never()).onBackPressed()
      callback.onBackInvoked()
      verify(delegate).onBackPressed()

      assertTrue(replacement.beginApp(host, false))
      replacement.endApp(true)
      assertEquals(2, commits.size)
      window.releaseSurface(commits.last())
      systemGesture()
      assertEquals(3, commits.size)
    } finally {
      window.close()
    }
  }
}
