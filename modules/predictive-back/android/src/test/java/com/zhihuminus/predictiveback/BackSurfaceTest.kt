package com.zhihuminus.predictiveback

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import android.os.Looper
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowChoreographer
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "mdpi", manifest = Config.NONE)
class BackSurfaceTest {
  private val view = View(RuntimeEnvironment.getApplication()).apply {
    layout(0, 0, 360, 640)
    translationX = 6f
    outlineProvider = ViewOutlineProvider.BOUNDS
  }
  private val corners = floatArrayOf(20f, 20f, 24f, 24f)

  private val frame = Duration.ofMillis(16)

  @Before fun controlFrameClock() {
    // Disable virtual vsync's automatic advancement so a draw can sample a real intermediate frame.
    ShadowChoreographer.setPaused(true)
    ShadowChoreographer.setFrameDelay(frame)
  }

  private fun advanceFrames(count: Int) {
    repeat(count) { shadowOf(Looper.getMainLooper()).idleFor(frame) }
  }

  @Test
  @GraphicsMode(GraphicsMode.Mode.NATIVE)
  fun previewKeepsTheOppositeEdgeFixedAndCancelRestoresTheOriginalPivot() {
    val alpha = view.alpha
    val originalOutline = view.outlineProvider
    val startScale = view.scaleX
    val startTranslation = view.translationX
    fun bounds() = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()).also { view.matrix.mapRect(it) }
    for (explicitPivot in listOf(false, true)) {
      if (explicitPivot) {
        view.pivotX = 80f
        view.pivotY = 90f
      }
      for (fromRight in listOf(false, true)) {
        val start = bounds()
        val anchor = if (fromRight) start.left else start.right
        var lastWidth = start.width()
        val surface = BackSurface(view, corners, fromRight)
        for (progress in listOf(0.1f, 0.5f, 1f)) {
          surface.applyProgress(progress)
          val current = bounds()
          assertEquals(anchor, if (fromRight) current.left else current.right, 0.001f)
          assertEquals(start.centerY(), current.centerY(), 0.001f)
          assertTrue(current.width() < lastWidth)
          lastWidth = current.width()
          assertEquals(startTranslation, view.translationX, 0f)
          assertEquals(view.scaleX, view.scaleY, 0f)
          assertEquals(alpha, view.alpha, 0f)
        }
        surface.settle(committing = false, onEnd = surface::restore)
        advanceFrames(3)
        val cancelling = bounds()
        assertTrue(cancelling.width() > lastWidth && cancelling.width() < start.width())
        assertEquals(anchor, if (fromRight) cancelling.left else cancelling.right, 0.001f)
        assertEquals(startTranslation, view.translationX, 0f)
        advanceFrames(20)
        assertEquals(start, bounds())
        assertEquals(startScale, view.scaleX, 0f)
        assertEquals(startScale, view.scaleY, 0f)
        assertEquals(explicitPivot, view.isPivotSet)
        if (explicitPivot) {
          assertEquals(80f, view.pivotX, 0f)
          assertEquals(90f, view.pivotY, 0f)
        }
        assertFalse(view.clipToOutline)
        assertSame(originalOutline, view.outlineProvider)
      }
    }
  }

  @Test
  @GraphicsMode(GraphicsMode.Mode.NATIVE)
  fun commitSlidesTheHeldFrameOffscreenInEitherDirection() {
    val stack = FrameLayout(view.context).apply {
      setBackgroundColor(Color.RED)
      addView(view)
      layout(0, 0, 360, 640)
    }
    view.layout(0, 0, stack.width, stack.height)
    view.setBackgroundColor(Color.BLUE)
    val originalBounds = Rect(10, 10, 340, 620)
    view.clipBounds = originalBounds
    fun render(): Bitmap {
      val bitmap = Bitmap.createBitmap(stack.width, stack.height, Bitmap.Config.ARGB_8888)
      stack.draw(Canvas(bitmap))
      return bitmap
    }
    fun visibleBounds() = RectF(originalBounds).also { view.matrix.mapRect(it) }
    val centerX = stack.width / 2
    val centerY = stack.height / 2
    val before = render()
    val initial = visibleBounds()
    assertEquals(Color.BLUE, before.getPixel(centerX, centerY))
    for (fromRight in listOf(false, true)) {
      val surface = BackSurface(view, corners, fromRight)
      val alpha = view.alpha
      val startTranslation = view.translationX
      surface.applyProgress(1f)
      val heldScale = view.scaleX
      val held = render()
      val foreground = visibleBounds()
      val revealedX = (if (fromRight) (initial.right + foreground.right) / 2f
        else (initial.left + foreground.left) / 2f).toInt()
      for (x in revealedX - 1..revealedX + 1) {
        assertEquals(Color.BLUE, before.getPixel(x, centerY))
        assertEquals(Color.RED, held.getPixel(x, centerY))
      }
      val foregroundX = (if (fromRight) foreground.left + foreground.width() / 4f
        else foreground.right - foreground.width() / 4f).toInt()
      assertEquals(Color.BLUE, held.getPixel(foregroundX, centerY))

      var finished = false
      surface.settle(committing = true) { finished = true }
      assertEquals(foreground, visibleBounds())
      assertEquals(startTranslation, view.translationX, 0f)
      advanceFrames(4)
      assertFalse(finished)
      val moving = visibleBounds()
      if (fromRight) assertTrue(moving.right < foreground.right)
      else assertTrue(moving.left > foreground.left)
      val visibleLeft = maxOf(0f, moving.left)
      val visibleRight = minOf(stack.width.toFloat(), moving.right)
      assertTrue(visibleLeft < visibleRight)
      val middle = render()
      val movingPageX = ((visibleLeft + visibleRight) / 2f).toInt()
      assertEquals(Color.BLUE, middle.getPixel(movingPageX, centerY))
      val uncoveredX = (if (fromRight) (moving.right + foreground.right) / 2f
        else (foreground.left + moving.left) / 2f).toInt()
      assertEquals(Color.BLUE, held.getPixel(uncoveredX, centerY))
      assertEquals(Color.RED, middle.getPixel(uncoveredX, centerY))
      assertEquals(heldScale, view.scaleX, 0f)
      assertEquals(heldScale, view.scaleY, 0f)
      assertEquals(alpha, view.alpha, 0f)

      advanceFrames(20)
      assertTrue(finished)
      val finalFrame = visibleBounds()
      assertTrue(if (fromRight) finalFrame.right <= 0f else finalFrame.left >= stack.width)
      assertEquals(Color.RED, render().getPixel(centerX, centerY))
      assertEquals(originalBounds, view.clipBounds)
      surface.restore()
      assertEquals(startTranslation, view.translationX, 0f)
      assertEquals(Color.BLUE, render().getPixel(centerX, centerY))
      assertSame(ViewOutlineProvider.BOUNDS, view.outlineProvider)
    }
  }

  @Test
  @GraphicsMode(GraphicsMode.Mode.NATIVE)
  fun interruptionRestoresTheHeldViewWithoutFinishingAnAbandonedSlide() {
    val start = view.translationX
    val surface = BackSurface(view, corners, fromRight = false)
    surface.applyProgress(0.6f)
    var finished = false
    surface.settle(committing = true) { finished = true }
    advanceFrames(4)
    assertTrue(view.translationX > start)
    surface.restore()
    surface.restore()
    advanceFrames(20)
    assertFalse(finished)
    assertEquals(start, view.translationX, 0f)
    assertFalse(view.isPivotSet)
    assertSame(ViewOutlineProvider.BOUNDS, view.outlineProvider)
  }
}
