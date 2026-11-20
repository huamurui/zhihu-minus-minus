import Foundation

@main
struct ModelsSmoke {
  static func expect(_ condition: @autoclosure () -> Bool, _ description: String) {
    precondition(condition(), description)
  }

  static func main() throws {
    let text = "甲😀\u{fffc}\n乙" as NSString
    expect(text.length == 6, "The bridge must use UTF-16 offsets")
    expect(validRichTextBoundary(1, in: text), "The emoji start is valid")
    expect(!validRichTextBoundary(2, in: text), "A surrogate pair cannot be split")
    expect(validRichTextBoundary(3, in: text), "The emoji end is valid")
    expect(richTextRange(["start": 1, "end": 3], in: text) == NSRange(location: 1, length: 2), "Emoji ranges use both UTF-16 units")
    expect(richTextRange(["start": 1, "end": 2], in: text) == nil, "Malformed UTF-16 ranges are rejected")
    expect(richTextRange(["start": true, "end": 3], in: text) == nil, "JSON booleans are not numeric offsets")
    expect(richTextRange(["start": -1, "end": 3], in: text) == nil, "Negative offsets are rejected")
    expect(richTextRange(["start": 0, "end": 7], in: text) == nil, "Out-of-bounds offsets are rejected")
    let marked = "甲\n😀\n\n" as NSString
    expect(richTextDecorationRange(["start": 0, "end": 6], in: marked) == NSRange(location: 0, length: 4), "A marker trailing newlines ends after the final visible composed glyph")
    expect(richTextDecorationRange(["start": 4, "end": 6], in: marked) == nil, "A newline-only range has no marker")
    expect(richTextDecorationRange(["start": 2, "end": 4], in: marked) == NSRange(location: 2, length: 2), "Text-only marker ranges are unchanged")
    expect(!validRichTextRange(NSRange(location: NSNotFound, length: 1), in: text), "NSNotFound is rejected without overflow")
    expect(!validRichTextRange(NSRange(location: 1, length: Int.max), in: text), "Oversized ranges are rejected without overflow")

    let payload: [String: Any] = [
      "id": "smoke-flow", "textVersion": "one", "text": text as String,
      "attachments": [
        ["start": 3, "end": 4, "kind": "formula", "copyText": "x²"],
        ["start": 0, "end": 1, "kind": "image", "copyText": "incorrect replacement"],
        ["start": 99, "end": 100, "kind": "image", "copyText": "out of bounds"]
      ]
    ]
    let json = String(decoding: try JSONSerialization.data(withJSONObject: payload), as: UTF8.self)
    guard let flow = RichTextFlow.parse(json) else { fatalError("Valid flow did not parse") }
    expect(flow.selectionText(NSRange(location: 0, length: 6)) == "甲😀x²\n乙", "Cross-paragraph copy replaces only real attachments")
    expect(flow.selectionText(NSRange(location: 1, length: 2)) == "😀", "Partial selection preserves supplementary characters")
    expect(flow.selectionText(NSRange(location: 3, length: 1)) == "x²", "Attachment copy uses semantic text")
    expect(flow.selectionText(NSRange(location: 2, length: 2)) == nil, "Invalid native selections cannot produce a source string")
    expect(RichTextFlow.parse("{") == nil, "Malformed JSON is rejected")
    expect(RichTextFlow.parse("{\"id\":\"missing-fields\"}") == nil, "Flow identity and text are mandatory")
    for offset: Any in ["1", 1.5, Double.infinity, Double.nan] {
      expect(richTextRange(["start": offset, "end": 3], in: text) == nil, "Offsets cannot be coerced or truncated")
    }
    let blankText = "甲\u{200b}\n\u{200b}\n\u{fffc}\n\u{200b}" as NSString
    let blankParagraph: RichTextSpec = ["start": 3, "end": 5, "emptyLine": true]
    let finalBlankParagraph: RichTextSpec = ["start": 7, "end": 8, "emptyLine": true]
    expect(richTextEmptyLineAnchor(blankParagraph, in: blankText) == NSRange(location: 3, length: 1), "A complete marked blank paragraph has one synthetic anchor")
    expect(richTextEmptyLineAnchor(finalBlankParagraph, in: blankText) == NSRange(location: 7, length: 1), "A final blank paragraph does not require a trailing separator")
    for flag: Any in [false, 1, "true"] {
      expect(richTextEmptyLineAnchor(["start": 3, "end": 5, "emptyLine": flag], in: blankText) == nil, "Only a JSON true boolean enables synthetic blank paragraphs")
    }
    expect(richTextEmptyLineAnchor(["start": 3, "end": 5], in: blankText) == nil, "Unmarked zero-width text stays original content")
    expect(richTextEmptyLineAnchor(["start": 0, "end": 3, "emptyLine": true], in: blankText) == nil, "Mixed visible text cannot use exact blank-line metrics")
    expect(richTextEmptyLineAnchor(["start": 1, "end": 3, "emptyLine": true], in: blankText) == nil, "A range inside a visible paragraph is not a synthetic blank line")
    expect(richTextEmptyLineAnchor(["start": 3, "end": 4, "emptyLine": true], in: blankText) == nil, "The paragraph range must include its trailing separator")
    expect(richTextEmptyLineAnchor(["start": 3, "end": 8, "emptyLine": true], in: blankText) == nil, "One empty-line spec cannot span several physical paragraphs")
    expect(richTextEmptyLineAnchor(["start": 0, "end": 2, "emptyLine": true], in: "\u{200b}\u{200b}" as NSString) == nil, "Multiple zero-width characters are not one synthetic anchor")
    let blankFlow = RichTextFlow(
      id: "blank-flow", textVersion: "one", text: blankText,
      spans: [], paragraphs: [blankParagraph, finalBlankParagraph], decorations: [],
      attachments: [["start": 5, "end": 6, "copyText": "x²"]]
    )
    expect(blankFlow.selectionText(NSRange(location: 0, length: 8)) == "甲\u{200b}\n\nx²\n", "Copy removes only trusted anchors while preserving original zero-width text and attachment replacements")
    expect(blankFlow.selectionText(NSRange(location: 3, length: 1)) == "", "Selecting just a synthetic anchor does not copy it")
    expect(blankFlow.selectionText(NSRange(location: 3, length: 2)) == "\n", "Selecting an empty paragraph preserves its newline")
    expect(blankFlow.selectionText(NSRange(location: 1, length: 1)) == "\u{200b}", "A user-provided zero-width character remains copyable")
    let visibility = RichTextAttachmentVisibility()
    expect(visibility.beginLoad() == nil, "Offscreen attachments do not load")
    visibility.setActive(true)
    let first = visibility.beginLoad()!
    expect(visibility.beginLoad() == nil, "A viewport visit loads at most once")
    visibility.setActive(false)
    visibility.setActive(true)
    let second = visibility.beginLoad()!
    expect(!visibility.accepts(first) && visibility.accepts(second), "Canceled results cannot apply after viewport reentry")
    visibility.hasAsset = true
    visibility.setActive(false)
    expect(!visibility.hasAsset, "Offscreen attachments release their asset state")
    expect(intersectsRichTextAttachmentViewport(top: 100, bottom: 140, viewportTop: 120, viewportBottom: 200), "Intersecting attachments activate")
    expect(!intersectsRichTextAttachmentViewport(top: 100, bottom: 120, viewportTop: 120, viewportBottom: 200), "Touching ranges are offscreen")
    expect(!intersectsRichTextAttachmentViewport(top: 100, bottom: 140, viewportTop: .nan, viewportBottom: 200), "Invalid viewport geometry is rejected")
    print("iOS rich text model/viewport smoke checks passed")
  }
}
