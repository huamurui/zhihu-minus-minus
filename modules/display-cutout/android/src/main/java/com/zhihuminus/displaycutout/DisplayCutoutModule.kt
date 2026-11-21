package com.zhihuminus.displaycutout

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PathMeasure
import android.graphics.RectF
import android.os.Build
import android.view.DisplayCutout
import android.view.ViewTreeObserver
import android.view.WindowInsets
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class DisplayCutoutModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZhihuDisplayCutout")
    View(DisplayCutoutProbe::class) {
      Events("onMeasurement")
    }
  }
}

data class CutoutRect(
  @Field val x: Float,
  @Field val y: Float,
  @Field val width: Float,
  @Field val height: Float
) : Record

data class CutoutMeasurement(
  @Field val rect: CutoutRect?,
  @Field val viewportWidth: Float,
  @Field val viewportHeight: Float
) : Record

private data class CutoutBounds(val rect: RectF, val usesDisplayCoordinates: Boolean)

@SuppressLint("ViewConstructor")
class DisplayCutoutProbe(context: Context, appContext: AppContext) :
  ExpoView(context, appContext),
  ViewTreeObserver.OnGlobalLayoutListener,
  ViewTreeObserver.OnPreDrawListener {
  private val onMeasurement by EventDispatcher<CutoutMeasurement>()
  private val origin = IntArray(2)
  private var windowCutout: DisplayCutout? = null
  private var bounds: CutoutBounds? = null
  private var lastMeasurement: CutoutMeasurement? = null
  private var awaitingStableOrigin = false
  private val report = Runnable {
    awaitingStableOrigin = false
    publishMeasurement()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    lastMeasurement = null
    awaitingStableOrigin = false
    viewTreeObserver.addOnGlobalLayoutListener(this)
    viewTreeObserver.addOnPreDrawListener(this)
    requestApplyInsets()
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnGlobalLayoutListener(this)
    viewTreeObserver.removeOnPreDrawListener(this)
    removeCallbacks(report)
    super.onDetachedFromWindow()
  }

  override fun onGlobalLayout() = refreshInsets()

  override fun onPreDraw(): Boolean {
    if (bounds != null) updateOrigin(layoutChanged = false)
    return true
  }

  override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
    post { refreshInsets() }
    return super.onApplyWindowInsets(insets)
  }

  private fun refreshInsets() {
    if (!isAttachedToWindow) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val cutout = rootWindowInsets?.displayCutout
      if (windowCutout != cutout) {
        windowCutout = cutout
        bounds = cutout?.let(::readTopCutout)
      }
    }
    updateOrigin(layoutChanged = true)
  }

  private fun updateOrigin(layoutChanged: Boolean) {
    val oldX = origin[0]
    val oldY = origin[1]
    if (bounds?.usesDisplayCoordinates == true) {
      getLocationOnScreen(origin)
    } else {
      getLocationInWindow(origin)
    }
    val moved = origin[0] != oldX || origin[1] != oldY
    // A pager can translate the whole tab without laying it out again. Wait
    // for that movement to settle before sending local coordinates to JS.
    if (moved && lastMeasurement != null) {
      removeCallbacks(report)
      awaitingStableOrigin = true
      postDelayed(report, 48L)
    } else if (layoutChanged && !awaitingStableOrigin) {
      publishMeasurement()
    }
  }

  private fun publishMeasurement() {
    if (!isAttachedToWindow || width == 0 || height == 0) return
    val density = resources.displayMetrics.density
    val rect = bounds?.rect?.let {
      CutoutRect(
        (it.left - origin[0]) / density,
        (it.top - origin[1]) / density,
        it.width() / density,
        it.height() / density
      )
    }
    val measurement = CutoutMeasurement(rect, width / density, height / density)
    if (measurement != lastMeasurement) {
      lastMeasurement = measurement
      onMeasurement(measurement)
    }
  }
}

@RequiresApi(Build.VERSION_CODES.P)
@Suppress("DEPRECATION")
private fun readTopCutout(cutout: DisplayCutout): CutoutBounds? {
  val rect = cutout.boundingRects.singleOrNull() ?: return null
  if (rect.isEmpty || rect.bottom > cutout.safeInsetTop) return null

  // Some vendors pad the reserved rectangle up to the top bezel. Android 12+
  // can also supply the physical contour in display (not window) coordinates.
  val path = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) cutout.cutoutPath else null
  val bounds = RectF(rect)
  if (path != null && !path.isEmpty) {
    if (PathMeasure(path, false).nextContour()) return null
    path.computeBounds(bounds, true)
    return CutoutBounds(bounds, usesDisplayCoordinates = true)
  }
  return CutoutBounds(bounds, usesDisplayCoordinates = false)
}
