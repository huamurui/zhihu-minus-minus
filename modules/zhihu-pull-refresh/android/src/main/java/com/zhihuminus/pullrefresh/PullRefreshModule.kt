package com.zhihuminus.pullrefresh

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PullRefreshModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZhihuPullRefresh")

    View(PullRefreshView::class) {
      Events("onPull", "onRefreshTriggered")

      Prop("enabled") { view: PullRefreshView, enabled: Boolean ->
        view.setPullEnabled(enabled)
      }

      Prop("hapticsEnabled") { view: PullRefreshView, hapticsEnabled: Boolean ->
        view.setHapticsEnabled(hapticsEnabled)
      }

      Prop("refreshing") { view: PullRefreshView, refreshing: Boolean ->
        view.setRefreshing(refreshing)
      }

      Prop("threshold") { view: PullRefreshView, threshold: Float ->
        view.setThreshold(threshold)
      }

      Prop("holdDistance") { view: PullRefreshView, holdDistance: Float ->
        view.setHoldDistance(holdDistance)
      }

      Prop("maxPullDistance") { view: PullRefreshView, maxPullDistance: Float ->
        view.setMaxPullDistance(maxPullDistance)
      }

      OnViewDestroys { view: PullRefreshView ->
        view.dispose()
      }
    }
  }
}
