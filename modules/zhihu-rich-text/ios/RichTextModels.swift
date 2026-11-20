import CoreFoundation
import Foundation

typealias RichTextSpec = [String: Any]

struct RichTextFlow {
  let id: String
  let textVersion: String
  let text: NSString
  let spans: [RichTextSpec]
  let paragraphs: [RichTextSpec]
  let decorations: [RichTextSpec]
  let attachments: [RichTextSpec]

  static func parse(_ json: String) -> RichTextFlow? {
    guard let data = json.data(using: .utf8),
          let value = try? JSONSerialization.jsonObject(with: data),
          let object = value as? RichTextSpec,
          let id = object["id"] as? String,
          let version = object["textVersion"] as? String,
          let text = object["text"] as? String else { return nil }
    return RichTextFlow(
      id: id, textVersion: version, text: text as NSString,
      spans: object["spans"] as? [RichTextSpec] ?? [],
      paragraphs: object["paragraphs"] as? [RichTextSpec] ?? [],
      decorations: object["decorations"] as? [RichTextSpec] ?? [],
      attachments: object["attachments"] as? [RichTextSpec] ?? []
    )
  }

  func selectionText(_ range: NSRange) -> String? {
    guard validRichTextRange(range, in: text) else { return nil }
    var result = ""
    var cursor = range.location
    let end = NSMaxRange(range)
    var slots = attachments.compactMap { spec -> (NSRange, String)? in
      guard let slot = richTextRange(spec, in: text), slot.length == 1,
            text.character(at: slot.location) == 0xfffc,
            slot.location >= range.location, NSMaxRange(slot) <= end else { return nil }
      return (slot, spec["copyText"] as? String ?? spec["latex"] as? String ?? spec["alt"] as? String ?? "[图片]")
    }
    slots += paragraphs.compactMap { spec -> (NSRange, String)? in
      guard let anchor = richTextEmptyLineAnchor(spec, in: text),
            anchor.location >= range.location, NSMaxRange(anchor) <= end else { return nil }
      return (anchor, "")
    }
    slots.sort { $0.0.location < $1.0.location }
    for (slot, replacement) in slots where slot.location >= cursor {
      result += text.substring(with: NSRange(location: cursor, length: slot.location - cursor))
      result += replacement
      cursor = NSMaxRange(slot)
    }
    result += text.substring(with: NSRange(location: cursor, length: end - cursor))
    return result
  }
}

func richTextNumber(_ value: Any?, fallback: Double) -> Double {
  guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
        number.doubleValue.isFinite else { return fallback }
  return number.doubleValue
}

private func richTextInteger(_ value: Any?) -> Int? {
  let number = richTextNumber(value, fallback: .nan)
  guard number.isFinite, number.rounded(.towardZero) == number,
        number >= 0, number < Double(Int.max) else { return nil }
  return Int(number)
}

func validRichTextBoundary(_ offset: Int, in text: NSString) -> Bool {
  guard offset >= 0, offset <= text.length else { return false }
  guard offset > 0, offset < text.length else { return true }
  let previous = text.character(at: offset - 1)
  let next = text.character(at: offset)
  return !(0xd800...0xdbff).contains(previous) || !(0xdc00...0xdfff).contains(next)
}

func validRichTextRange(_ range: NSRange, in text: NSString) -> Bool {
  guard range.location != NSNotFound, range.location >= 0, range.length > 0,
        range.location <= text.length, range.length <= text.length - range.location else { return false }
  return validRichTextBoundary(range.location, in: text) && validRichTextBoundary(NSMaxRange(range), in: text)
}

func richTextRange(_ spec: RichTextSpec, in text: NSString) -> NSRange? {
  guard let start = richTextInteger(spec["start"]), let end = richTextInteger(spec["end"]),
        end > start, end <= text.length else { return nil }
  let range = NSRange(location: start, length: end - start)
  return validRichTextRange(range, in: text) ? range : nil
}

/** Newline glyphs have no ink. Decorations end at the last visible text position. */
func richTextDecorationRange(_ spec: RichTextSpec, in text: NSString) -> NSRange? {
  guard var range = richTextRange(spec, in: text) else { return nil }
  while range.length > 0 && text.character(at: NSMaxRange(range) - 1) == 0x000a {
    range.length -= 1
  }
  return range.length > 0 ? range : nil
}

/** Only a complete synthetic blank paragraph may opt into exact line metrics. */
func richTextEmptyLineAnchor(_ spec: RichTextSpec, in text: NSString) -> NSRange? {
  guard let flag = spec["emptyLine"] as? NSNumber,
        CFGetTypeID(flag) == CFBooleanGetTypeID(), flag.boolValue,
        let range = richTextRange(spec, in: text),
        range.length == 1 || range.length == 2,
        text.character(at: range.location) == 0x200b,
        range.location == 0 || text.character(at: range.location - 1) == 0x000a,
        range.length == 1 || text.character(at: range.location + 1) == 0x000a,
        NSMaxRange(range) == text.length || text.character(at: NSMaxRange(range) - 1) == 0x000a else { return nil }
  return NSRange(location: range.location, length: 1)
}
