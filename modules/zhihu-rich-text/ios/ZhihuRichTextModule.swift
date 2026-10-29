import ExpoModulesCore

public final class ZhihuRichTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZhihuRichText")

    View(RichTextView.self) {
      Events("onSelectionChange", "onHeightChange", "onAction")

      Prop("flowJson") { (view: RichTextView, value: String) in
        view.setFlowJson(value)
      }
      Prop("configJson") { (view: RichTextView, value: String) in
        view.setConfigJson(value)
      }
      Prop("contentWidth") { (view: RichTextView, value: Double) in
        view.setContentWidth(value)
      }
      Prop("layoutKey") { (view: RichTextView, value: String) in
        view.setLayoutKey(value)
      }
      Prop("nativeAutoSize") { (view: RichTextView, value: Bool) in
        view.setNativeAutoSize(value)
      }
      Prop("performanceTracing") { (view: RichTextView, value: Bool) in
        view.setPerformanceTracing(value)
      }
      Prop("selectable") { (view: RichTextView, value: Bool) in
        view.setSelectable(value)
      }
      Prop("suppressDoubleTapSelection") { (view: RichTextView, value: Bool) in
        view.setSuppressDoubleTapSelection(value)
      }
      OnViewDidUpdateProps { (view: RichTextView) in
        view.applyPendingProps()
      }
    }
  }
}
