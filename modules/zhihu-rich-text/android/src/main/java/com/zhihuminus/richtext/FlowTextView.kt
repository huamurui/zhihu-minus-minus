package com.zhihuminus.richtext

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.text.Layout
import android.os.SystemClock
import android.view.GestureDetector
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.TextView
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal class FlowTextView(context: Context) : TextView(context) {
  // TextView may call onSelectionChanged during its own constructor.
  private var ready = false
  var selectionListener: ((Int, Int) -> Unit)? = null
  var actionListener: ((JSONObject, String) -> Unit)? = null
  var copyResolver: ((Int, Int) -> String)? = null
  var flow: FlowData? = null
  var config: TextConfig = TextConfig()
  var suppressDoubleTapSelection = false
  var scale = resources.displayMetrics.density
  private val decorationPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val decorationPath = Path()
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var downX = 0f
  private var downY = 0f
  private var moved = false
  private var longPressed = false
  private var hadSelection = false
  private var handlingTouchEvent = false
  private var touchX = 0f
  private var touchY = 0f
  private var hostOwnsTouch = false
  private var hostTouchCancelled = false
  private var nativeSelectionStarted = false
  private val readingGestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
    override fun onDown(event: MotionEvent): Boolean = true

    override fun onSingleTapUp(event: MotionEvent): Boolean {
      if (!hostTouchCancelled && !longPressed && !hasSelection()) dispatchTapAction(event.x, event.y)
      return true
    }

    override fun onLongPress(event: MotionEvent) {
      beginNativeSelection(event)
    }
  }).apply {
    // The reading-area recognizer owns double taps. Each press must still be
    // eligible for a normal system long press, including the second press.
    setOnDoubleTapListener(null)
  }
  private val suppressTouchFocusScroll: Boolean
    get() = handlingTouchEvent && !moved && !longPressed && !hadSelection

  init {
    setPadding(0, 0, 0, 0)
    includeFontPadding = false
    setTextIsSelectable(true)
    isClickable = true
    ready = true
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    if (ready) selectionListener?.invoke(selStart, selEnd)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    touchX = event.x
    touchY = event.y
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        if (hostOwnsTouch) cancelReadingGesture()
        downX = event.x
        downY = event.y
        moved = false
        longPressed = false
        hadSelection = selectionStart >= 0 && selectionEnd >= 0 && selectionStart != selectionEnd
        hostOwnsTouch = suppressDoubleTapSelection && isTextSelectable && !hadSelection &&
          event.pointerCount == 1 && event.isFromSource(InputDevice.SOURCE_TOUCHSCREEN) &&
          event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER
        hostTouchCancelled = false
        nativeSelectionStarted = false
      }
      MotionEvent.ACTION_MOVE -> {
        if (abs(event.x - downX) > touchSlop || abs(event.y - downY) > touchSlop) moved = true
      }
    }
    if (hostOwnsTouch) {
      if (!nativeSelectionStarted && event.pointerCount > 1 && !hostTouchCancelled) {
        hostTouchCancelled = true
        cancelReadingGesture()
      }
      if (!hostTouchCancelled) readingGestureDetector.onTouchEvent(event)
      if (!nativeSelectionStarted) {
        // Short touches never enter Editor's built-in double-tap selection.
        // Parents still receive the original stream and may take over scrolling.
        finishHostTouchIfNeeded(event)
        return true
      }
    }
    handlingTouchEvent = true
    val handled = try {
      super.onTouchEvent(event)
    } finally {
      handlingTouchEvent = false
    }
    finishHostTouchIfNeeded(event)
    if (event.actionMasked == MotionEvent.ACTION_UP && !moved && !longPressed && !hadSelection) {
      if (!hasSelection() && dispatchTapAction(event.x, event.y)) return true
    }
    return handled
  }

  private fun beginNativeSelection(event: MotionEvent) {
    if (!hostOwnsTouch || hostTouchCancelled || nativeSelectionStarted || hasSelection() || !isTextSelectable || !isAttachedToWindow) return
    nativeSelectionStarted = true
    // Hand the confirmed long press to TextView so its selection handles and
    // subsequent drag stay native. Cancel the timer started by this replay.
    val down = MotionEvent.obtain(event)
    // Initial focus still reveals just the touched pixel, as on a normal DOWN.
    handlingTouchEvent = true
    longPressed = false
    try {
      down.action = MotionEvent.ACTION_DOWN
      super.onTouchEvent(down)
    } finally {
      handlingTouchEvent = false
      longPressed = true
      cancelLongPress()
      down.recycle()
    }
    // Older Editors may already select on the replayed DOWN after a previous
    // selection gesture. A second long click would start dragging that text.
    if (hasSelection()) dispatchAttachmentLongPress() else performLongClick()
  }

  private fun finishHostTouchIfNeeded(event: MotionEvent) {
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      hostOwnsTouch = false
      hostTouchCancelled = false
      nativeSelectionStarted = false
    }
  }

  private fun cancelReadingGesture() {
    val now = SystemClock.uptimeMillis()
    val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0)
    try {
      readingGestureDetector.onTouchEvent(cancel)
    } finally {
      cancel.recycle()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (isTextSelectable && layout != null) {
      // A flow can be measured before Pager attaches it to the window. Android's
      // Editor then caches disabled selection controllers because its root is
      // not a window yet; attachment alone does not refresh that cached state.
      // This public setter refreshes the controllers without replacing text,
      // movement method or an existing selection. Restore the cursor preference
      // synchronously, before the next draw.
      val cursorVisible = isCursorVisible
      setCursorVisible(!cursorVisible)
      setCursorVisible(cursorVisible)
    }
  }

  override fun onDetachedFromWindow() {
    cancelReadingGesture()
    hostOwnsTouch = false
    hostTouchCancelled = false
    nativeSelectionStarted = false
    super.onDetachedFromWindow()
  }

  private fun dispatchTapAction(x: Float, y: Float): Boolean {
    val action = findActionAt(x, y) ?: return false
    actionListener?.invoke(action.first, action.second)
    return true
  }

  override fun getDrawingRect(outRect: Rect) {
    super.getDrawingRect(outRect)
    if (!suppressTouchFocusScroll || width <= 0 || height <= 0 || !touchX.isFinite() || !touchY.isFinite()) return
    // ReactScrollView reveals this rectangle when TextView takes focus. During
    // an ordinary touch, reveal only the touched pixel, not the entire flow.
    // Focus still propagates unchanged; selection, keyboard and accessibility
    // requests outside this synchronous touch keep the normal drawing bounds.
    val x = outRect.left + touchX.toInt().coerceIn(0, width - 1)
    val y = outRect.top + touchY.toInt().coerceIn(0, height - 1)
    outRect.set(x, y, x + 1, y + 1)
  }

  override fun performLongClick(): Boolean {
    longPressed = true
    val handled = super.performLongClick()
    dispatchAttachmentLongPress()
    return handled
  }

  private fun dispatchAttachmentLongPress() {
    val action = findActionAt(downX, downY)
    if (action?.second == "attachment") actionListener?.invoke(action.first, "attachmentLongPress")
  }

  override fun onTextContextMenuItem(id: Int): Boolean {
    if (id == android.R.id.copy && selectionStart >= 0 && selectionStart != selectionEnd) {
      val start = min(selectionStart, selectionEnd)
      val end = max(selectionStart, selectionEnd)
      val copy = copyResolver?.invoke(start, end)
      if (copy != null) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.setPrimaryClip(ClipData.newPlainText("", copy))
        // Keep the system action mode and selection lifecycle intact.
        clearFocus()
        return true
      }
    }
    return super.onTextContextMenuItem(id)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val activeFlow = flow ?: return
    val textLayout = layout ?: return
    canvas.save()
    canvas.translate(totalPaddingLeft.toFloat() - scrollX, totalPaddingTop.toFloat() - scrollY)
    for (decoration in activeFlow.decorations) {
      val range = decoration.range(activeFlow.text) ?: continue
      val lastCharacter = lastVisibleCharacter(activeFlow.text, range) ?: continue
      val firstLine = textLayout.getLineForOffset(range.start)
      val lastLine = textLayout.getLineForOffset(lastCharacter)
      val icon = config.commentIcon?.takeIf { decoration.optBoolean("hasComments") && it.path != null }
      val marker = icon?.let { commentMarkerBounds(decoration, lastCharacter, textLayout) }
      decorationPaint.color = parseColor(decoration.optString("color"), config.linkColor)
      decorationPaint.strokeWidth = (decoration.number("thickness", 1.2).toFloat() * scale).coerceAtLeast(1f)
      decorationPaint.style = Paint.Style.STROKE
      decorationPaint.strokeCap = Paint.Cap.BUTT
      val kind = decoration.optString("kind", "solid")
      decorationPaint.pathEffect = when (kind) {
        "dashed" -> DashPathEffect(floatArrayOf(4f * scale, 3f * scale), 0f)
        "dotted" -> DashPathEffect(floatArrayOf(scale, 2.5f * scale), 0f)
        else -> null
      }
      if (kind == "dotted") decorationPaint.strokeCap = Paint.Cap.ROUND
      for (line in firstLine..lastLine) {
        val start = max(range.start, textLayout.getLineStart(line))
        var end = min(range.end, textLayout.getLineEnd(line))
        while (end > start && activeFlow.text[end - 1] == '\n') end -= 1
        if (end <= start) continue
        val startX = textLayout.getPrimaryHorizontal(start)
        val endX = visualEndHorizontal(end, line)
        var left = min(startX, endX)
        var right = max(startX, endX)
        if (line == lastLine && marker != null) {
          if (textLayout.isRtlCharAt(lastCharacter)) left = max(left, marker.right)
          else right = min(right, marker.left)
          if (right <= left) continue
        }
        val y = textLayout.getLineBaseline(line) + decoration.number("offset", 3.0).toFloat() * scale
        if (kind == "wavy") {
          decorationPath.reset()
          decorationPath.moveTo(left, y)
          var x = left
          val halfWave = max(2f, 2.8f * scale)
          var direction = -1f
          while (x < right) {
            val next = min(right, x + halfWave)
            decorationPath.quadTo((x + next) / 2f, y + direction * 2f * scale, next, y)
            x = next
            direction *= -1f
          }
          canvas.drawPath(decorationPath, decorationPaint)
        } else {
          canvas.drawLine(left, y, right, y, decorationPaint)
        }
      }
      if (icon != null && marker != null) {
        val path = icon.path ?: continue
        decorationPaint.pathEffect = null
        decorationPaint.style = Paint.Style.FILL
        val iconScale = marker.width() / icon.viewBoxSize
        canvas.save()
        canvas.translate(marker.left, marker.top)
        canvas.scale(iconScale, iconScale)
        canvas.drawPath(path, decorationPaint)
        canvas.restore()
      }
    }
    decorationPaint.pathEffect = null
    canvas.restore()
  }

  private fun lastVisibleCharacter(text: String, range: TextRange): Int? {
    var index = range.end - 1
    while (index >= range.start && text[index] == '\n') index--
    return index.takeIf { it >= range.start }
  }

  // Query the current Layout both for painting and tapping. TextView can reuse its
  // display list or replace the Layout between a draw and the next touch event.
  private fun commentMarkerBounds(
    spec: JSONObject, lastCharacter: Int, textLayout: Layout, includeTouchArea: Boolean = false
  ): RectF? {
    val icon = config.commentIcon ?: return null
    val lastLine = textLayout.getLineForOffset(lastCharacter)
    val endX = visualEndHorizontal(lastCharacter + 1, lastLine)
    val underlineY = textLayout.getLineBaseline(lastLine) + spec.number("offset", 3.0).toFloat() * scale
    val rtl = textLayout.isRtlCharAt(lastCharacter)
    val size = minOf(icon.size * scale, textLayout.width.toFloat(), textLayout.height.toFloat())
    val inset = icon.insetX * scale
    val x = (if (rtl) endX + inset else endX - inset - size).coerceIn(0f, textLayout.width - size)
    val y = (underlineY + icon.offsetY * scale).coerceIn(0f, textLayout.height - size)
    val bounds = RectF(x, y, x + size, y + size)
    if (includeTouchArea) {
      // Keep the original tappable area at the underline end even when the icon is moved or shrunk.
      val width = min(8f * scale, textLayout.width.toFloat())
      val height = min(6f * scale, textLayout.height.toFloat())
      val left = (if (rtl) endX else endX - width).coerceIn(0f, textLayout.width - width)
      val top = (underlineY - 2f * scale).coerceIn(0f, textLayout.height - height)
      bounds.union(left, top, left + width, top + height)
    }
    return bounds
  }

  private fun findActionAt(x: Float, y: Float): Pair<JSONObject, String>? {
    val activeFlow = flow ?: return null
    val textLayout = layout ?: return null
    val localX = x - totalPaddingLeft + scrollX
    val localY = y - totalPaddingTop + scrollY
    if (localY < 0 || localY > textLayout.height) return null
    val line = textLayout.getLineForVertical(localY.toInt())
    var marker: JSONObject? = null
    var markerCharacter: Int? = null
    for (item in activeFlow.decorations.asReversed()) {
      if (!item.has("actionId") || !item.optBoolean("hasComments")) continue
      val range = item.range(activeFlow.text) ?: continue
      val last = lastVisibleCharacter(activeFlow.text, range) ?: continue
      val hit = commentMarkerBounds(item, last, textLayout, includeTouchArea = true) ?: continue
      if (!hit.contains(localX, localY)) continue
      // Link text keeps its normal action, including the extra area around
      // the icon. Tapping the visible icon always opens its discussion.
      if (commentMarkerBounds(item, last, textLayout)?.contains(localX, localY) == true) return item to "segment"
      if (marker == null) {
        marker = item
        markerCharacter = last
      }
    }
    if (marker == null && (localX < textLayout.getLineLeft(line) || localX > textLayout.getLineRight(line))) return null
    val offset = markerCharacter ?: textLayout.getOffsetForHorizontal(line, localX)
    // offset is the closest caret; include the preceding attachment glyph.
    for (item in activeFlow.attachments) {
      val range = item.range(activeFlow.text) ?: continue
      if (range.end - range.start != 1 || activeFlow.text[range.start] != '\ufffc') continue
      val left = textLayout.getPrimaryHorizontal(range.start)
      val right = visualEndHorizontal(range.end, line)
      if (textLayout.getLineForOffset(range.start) == line && localX >= min(left, right) && localX <= max(left, right)) {
        return item to "attachment"
      }
    }
    for (item in activeFlow.spans.asReversed()) {
      val range = item.range(activeFlow.text) ?: continue
      if (item.optString("kind") == "link" && offset >= range.start && offset < range.end) return item to "link"
    }
    if (marker != null) return marker to "segment"
    for (item in activeFlow.decorations.asReversed()) {
      val range = item.range(activeFlow.text) ?: continue
      if (item.has("actionId") && offset >= range.start && offset < range.end) return item to "segment"
    }
    return null
  }

  private fun visualEndHorizontal(offset: Int, line: Int): Float {
    val textLayout = layout ?: return 0f
    // A soft-wrap end offset also names the next line's first caret.
    if (textLayout.getLineForOffset(offset) > line) {
      return if (textLayout.getParagraphDirection(line) < 0) textLayout.getLineLeft(line) else textLayout.getLineRight(line)
    }
    return textLayout.getPrimaryHorizontal(offset)
  }
}
