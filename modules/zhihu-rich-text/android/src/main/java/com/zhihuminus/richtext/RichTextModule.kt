package com.zhihuminus.richtext

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RichTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZhihuRichText")

    View(RichTextView::class) {
      Events("onSelectionChange", "onHeightChange", "onAction")

      Prop("flowJson") { view: RichTextView, value: String -> view.setFlowJson(value) }
      Prop("configJson") { view: RichTextView, value: String -> view.setConfigJson(value) }
      Prop("contentWidth") { view: RichTextView, value: Float -> view.setContentWidth(value) }
      Prop("layoutKey") { view: RichTextView, value: String -> view.setLayoutKey(value) }
      Prop("selectable") { view: RichTextView, value: Boolean -> view.setSelectable(value) }

      OnViewDidUpdateProps { view: RichTextView -> view.commitProps() }
      OnViewDestroys { view: RichTextView -> view.dispose() }
    }
  }
}
