package com.zhihuminus.richtext

import android.graphics.Color
import androidx.core.graphics.PathParser
import org.json.JSONArray
import org.json.JSONObject

internal data class FlowData(
  val id: String,
  val textVersion: String,
  val text: String,
  val spans: List<JSONObject>,
  val paragraphs: List<JSONObject>,
  val decorations: List<JSONObject>,
  val attachments: List<JSONObject>
) {
  companion object {
    fun parse(value: String): FlowData? = runCatching {
      val json = JSONObject(value)
      FlowData(
        json.opt("id") as? String ?: return@runCatching null, json.opt("textVersion") as? String ?: return@runCatching null, json.opt("text") as? String ?: return@runCatching null,
        json.optJSONArray("spans").objects(), json.optJSONArray("paragraphs").objects(),
        json.optJSONArray("decorations").objects(), json.optJSONArray("attachments").objects()
      )
    }.getOrNull()
  }
}

internal class CommentIcon private constructor(
  pathData: String,
  val viewBoxSize: Float,
  val size: Float,
  val insetX: Float,
  val offsetY: Float
) {
  val path by lazy(LazyThreadSafetyMode.NONE) {
    runCatching { PathParser.createPathFromPathData(pathData) }.getOrNull()
  }

  companion object {
    fun parse(json: JSONObject): CommentIcon? {
      val path = (json.opt("path") as? String)?.takeIf { it.isNotBlank() } ?: return null
      val viewBoxSize = json.number("viewBoxSize").toFloat()
      val size = json.number("size").toFloat()
      if (!viewBoxSize.isFinite() || viewBoxSize <= 0 || !size.isFinite() || size <= 0) return null
      return CommentIcon(path, viewBoxSize, size, json.number("insetX", 0.0).toFloat(), json.number("offsetY", 0.0).toFloat())
    }
  }
}

internal data class TextConfig(
  val fontSize: Float = 17f,
  val lineHeight: Float = 28f,
  val paragraphSpacing: Float = 12f,
  val textColor: Int = Color.rgb(35, 39, 43),
  val secondaryColor: Int = Color.rgb(112, 117, 123),
  val linkColor: Int = Color.rgb(23, 91, 199),
  val justify: Boolean = false,
  val textAlign: String = "left",
  val commentIcon: CommentIcon? = null
) {
  companion object {
    fun parse(value: String): TextConfig = runCatching {
      val json = JSONObject(value)
      TextConfig(
        json.number("fontSize", 17.0).toFloat().coerceIn(8f, 64f),
        json.number("lineHeight", 28.0).toFloat().coerceIn(8f, 120f),
        json.number("paragraphSpacing", 12.0).toFloat().coerceIn(0f, 120f),
        parseColor(json.optString("textColor"), Color.rgb(35, 39, 43)),
        parseColor(json.optString("secondaryColor"), Color.rgb(112, 117, 123)),
        parseColor(json.optString("linkColor"), Color.rgb(23, 91, 199)),
        json.optBoolean("justify", false),
        json.optString("textAlign", "left").takeIf { it == "center" || it == "right" } ?: "left",
        json.optJSONObject("commentIcon")?.let(CommentIcon::parse)
      )
    }.getOrDefault(TextConfig())
  }
}

internal fun JSONObject.range(text: String): TextRange? = richTextRange(opt("start"), opt("end"), text)

internal fun JSONObject.emptyLineAnchor(text: String): Int? =
  richTextEmptyLineAnchor(opt("start"), opt("end"), text, opt("emptyLine"))

internal fun JSONObject.number(key: String, fallback: Double = Double.NaN): Double = richTextNumber(opt(key), fallback)

internal fun JSONArray?.objects(): List<JSONObject> =
  if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

internal fun parseColor(value: String?, fallback: Int): Int =
  if (value.isNullOrBlank()) fallback else runCatching { Color.parseColor(value) }.getOrDefault(fallback)
