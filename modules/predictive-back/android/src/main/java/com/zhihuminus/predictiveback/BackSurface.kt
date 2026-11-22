package com.zhihuminus.predictiveback

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Outline
import android.graphics.Path
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import androidx.annotation.RequiresApi

/** Owns only the dedicated Fabric host's visual properties for one gesture. */
@RequiresApi(33)
internal class BackSurface(
  val view: View,
  private val cornerRadii: FloatArray,
  fromRight: Boolean,
  followsFinger: Boolean,
) : View.OnAttachStateChangeListener {
  private val originalTranslation = view.translationX
  private val originalScaleX = view.scaleX
  private val originalScaleY = view.scaleY
  private val originalAlpha = view.alpha
  private val originalClip = view.clipToOutline
  private val originalOutline = view.outlineProvider
  private val travel = (if (fromRight) -1f else 1f) * (if (followsFinger) 1f else 0.18f)
  private val path = Path()
  private val radii = FloatArray(8)
  private var progress = 0f
  private var released = false
  private var animator: ValueAnimator? = null
  var onRelease: (() -> Unit)? = null
  val attached get() = !released && view.isAttachedToWindow

  init {
    view.addOnAttachStateChangeListener(this)
    view.outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val round = (progress / 0.2f).coerceAtMost(1f)
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

  fun applyProgress(value: Float) {
    if (released) return
    progress = value.coerceIn(0f, 1f)
    val scale = 1f - 0.1f * progress
    view.scaleX = originalScaleX * scale
    view.scaleY = originalScaleY * scale
    view.translationX = originalTranslation + travel * view.width * progress
    view.alpha = originalAlpha * if (progress < 0.8f) {
      1f - 0.15f * progress / 0.8f
    } else {
      0.85f * (1f - progress) / 0.2f
    }
    view.invalidateOutline()
  }

  fun settle(target: Float, durationMs: Long, onEnd: () -> Unit) {
    stopAnimator()
    if (released || progress == target) {
      onEnd()
      return
    }
    val animation = ValueAnimator.ofFloat(progress, target)
    animator = animation
    animation.duration = durationMs
    animation.interpolator = DecelerateInterpolator()
    animation.addUpdateListener { applyProgress(it.animatedValue as Float) }
    animation.addListener(object : AnimatorListenerAdapter() {
      override fun onAnimationEnd(animation: Animator) {
        animator = null
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

  fun restore() {
    if (released) return
    released = true
    stopAnimator()
    view.removeOnAttachStateChangeListener(this)
    view.translationX = originalTranslation
    view.scaleX = originalScaleX
    view.scaleY = originalScaleY
    view.alpha = originalAlpha
    view.clipToOutline = originalClip
    view.outlineProvider = originalOutline
    view.invalidateOutline()
    onRelease?.invoke()
    onRelease = null
  }

  override fun onViewAttachedToWindow(v: View) = Unit
  override fun onViewDetachedFromWindow(v: View) = restore()
}
