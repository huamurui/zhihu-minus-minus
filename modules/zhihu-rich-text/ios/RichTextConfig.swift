import SDWebImageSVGCoder
import UIKit

struct RichTextCommentIcon {
  let image: UIImage
  let size: CGFloat
  let insetX: CGFloat
  let offsetY: CGFloat
  private static let templates = NSCache<NSString, UIImage>()

  init?(_ value: Any?) {
    guard let spec = value as? RichTextSpec, let path = spec["path"] as? String, !path.isEmpty,
          path.rangeOfCharacter(from: CharacterSet(charactersIn: "\"<>&")) == nil else { return nil }
    let box = richTextNumber(spec["viewBoxSize"], fallback: 0)
    guard box > 0 else { return nil }
    let svg = #"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \#(box) \#(box)" width="\#(box)" height="\#(box)"><path d="\#(path)"/></svg>"#
    if let cached = Self.templates.object(forKey: svg as NSString) {
      image = cached
    } else {
      guard let template = SDImageSVGCoder.shared.decodedImage(with: Data(svg.utf8), options: nil) else { return nil }
      Self.templates.setObject(template, forKey: svg as NSString)
      image = template
    }
    size = CGFloat(richTextNumber(spec["size"], fallback: 7.5)).clamped(1, 32)
    insetX = CGFloat(richTextNumber(spec["insetX"], fallback: 0)).clamped(-32, 32)
    offsetY = CGFloat(richTextNumber(spec["offsetY"], fallback: -1)).clamped(-32, 32)
  }
}

struct RichTextConfig {
  var fontSize: CGFloat = 17
  var lineHeight: CGFloat = 28
  var paragraphSpacing: CGFloat = 12
  var textColor = UIColor(red: 35 / 255, green: 39 / 255, blue: 43 / 255, alpha: 1)
  var secondaryColor = UIColor(red: 112 / 255, green: 117 / 255, blue: 123 / 255, alpha: 1)
  var linkColor = UIColor(red: 23 / 255, green: 91 / 255, blue: 199 / 255, alpha: 1)
  var justify = false
  var textAlign = "left"
  var commentIcon: RichTextCommentIcon?

  static func parse(_ json: String) -> RichTextConfig {
    var config = RichTextConfig()
    guard let data = json.data(using: .utf8),
          let object = (try? JSONSerialization.jsonObject(with: data)) as? RichTextSpec else { return config }
    config.fontSize = CGFloat(richTextNumber(object["fontSize"], fallback: 17)).clamped(8, 64)
    config.lineHeight = CGFloat(richTextNumber(object["lineHeight"], fallback: 28)).clamped(8, 120)
    config.paragraphSpacing = CGFloat(richTextNumber(object["paragraphSpacing"], fallback: 12)).clamped(0, 120)
    config.textColor = richTextColor(object["textColor"], fallback: config.textColor)
    config.secondaryColor = richTextColor(object["secondaryColor"], fallback: config.secondaryColor)
    config.linkColor = richTextColor(object["linkColor"], fallback: config.linkColor)
    config.justify = object["justify"] as? Bool ?? false
    config.commentIcon = RichTextCommentIcon(object["commentIcon"])
    let align = object["textAlign"] as? String ?? "left"
    config.textAlign = ["center", "right"].contains(align) ? align : "left"
    return config
  }

  var alignment: NSTextAlignment {
    if textAlign == "center" { return .center }
    if textAlign == "right" { return .right }
    return justify ? .justified : .left
  }
}

extension CGFloat {
  fileprivate func clamped(_ lower: CGFloat, _ upper: CGFloat) -> CGFloat {
    Swift.min(upper, Swift.max(lower, self))
  }
}

func richTextColor(_ value: Any?, fallback: UIColor) -> UIColor {
  guard let raw = value as? String else { return fallback }
  let color = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  if color.hasPrefix("#") {
    let hex = String(color.dropFirst())
    guard let number = UInt64(hex, radix: 16) else { return fallback }
    switch hex.count {
    case 3:
      return UIColor(red: CGFloat((number >> 8) & 15) / 15, green: CGFloat((number >> 4) & 15) / 15, blue: CGFloat(number & 15) / 15, alpha: 1)
    case 6:
      return UIColor(red: CGFloat((number >> 16) & 255) / 255, green: CGFloat((number >> 8) & 255) / 255, blue: CGFloat(number & 255) / 255, alpha: 1)
    case 8:
      // The bridge follows Android Color.parseColor's #AARRGGBB convention.
      return UIColor(red: CGFloat((number >> 16) & 255) / 255, green: CGFloat((number >> 8) & 255) / 255, blue: CGFloat(number & 255) / 255, alpha: CGFloat((number >> 24) & 255) / 255)
    default: return fallback
    }
  }
  if (color.hasPrefix("rgb(") || color.hasPrefix("rgba(")), color.hasSuffix(")"),
     let opening = color.firstIndex(of: "(") {
    let components = color[color.index(after: opening)..<color.index(before: color.endIndex)]
      .split(separator: ",", omittingEmptySubsequences: false)
    let fields = components.compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
    if components.count == (color.hasPrefix("rgba") ? 4 : 3), fields.count == components.count,
       fields.allSatisfy({ $0.isFinite }) {
      return UIColor(red: CGFloat(fields[0] / 255).clamped(0, 1), green: CGFloat(fields[1] / 255).clamped(0, 1), blue: CGFloat(fields[2] / 255).clamped(0, 1), alpha: fields.count == 4 ? CGFloat(fields[3]).clamped(0, 1) : 1)
    }
  }
  switch color {
  case "black": return .black
  case "white": return .white
  case "red": return .red
  case "blue": return .blue
  case "gray", "grey": return .gray
  case "transparent", "clear": return .clear
  default: return fallback
  }
}
