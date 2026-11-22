package com.zhihuminus.predictiveback

import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactActivity
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PredictiveBackModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var window: BackWindow? = null
  private var foreground = true
  private var destroyed = false
  private var hasBackHandler = false
  private var allowHomePreview = false
  private var target: String? = null
  private var gestureId = 0

  override fun definition() = ModuleDefinition {
    Name("ZhihuPredictiveBack")
    Events("onBackGesture")
    View(BackSwipeHost::class) {
      Prop("allowContentSwipe") { view: BackSwipeHost, enabled: Boolean ->
        view.allowContentSwipe = enabled
      }
    }

    Function("setTarget") { routeKey: String? ->
      onMain {
        target = routeKey
        refresh()
      }
    }
    Function("setBackHandlerEnabled") { enabled: Boolean, previewHome: Boolean ->
      onMain {
        hasBackHandler = enabled
        allowHomePreview = previewHome
        refresh()
      }
    }
    Function("releaseSurface") { gestureId: Int ->
      onMain {
        if (Build.VERSION.SDK_INT >= 34) window?.releaseSurface(gestureId)
      }
    }
    OnActivityEntersForeground {
      onMain {
        foreground = true
        refresh()
      }
    }
    OnActivityEntersBackground {
      onMain {
        foreground = false
        detach()
      }
    }
    OnActivityDestroys { onMain { detach() } }
    OnDestroy {
      onMain {
        destroyed = true
        detach()
      }
    }
  }

  internal fun edgeSwipeFor(view: BackSwipeHost): EdgeSwipe? =
    if (Build.VERSION.SDK_INT >= 34) window?.edgeSwipeFor(view) else null

  private fun onMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post(action)
  }

  private fun refresh() {
    if (Build.VERSION.SDK_INT < 33 || !foreground || destroyed) return
    val activity = appContext.currentActivity as? ReactActivity ?: return
    if (activity.isDestroyed || activity.isFinishing) return
    if (window?.activity !== activity) {
      detach()
      window = BackWindow(activity, { ++gestureId }) { event ->
        if (!destroyed) sendEvent("onBackGesture", event)
      }
    }
    window?.configure(target, hasBackHandler, allowHomePreview)
  }

  private fun detach() {
    if (Build.VERSION.SDK_INT >= 33) window?.close()
    window = null
  }
}
