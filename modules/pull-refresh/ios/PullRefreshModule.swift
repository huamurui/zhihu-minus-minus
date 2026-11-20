import ExpoModulesCore

public final class PullRefreshModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PullRefresh")

    View(PullRefreshView.self) {
      Events("onPull", "onRefreshTriggered")

      Prop("enabled") { (view: PullRefreshView, enabled: Bool) in
        view.setPullEnabled(enabled)
      }

      Prop("hapticsEnabled") { (view: PullRefreshView, enabled: Bool) in
        view.setHapticsEnabled(enabled)
      }

      Prop("hapticTickPositions") { (view: PullRefreshView, positions: [Double]) in
        view.setHapticTickPositions(positions)
      }

      Prop("refreshing") { (view: PullRefreshView, refreshing: Bool) in
        view.setRefreshing(refreshing)
      }

      Prop("threshold") { (view: PullRefreshView, threshold: Double) in
        view.setThreshold(threshold)
      }

      Prop("holdDistance") { (view: PullRefreshView, distance: Double) in
        view.setHoldDistance(distance)
      }

      Prop("maxPullDistance") { (view: PullRefreshView, distance: Double) in
        view.setMaxPullDistance(distance)
      }

    }
  }
}
