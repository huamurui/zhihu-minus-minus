package com.zhihuminus.predictiveback

import android.app.Activity
import android.graphics.Insets
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
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
    @Implementation protected fun getWindowInsets(forceConstruct: Boolean): WindowInsets =
      WindowInsets.Builder().setInsets(WindowInsets.Type.systemGestures(), Insets.of(24, 0, 24, 0)).build()
  }

  private val controller = Robolectric.buildActivity(Activity::class.java).setup().visible()
  private val activity = controller.get()
  private val registry = mock(ModuleRegistry::class.java)
  private val appContext = mock(AppContext::class.java).also { doReturn(registry).`when`(it).registry }
  private val host = BackSwipeHost(activity, appContext)
  private val actions = listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP)

  @Before fun mount() {
    val root = object : FrameLayout(activity), RootView by mock(RootView::class.java) {}
    root.addView(host)
    activity.setContentView(root)
    host.layout(0, 0, 360, 500)
    controller.windowFocusChanged(true)
  }

  private fun drag(source: Int, tool: Int, startX: Float) {
    val downTime = SystemClock.uptimeMillis()
    val pointer = MotionEvent.PointerProperties().apply { id = 0; toolType = tool }
    actions.forEachIndexed { index, action ->
      val point = MotionEvent.PointerCoords().apply {
        x = startX + 70f * index
        y = 100f
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
    val module = mock(PredictiveBackModule::class.java)
    val gesture = mock(EdgeSwipe::class.java)
    doReturn(module).`when`(registry).getModule("ZhihuPredictiveBack")
    doReturn(gesture).`when`(module).edgeSwipeFor(host)
    doReturn(true).`when`(gesture).beginApp(host, false)
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
