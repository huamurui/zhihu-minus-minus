package com.zhihuminus.richtext

internal data class RichTextViewProps(
  val flowJson: String = "",
  val configJson: String = "",
  val contentWidthPx: Int = 0,
  val layoutKey: String = "",
  val selectable: Boolean = true
)

internal data class RichTextPropChange(val previous: RichTextViewProps, val current: RichTextViewProps) {
  val flowChanged: Boolean get() = previous.flowJson != current.flowJson
  val configChanged: Boolean get() = previous.configJson != current.configJson
  val requiresRebuild: Boolean get() = flowChanged || configChanged || previous.contentWidthPx != current.contentWidthPx
}

/** Setters stage values; only the completed Expo props transaction becomes visible. */
internal class RichTextPropBatch {
  var current = RichTextViewProps(); private set
  private var pending = current
  var hasPending = false; private set
  var revision = 0; private set

  fun update(transform: (RichTextViewProps) -> RichTextViewProps) {
    pending = transform(pending)
    hasPending = pending != current
  }

  fun commit(): RichTextPropChange? {
    if (!hasPending) return null
    val change = RichTextPropChange(current, pending)
    current = pending
    hasPending = false
    revision += 1
    return change
  }

  fun accepts(committedRevision: Int): Boolean = !hasPending && revision == committedRevision
}
