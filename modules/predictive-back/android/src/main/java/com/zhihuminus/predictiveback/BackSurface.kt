package com.zhihuminus.predictiveback

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Outline
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import androidx.annotation.RequiresApi

private const val DESTINATION_PREVIEW_SCALE = 0.85f

@RequiresApi(33)
private class EdgeScale(val view: View, private val anchorRight: Boolean) {
  private val originalScaleX = view.scaleX
  private val originalScaleY = view.scaleY
  private val originalPivot = if (view.isPivotSet) PointF(view.pivotX, view.pivotY) else null

  fun apply(scale: Float) {
    view.pivotX = if (anchorRight) view.width.toFloat() else 0f
    view.pivotY = view.height / 2f
    view.scaleX = originalScaleX * scale
    view.scaleY = originalScaleY * scale
  }

  fun restore() {
    view.scaleX = originalScaleX
    view.scaleY = originalScaleY
    if (originalPivot == null) view.resetPivot() else {
      view.pivotX = originalPivot.x
      view.pivotY = originalPivot.y
    }
  }
}

/** Owns the dedicated Fabric hosts' visual properties for one gesture. */
@RequiresApi(33)
internal class BackSurface(
  private val view: View,
  destination: View?,
  private val cornerRadii: FloatArray,
  private val fromRight: Boolean,
) : View.OnAttachStateChangeListener {
  private val sourceScale = EdgeScale(view, anchorRight = !fromRight)
  private var destinationScale = destination?.let { EdgeScale(it, anchorRight = fromRight) }
  private val originalTranslation = view.translationX
  private val originalClip = view.clipToOutline
  private val originalOutline = view.outlineProvider
  private val path = Path()
  private val radii = FloatArray(8)
  private var scale = 1f
  private var released = false
  private var animator: ValueAnimator? = null
  var onRelease: (() -> Unit)? = null
  val attached get() = !released && view.isAttachedToWindow

  init {
    view.addOnAttachStateChangeListener(this)
    destinationScale?.let {
      it.view.addOnAttachStateChangeListener(this)
      it.apply(DESTINATION_PREVIEW_SCALE)
    }
    view.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val round = ((1f - scale) / 0.02f).coerceIn(0f, 1f)
        for (i in cornerRadii.indices) {
          radii[i * 2] = cornerRadii[i] * round
          radii[i * 2 + 1] = radii[i * 2]
        }
        path.rewind()
        path.addRoundRect(0f, 0f, view.width.toFloat(), view.height.toFloat(), radii, Path.Direction.CW)
        outline.setPath(path)
      }
    }
    view.clipToOutline = true
  }

  fun owns(candidate: View) = view === candidate || destinationScale?.view === candidate

  fun applyProgress(value: Float) {
    if (released) return
    applyScale(1f - 0.15f * value.coerceIn(0f, 1f))
  }

  private fun applyScale(value: Float) {
    scale = value
    sourceScale.apply(value)
    view.invalidateOutline()
  }

  fun settle(committing: Boolean, onEnd: () -> Unit) {
    stopAnimator()
    if (released || (!committing && scale == 1f)) {
      onEnd()
      return
    }
    val animation = if (committing) {
      // Map the held frame into its parent's viewport so its trailing edge ends
      // just outside, including any original translation or scale on this host.
      val viewport = view.parent as? View
      val viewportLeft = viewport?.scrollX ?: 0
      val viewportWidth = viewport?.width?.takeIf { it > 0 } ?: view.width
      val held = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
      view.matrix.mapRect(held)
      held.offset(view.left.toFloat(), view.top.toFloat())
      val remaining = if (fromRight) (viewportLeft - held.right).coerceAtMost(0f)
        else (viewportLeft + viewportWidth - held.left).coerceAtLeast(0f)
      ValueAnimator.ofFloat(view.translationX, view.translationX + remaining).apply {
        addUpdateListener {
          view.translationX = it.animatedValue as Float
          destinationScale?.apply(
            DESTINATION_PREVIEW_SCALE + (1f - DESTINATION_PREVIEW_SCALE) * it.animatedFraction,
          )
        }
      }
    } else {
      ValueAnimator.ofFloat(scale, 1f).apply {
        addUpdateListener { applyScale(it.animatedValue as Float) }
      }
    }
    animator = animation
    animation.duration = if (committing) 220L else 150L
    animation.interpolator = DecelerateInterpolator()
    animation.addListener(object : AnimatorListenerAdapter() {
      override fun onAnimationEnd(animation: Animator) {
        animator = null
        restoreDestination()
        onEnd()
      }
    })
    animation.start()
  }

  private fun stopAnimator() {
    animator?.removeAllListeners()
    animator?.removeAllUpdateListeners()
    animator?.cancel()
    animator = null
  }

  private fun restoreDestination() {
    destinationScale?.let {
      it.view.removeOnAttachStateChangeListener(this)
      it.restore()
    }
    destinationScale = null
  }

  fun restore() {
    if (released) return
    released = true
    stopAnimator()
    view.removeOnAttachStateChangeListener(this)
    sourceScale.restore()
    restoreDestination()
    view.translationX = originalTranslation
    view.clipToOutline = originalClip
    view.outlineProvider = originalOutline
    view.invalidateOutline()
    onRelease?.invoke()
    onRelease = null
  }

  override fun onViewAttachedToWindow(v: View) = Unit
  override fun onViewDetachedFromWindow(v: View) {
    if (v === view) restore() else restoreDestination()
  }
}
