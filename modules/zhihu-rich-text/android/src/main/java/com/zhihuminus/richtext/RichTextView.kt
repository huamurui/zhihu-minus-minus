package com.zhihuminus.richtext

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.graphics.Rect
import android.os.Build
import android.text.Layout
import android.text.Selection
import android.text.Spannable
import android.text.SpannableString
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.ScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

data class SelectionEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val start: Int,
  @Field val end: Int
) : Record

data class HeightEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val layoutKey: String,
  @Field val height: Double
) : Record

data class ActionEvent(
  @Field val flowId: String,
  @Field val textVersion: String,
  @Field val kind: String,
  @Field val id: String,
  @Field val start: Int,
  @Field val end: Int,
  @Field val url: String? = null
) : Record

private class AttachmentSlot(
  val spec: JSONObject, val span: InlineAttachmentSpan, val range: TextRange,
  val fontPx: Float, val maxWidth: Float, val scale: Float
) {
  val visibility = AttachmentVisibilityState()
  var request: AttachmentSubscription? = null
}

private data class AttachmentUpdate(
  val generation: Int, val revision: Int, val slot: AttachmentSlot, val asset: AttachmentAsset
)

/** One flow is one TextView, including all paragraph and attachment ranges. */
@SuppressLint("ViewConstructor")
class RichTextView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val onSelectionChange by EventDispatcher<SelectionEvent>()
  private val onHeightChange by EventDispatcher<HeightEvent>()
  private val onAction by EventDispatcher<ActionEvent>()
  private val textView = FlowTextView(context)
  private val density = resources.displayMetrics.density
  private val attachments = mutableListOf<AttachmentSlot>()
  private val viewportRect = Rect()
  private val screenLocation = IntArray(2)
  private var observedTree: ViewTreeObserver? = null
  private var lastViewportTop = Float.NaN
  private var lastViewportBottom = Float.NaN
  private var lastAttachmentLayout: Layout? = null
  private val viewportListener = ViewTreeObserver.OnPreDrawListener { synchronizeAttachments(); true }
  private val attachmentUpdates = mutableListOf<AttachmentUpdate>()
  private var attachmentFrameScheduled = false
  private val attachmentFrame = Runnable { applyAttachmentUpdates() }
  private var flow: FlowData? = null
  private var config = TextConfig()
  private val propBatch = RichTextPropBatch()
  private var layoutKey = ""
  private var contentWidthPx = 0
  private var generation = 0
  private var disposed = false
  private var suppressSelection = false
  private var lastHeightKey = ""
  private var lastSelectionKey = ""
  private var measuredTextHeight = 0
  private val fontScale: Float get() = resources.configuration.fontScale
  private val textScale: Float get() = density * fontScale

  init {
    ProcessAttachmentRequests.observeMemory(context)
    orientation = VERTICAL
    clipChildren = false
    clipToPadding = false
    addView(textView, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    textView.selectionListener = { start, end -> emitSelection(start, end) }
    textView.actionListener = { item, kind -> emitAction(item, kind) }
    textView.copyResolver = { start, end -> copyText(start, end) }
  }

  fun setFlowJson(value: String) {
    propBatch.update { it.copy(flowJson = value) }
  }

  fun setConfigJson(value: String) {
    propBatch.update { it.copy(configJson = value) }
  }

  fun setContentWidth(value: Float) {
    val pixels = if (value.isFinite()) ceil(value.coerceAtLeast(0f) * density).toInt() else 0
    propBatch.update { it.copy(contentWidthPx = pixels) }
  }

  fun setLayoutKey(value: String) {
    propBatch.update { it.copy(layoutKey = value) }
  }

  fun setSelectable(value: Boolean) {
    propBatch.update { it.copy(selectable = value) }
  }

  fun commitProps() {
    if (disposed) return
    val change = propBatch.commit() ?: return
    val props = change.current
    if (change.flowChanged) {
      flow = FlowData.parse(props.flowJson)
      lastSelectionKey = ""
    }
    if (change.configChanged) config = TextConfig.parse(props.configJson)
    contentWidthPx = props.contentWidthPx
    layoutKey = props.layoutKey
    // A new commit invalidates pending height events, including a key that
    // changes away and back. Reissue its measurement even if geometry is equal.
    lastHeightKey = ""
    suppressSelection = true
    if (textView.isTextSelectable != props.selectable) {
      textView.setTextIsSelectable(props.selectable)
      textView.isClickable = true
    }
    if (change.requiresRebuild) {
      rebuild()
    } else {
      suppressSelection = false
      emitSelection(textView.selectionStart, textView.selectionEnd)
      requestLayout()
      scheduleMeasurement()
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    measureText()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val desiredWidth = if (contentWidthPx > 0) contentWidthPx else max(1, right - left)
    textView.layout(0, 0, desiredWidth, measuredTextHeight)
  }

  fun dispose() {
    disposed = true
    observedTree?.takeIf { it.isAlive }?.removeOnPreDrawListener(viewportListener)
    observedTree = null
    generation += 1
    releaseAttachments()
    attachments.clear()
    textView.selectionListener = null
    textView.actionListener = null
    textView.copyResolver = null
    removeCallbacks(attachmentFrame)
    attachmentFrameScheduled = false
    attachmentUpdates.clear()
  }

  private fun rebuild() {
    if (disposed) return
    generation += 1
    lastHeightKey = ""
    val currentGeneration = generation
    releaseAttachments()
    attachments.clear()
    removeCallbacks(attachmentFrame)
    attachmentFrameScheduled = false
    attachmentUpdates.clear()
    val activeFlow = flow
    val oldFlow = textView.flow
    val selectedStart = textView.selectionStart
    val selectedEnd = textView.selectionEnd
    suppressSelection = true
    textView.flow = activeFlow
    textView.config = config
    textView.scale = textScale
    textView.setTextSize(TypedValue.COMPLEX_UNIT_PX, config.fontSize * textScale)
    textView.setTextColor(config.textColor)
    textView.gravity = Gravity.TOP or when (config.textAlign) {
      "center" -> Gravity.CENTER_HORIZONTAL
      "right" -> Gravity.RIGHT
      else -> Gravity.LEFT
    }
    textView.highlightColor = (config.linkColor and 0x00ffffff) or 0x44000000
    // Native line breaking supplies punctuation boundaries and Latin word wrapping.
    textView.breakStrategy = Layout.BREAK_STRATEGY_HIGH_QUALITY
    textView.hyphenationFrequency = Layout.HYPHENATION_FREQUENCY_NONE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      textView.justificationMode = if (config.justify) Layout.JUSTIFICATION_MODE_INTER_WORD else Layout.JUSTIFICATION_MODE_NONE
    }
    if (activeFlow == null) {
      textView.text = ""
      suppressSelection = false
      requestLayout()
      return
    }
    val content = SpannableString(activeFlow.text)
    fun apply(span: Any, range: TextRange) {
      content.setSpan(span, range.start, range.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    if (content.isNotEmpty()) {
      apply(ParagraphHeightSpan(TextRange(0, content.length), px(config.lineHeight), 0, 0), TextRange(0, content.length))
    }
    for (spec in activeFlow.spans) {
      val range = spec.range(activeFlow.text) ?: continue
      when (spec.optString("kind")) {
        "strong" -> apply(StyleSpan(Typeface.BOLD), range)
        "emphasis" -> apply(StyleSpan(Typeface.ITALIC), range)
        "underline" -> apply(UnderlineSpan(), range)
        "strikethrough" -> apply(StrikethroughSpan(), range)
        "highlight" -> apply(BackgroundColorSpan(parseColor(spec.optString("color"), 0x33f4c542)), range)
        "subscript" -> apply(ScriptSpan(false), range)
        "superscript" -> apply(ScriptSpan(true), range)
        "code" -> {
          apply(MonoSpan(), range)
          apply(BackgroundColorSpan((config.secondaryColor and 0x00ffffff) or 0x16000000), range)
        }
        "link" -> {
          apply(ForegroundColorSpan(parseColor(spec.optString("color"), config.linkColor)), range)
          apply(UnderlineSpan(), range)
        }
      }
    }
    for ((index, spec) in activeFlow.paragraphs.withIndex()) {
      val range = spec.range(activeFlow.text) ?: continue
      val kind = spec.optString("kind")
      val marginTop = spec.number("marginTop", if (kind == "heading" && index > 0) 8.0 else 0.0).toFloat()
      val marginBottom = spec.number("marginBottom", if (index < activeFlow.paragraphs.lastIndex) config.paragraphSpacing.toDouble() else 0.0).toFloat()
      val headingScale = when (spec.number("level", 2.0)) { 1.0 -> 1.55f; 2.0 -> 1.35f; else -> 1.15f }
      var lineHeight = config.lineHeight
      when (kind) {
        "heading" -> {
          // The compiler supplies the same heading metrics as the other backends.
          // Retain the original heuristic only for flows created by older clients.
          val headingFontSize = spec.number("fontSize", Double.NaN).toFloat()
            .takeIf { it.isFinite() && it > 0f } ?: config.fontSize * headingScale
          apply(RelativeSizeSpan(headingFontSize / config.fontSize), range)
          apply(StyleSpan(Typeface.BOLD), range)
          lineHeight = spec.number("lineHeight", Double.NaN).toFloat()
            .takeIf { it.isFinite() && it > 0f } ?: max(config.lineHeight, headingFontSize * 1.45f)
        }
        "quote" -> {
          val continuesQuote = activeFlow.paragraphs.getOrNull(index + 1)?.optString("kind") == "quote"
          apply(QuoteMarginSpan(range, config.secondaryColor, px(2f), px(10f), if (continuesQuote) 0 else px(marginBottom)), range)
          apply(ForegroundColorSpan(config.secondaryColor), range)
        }
        "listItem" -> apply(LeadingMarginSpan.Standard(px(spec.number("indent", 18.0).toFloat())), range)
        "code" -> {
          apply(MonoSpan(), range)
          apply(RelativeSizeSpan(0.9f), range)
          apply(BackgroundColorSpan((config.secondaryColor and 0x00ffffff) or 0x16000000), range)
        }
      }
      apply(ParagraphHeightSpan(range, px(lineHeight), px(marginTop), px(marginBottom)), range)
    }
    val maxAttachmentWidth = max(1f, if (contentWidthPx > 0) contentWidthPx.toFloat() else resources.displayMetrics.widthPixels.toFloat())
    val fontPx = config.fontSize * textScale
    for (spec in activeFlow.attachments) {
      val range = spec.range(activeFlow.text) ?: continue
      if (range.end - range.start != 1 || content[range.start] != '\ufffc') continue
      val span = InlineAttachmentSpan(spec, textScale, fontPx, maxAttachmentWidth, config.secondaryColor, config.textColor)
      apply(span, range)
      attachments.add(AttachmentSlot(spec, span, range, fontPx, maxAttachmentWidth, textScale))
    }
    textView.setText(content, android.widget.TextView.BufferType.SPANNABLE)
    if (oldFlow != null && oldFlow.id == activeFlow.id && oldFlow.textVersion == activeFlow.textVersion && selectedStart >= 0 && selectedEnd >= 0) {
      (textView.text as? Spannable)?.let {
        Selection.setSelection(it, selectedStart.coerceAtMost(it.length), selectedEnd.coerceAtMost(it.length))
      }
    }
    suppressSelection = false
    emitSelection(textView.selectionStart, textView.selectionEnd)
    requestLayout()
    scheduleMeasurement()
    post { if (!disposed && generation == currentGeneration) synchronizeAttachments() }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    observedTree?.takeIf { it.isAlive }?.removeOnPreDrawListener(viewportListener)
    observedTree = viewTreeObserver.also { it.addOnPreDrawListener(viewportListener) }
    post { synchronizeAttachments() }
  }

  override fun onDetachedFromWindow() {
    observedTree?.takeIf { it.isAlive }?.removeOnPreDrawListener(viewportListener)
    observedTree = null
    releaseAttachments()
    super.onDetachedFromWindow()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (visibility != View.VISIBLE) releaseAttachments() else post { synchronizeAttachments() }
  }

  private fun releaseAttachments() {
    lastAttachmentLayout = null
    var changed = false
    for (slot in attachments) {
      changed = slot.visibility.setActive(false) || changed
      slot.request?.cancel()
      slot.request = null
      slot.span.releaseAsset()
    }
    attachmentUpdates.clear()
    if (changed) textView.invalidate()
  }

  private fun synchronizeAttachments() {
    if (attachments.isEmpty()) return
    if (disposed || !isAttachedToWindow || windowVisibility != View.VISIBLE || !isShown) {
      releaseAttachments(); return
    }
    val layout = textView.layout ?: return
    // The outer ScrollView owns clipping. Its window rect remains available even
    // when this flow is completely outside it, allowing one viewport of prefetch.
    var ancestor = parent
    var viewport: View = rootView
    while (ancestor is View) {
      if (ancestor is ScrollView) { viewport = ancestor; break }
      ancestor = ancestor.parent
    }
    if (!viewport.getGlobalVisibleRect(viewportRect)) { releaseAttachments(); return }
    textView.getLocationOnScreen(screenLocation)
    val preload = viewportRect.height().toFloat()
    val top = viewportRect.top - screenLocation[1] - textView.totalPaddingTop - preload
    val bottom = viewportRect.bottom - screenLocation[1] - textView.totalPaddingTop + preload
    if (lastAttachmentLayout === layout && lastViewportTop == top && lastViewportBottom == bottom) return
    lastAttachmentLayout = layout; lastViewportTop = top; lastViewportBottom = bottom
    for (slot in attachments) {
      val line = layout.getLineForOffset(slot.range.start)
      val active = intersectsAttachmentViewport(layout.getLineTop(line).toFloat(), layout.getLineBottom(line).toFloat(), top, bottom)
      if (slot.visibility.setActive(active) && !active) {
        slot.request?.cancel(); slot.request = null; slot.span.releaseAsset(); textView.invalidate()
      }
      val revision = slot.visibility.beginLoad() ?: continue
      val currentGeneration = generation
      val key = assetKey(slot.spec, slot.fontPx, slot.maxWidth)
      slot.request = ProcessAttachmentRequests.subscribe(key, slot.spec, slot.scale, slot.fontPx, slot.maxWidth) { asset ->
        post {
          if (!disposed && generation == currentGeneration && slot.visibility.accepts(revision)) {
            slot.request = null
            if (asset != null) {
              attachmentUpdates.add(AttachmentUpdate(currentGeneration, revision, slot, asset))
              if (!attachmentFrameScheduled) { attachmentFrameScheduled = true; postOnAnimation(attachmentFrame) }
            }
          }
        }
      }
    }
  }

  private fun applyAttachmentUpdates() {
    attachmentFrameScheduled = false
    val updates = attachmentUpdates.filter { it.generation == generation && it.slot.visibility.accepts(it.revision) }
    attachmentUpdates.clear()
    if (disposed || updates.isEmpty()) return
    lastAttachmentLayout = null
    for (update in updates) { update.slot.span.setAsset(update.asset); update.slot.visibility.hasAsset = true }
    // All completions received during this frame update the layout once, retaining selection.
    // Mutating ReplacementSpan metrics alone does not invalidate TextView's cached Layout.
    val start = textView.selectionStart
    val end = textView.selectionEnd
    suppressSelection = true
    textView.setText(SpannableString(textView.text), android.widget.TextView.BufferType.SPANNABLE)
    if (start >= 0 && end >= 0) {
      (textView.text as? Spannable)?.let {
        Selection.setSelection(it, start.coerceAtMost(it.length), end.coerceAtMost(it.length))
      }
    }
    suppressSelection = false
    textView.requestLayout()
    textView.invalidate()
    requestLayout()
    measureText()
    synchronizeAttachments()
  }

  private fun measureText() {
    if (disposed || propBatch.hasPending) return
    val desiredWidth = if (contentWidthPx > 0) contentWidthPx else max(1, measuredWidth)
    textView.measure(View.MeasureSpec.makeMeasureSpec(desiredWidth, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    measuredTextHeight = textView.measuredHeight
    val activeFlow = flow ?: return
    val currentLayoutKey = layoutKey
    val currentGeneration = generation
    val currentRevision = propBatch.revision
    val key = "${activeFlow.id}:${activeFlow.textVersion}:$currentLayoutKey:$measuredTextHeight"
    if (key == lastHeightKey) return
    lastHeightKey = key
    val event = HeightEvent(activeFlow.id, activeFlow.textVersion, currentLayoutKey, measuredTextHeight / density.toDouble())
    post {
      if (!disposed && generation == currentGeneration && propBatch.accepts(currentRevision) && layoutKey == currentLayoutKey && lastHeightKey == key) {
        onHeightChange(event)
      }
    }
  }

  private fun scheduleMeasurement() {
    val currentGeneration = generation
    val currentRevision = propBatch.revision
    post {
      if (!disposed && generation == currentGeneration && propBatch.accepts(currentRevision)) measureText()
    }
  }

  private fun emitSelection(start: Int, end: Int) {
    if (disposed || suppressSelection) return
    val activeFlow = flow ?: return
    val range = if (textView.isTextSelectable) richTextRange(min(start, end), max(start, end), activeFlow.text) else null
    val normalizedStart = range?.start ?: -1
    val normalizedEnd = range?.end ?: -1
    val key = "${activeFlow.id}:${activeFlow.textVersion}:$normalizedStart:$normalizedEnd"
    if (key == lastSelectionKey) return
    lastSelectionKey = key
    onSelectionChange(SelectionEvent(activeFlow.id, activeFlow.textVersion, normalizedStart, normalizedEnd))
  }

  private fun emitAction(spec: JSONObject, kind: String) {
    val activeFlow = flow ?: return
    val range = spec.range(activeFlow.text) ?: return
    val id = when (kind) {
      "link" -> spec.opt("nodeId") as? String
      "segment" -> spec.opt("actionId") as? String
      else -> spec.opt("id") as? String
    } ?: return
    val url = (spec.opt("url") as? String)?.takeIf { it.isNotBlank() }
    onAction(ActionEvent(activeFlow.id, activeFlow.textVersion, kind, id, range.start, range.end, url))
  }

  private fun copyText(start: Int, end: Int): String {
    val activeFlow = flow ?: return ""
    val slots = activeFlow.attachments.mapNotNull { attachment ->
      val range = attachment.range(activeFlow.text) ?: return@mapNotNull null
      RichTextCopySlot(range, attachment.opt("copyText") as? String ?: attachment.opt("latex") as? String ?: attachment.opt("alt") as? String ?: "[图片]")
    }
    return richTextSelectionText(activeFlow.text, start, end, slots) ?: ""
  }

  private fun px(dp: Float): Int = ceil(dp.coerceAtLeast(0f) * textScale).toInt()
  private fun assetKey(spec: JSONObject, fontPx: Float, maxWidth: Float): String = "${spec.optString("kind")}|${spec.optString("url")}|${spec.number("width")}|${spec.number("height")}|$fontPx|$maxWidth|$textScale"
}
