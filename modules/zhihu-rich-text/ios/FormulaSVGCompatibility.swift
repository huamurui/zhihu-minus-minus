import Foundation

/// CoreSVG ignores transforms on MathJax's <use> elements. A group applies the
/// same SVG transform to the referenced glyph, including its x/y translation.
/// Call only after the SVG has passed AttachmentSVGDocument's security checks.
func normalizeFormulaSVGTransforms(_ markup: String) -> String {
  guard let uses = try? NSRegularExpression(
    pattern: "<use(?=\\s|/|>)(?:\\\"[^\\\"]*\\\"|'[^']*'|[^'\\\">])*(?:/\\s*>|>\\s*</use\\s*>)",
    options: .caseInsensitive
  ), let attributes = try? NSRegularExpression(
    pattern: "\\s+([A-Za-z_:][A-Za-z0-9_.:-]*)\\s*=\\s*(\\\"[^\\\"]*\\\"|'[^']*')"
  ) else { return markup }

  var parts: [String] = []
  var cursor = markup.startIndex
  let matches = uses.matches(in: markup, range: NSRange(markup.startIndex..., in: markup))
  for match in matches {
    guard let range = Range(match.range, in: markup) else { continue }
    var element = String(markup[range])
    let attribute = attributes.matches(in: element, range: NSRange(element.startIndex..., in: element)).first { match in
      guard let name = Range(match.range(at: 1), in: element) else { return false }
      return element[name].lowercased() == "transform"
    }
    guard let attribute,
          let attributeRange = Range(attribute.range, in: element),
          let valueRange = Range(attribute.range(at: 2), in: element) else { continue }
    let value = String(element[valueRange])
    element.removeSubrange(attributeRange)
    parts.append(String(markup[cursor..<range.lowerBound]))
    parts.append("<g transform=\(value)>\(element)</g>")
    cursor = range.upperBound
  }
  parts.append(String(markup[cursor...]))
  return parts.joined()
}
