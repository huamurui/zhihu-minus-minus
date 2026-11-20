import UIKit

struct RichTextDrawDecoration {
  let range: NSRange
  let kind: String
  let color: UIColor
  let thickness: CGFloat
  let offset: CGFloat
  let hasComments: Bool
  let actionId: String?
}

/** TextKit 1 uses the same visual line geometry for text, selection and range decorations. */
final class RichTextLayoutManager: NSLayoutManager {
  var decorations: [RichTextDrawDecoration] = []
  var commentIcon: RichTextCommentIcon?

  typealias MarkerHit = (actionId: String, endCharacter: Int, insideIcon: Bool)

  func commentMarker(at point: CGPoint) -> MarkerHit? {
    guard let container = textContainers.first else { return nil }
    var nearby: MarkerHit?
    for decoration in decorations where decoration.hasComments {
      guard let id = decoration.actionId, let bounds = commentMarkerBounds(decoration, in: container),
            bounds.hit.contains(point) else { continue }
      let hit: MarkerHit = (id, NSMaxRange(decoration.range) - 1, bounds.draw.contains(point))
      if hit.insideIcon { return hit }
      if nearby == nil { nearby = hit }
    }
    return nearby
  }
  func commentMarkersMaxY(in container: NSTextContainer) -> CGFloat {
    guard commentIcon != nil else { return 0 }
    return decorations.reduce(0) { maxY, decoration in
      guard decoration.hasComments, let bounds = commentMarkerBounds(decoration, in: container) else { return maxY }
      return max(maxY, bounds.draw.maxY)
    }
  }

  var quotes: [NSRange] = []
  var quoteColor = UIColor.gray
  var scale: CGFloat = 1

  override func drawGlyphs(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
    super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
    guard let container = textContainers.first,
          let storage = textStorage, let context = UIGraphicsGetCurrentContext() else { return }
    let source = storage.string as NSString
    context.saveGState()
    context.translateBy(x: origin.x, y: origin.y)
    for decoration in decorations {
      let glyphs = glyphRange(forCharacterRange: decoration.range, actualCharacterRange: nil)
      let visible = NSIntersectionRange(glyphs, glyphsToShow)
      guard visible.length > 0 else { continue }
      enumerateLineFragments(forGlyphRange: visible) { lineRect, _, _, lineGlyphs, _ in
        var part = NSIntersectionRange(glyphs, lineGlyphs)
        guard part.length > 0 else { return }
        var characters = self.characterRange(forGlyphRange: part, actualGlyphRange: nil)
        while characters.length > 0 && source.character(at: NSMaxRange(characters) - 1) == 10 {
          characters.length -= 1
        }
        guard characters.length > 0 else { return }
        part = self.glyphRange(forCharacterRange: characters, actualCharacterRange: nil)
        let baseline = lineRect.minY + self.location(forGlyphAt: part.location).y + decoration.offset
        let marker = decoration.hasComments && NSMaxRange(part) == NSMaxRange(glyphs)
          ? self.commentMarkerBounds(decoration, in: container) : nil
        context.saveGState()
        if let marker {
          // Keep the hollow glyph clear of its own underline.
          context.addRect(context.boundingBoxOfClipPath)
          context.addRect(marker.draw)
          context.clip(using: .evenOdd)
        }
        self.enumerateEnclosingRects(forGlyphRange: part, withinSelectedGlyphRange: NSRange(location: NSNotFound, length: 0), in: container) { rect, _ in
          self.drawDecoration(decoration, from: rect.minX, to: rect.maxX, baseline: baseline, context: context)
        }
        context.restoreGState()
        if let marker, let icon = self.commentIcon {
          context.saveGState()
          context.clip(to: marker.draw)
          context.beginTransparencyLayer(auxiliaryInfo: nil)
          icon.image.draw(in: marker.draw)
          context.setBlendMode(.sourceIn)
          context.setFillColor(decoration.color.cgColor)
          context.fill(marker.draw)
          context.endTransparencyLayer()
          context.restoreGState()
        }
      }
    }
    context.setStrokeColor(quoteColor.cgColor)
    context.setLineWidth(max(1, 2 * scale))
    context.setLineDash(phase: 0, lengths: [])
    for quote in quotes {
      let glyphs = NSIntersectionRange(glyphRange(forCharacterRange: quote, actualCharacterRange: nil), glyphsToShow)
      guard glyphs.length > 0 else { continue }
      let rect = boundingRect(forGlyphRange: glyphs, in: container)
      context.move(to: CGPoint(x: 2 * scale, y: rect.minY))
      context.addLine(to: CGPoint(x: 2 * scale, y: rect.maxY))
      context.strokePath()
    }
    context.restoreGState()
  }

  private func drawDecoration(_ decoration: RichTextDrawDecoration, from left: CGFloat, to right: CGFloat, baseline: CGFloat, context: CGContext) {
    guard right > left else { return }
    context.saveGState()
    context.setStrokeColor(decoration.color.cgColor)
    context.setLineWidth(decoration.thickness)
    context.setLineCap(decoration.kind == "dotted" ? .round : .butt)
    switch decoration.kind {
    case "dashed": context.setLineDash(phase: 0, lengths: [4 * scale, 3 * scale])
    case "dotted": context.setLineDash(phase: 0, lengths: [max(0.1, 0.1 * scale), 2.5 * scale])
    default: context.setLineDash(phase: 0, lengths: [])
    }
    context.move(to: CGPoint(x: left, y: baseline))
    if decoration.kind == "wavy" {
      var x = left
      var direction: CGFloat = -1
      let halfWave = max(2, 2.8 * scale)
      while x < right {
        let next = min(right, x + halfWave)
        context.addQuadCurve(to: CGPoint(x: next, y: baseline), control: CGPoint(x: (x + next) / 2, y: baseline + direction * 2 * scale))
        x = next
        direction *= -1
      }
    } else {
      context.addLine(to: CGPoint(x: right, y: baseline))
    }
    context.strokePath()
    context.restoreGState()
  }

  private func commentMarkerBounds(_ decoration: RichTextDrawDecoration, in container: NSTextContainer) -> (draw: CGRect, hit: CGRect)? {
    guard let icon = commentIcon else { return nil }
    let glyphs = glyphRange(forCharacterRange: decoration.range, actualCharacterRange: nil)
    guard glyphs.length > 0 else { return nil }
    let glyph = NSMaxRange(glyphs) - 1
    let lastGlyph = NSRange(location: glyph, length: 1)
    let rect = boundingRect(forGlyphRange: lastGlyph, in: container)
    var bidiLevel: UInt8 = 0
    getGlyphs(in: lastGlyph, glyphs: nil, properties: nil, characterIndexes: nil, bidiLevels: &bidiLevel)
    let line = lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
    let underlineY = line.minY + location(forGlyphAt: glyph).y + decoration.offset
    func bounds(width: CGFloat, height: CGFloat, inset: CGFloat, offset: CGFloat) -> CGRect {
      let width = min(container.size.width, width * scale)
      let x = bidiLevel % 2 == 1 ? rect.minX + inset * scale : rect.maxX - width - inset * scale
      return CGRect(x: max(0, min(x, container.size.width - width)), y: underlineY + offset * scale,
                    width: width, height: height * scale)
    }
    let draw = bounds(width: icon.size, height: icon.size, inset: icon.insetX, offset: icon.offsetY)
    return (draw, draw.union(bounds(width: 8, height: 6, inset: 0, offset: -2)))
  }
}

private final class FlowSelectionDoubleTapDelegate: NSObject, UIGestureRecognizerDelegate {
  private weak var textView: FlowTextView?
  private let selectionGestures: NSHashTable<UIGestureRecognizer>

  init(textView: FlowTextView, selectionGestures: NSHashTable<UIGestureRecognizer>) {
    self.textView = textView
    self.selectionGestures = selectionGestures
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard let textView else { return false }
    return textView.suppressDoubleTapSelection && textView.isSelectable && textView.selectedRange.length == 0 &&
      touch.type == .direct && !UIAccessibility.isVoiceOverRunning
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    !selectionGestures.contains(otherGestureRecognizer)
  }
}

final class FlowTextView: UITextView {
  var copyResolver: ((NSRange) -> String?)?
  var suppressDoubleTapSelection = false {
    didSet { synchronizeSelectionGestures() }
  }
  private var doubleTapGuardInstalled = false
  private let selectionGestures = NSHashTable<UIGestureRecognizer>.weakObjects()
  private let guardedSelectionGestures = NSHashTable<UIGestureRecognizer>.weakObjects()
  private lazy var doubleTapDelegate = FlowSelectionDoubleTapDelegate(textView: self, selectionGestures: selectionGestures)
  private lazy var doubleTapGuard: UITapGestureRecognizer = {
    let gesture = UITapGestureRecognizer(target: self, action: #selector(reservedDoubleTap))
    gesture.numberOfTapsRequired = 2
    gesture.cancelsTouchesInView = false
    gesture.delaysTouchesBegan = false
    gesture.delaysTouchesEnded = false
    gesture.delegate = doubleTapDelegate
    return gesture
  }()

  override func layoutSubviews() {
    super.layoutSubviews()
    synchronizeSelectionGestures()
  }

  /** UIKit may recreate its text interactions when selectability or layout changes. */
  func synchronizeSelectionGestures() {
    guard suppressDoubleTapSelection || doubleTapGuardInstalled else { return }
    if !doubleTapGuardInstalled {
      doubleTapGuardInstalled = true
      addGestureRecognizer(doubleTapGuard)
    }
    let enabled = suppressDoubleTapSelection && isSelectable
    if doubleTapGuard.isEnabled != enabled { doubleTapGuard.isEnabled = enabled }
    selectionGestures.removeAllObjects()
    var views: [UIView] = [self]
    while let view = views.popLast() {
      views.append(contentsOf: view.subviews)
      for interaction in view.interactions.compactMap({ $0 as? UITextInteraction }) {
        for gesture in interaction.gesturesForFailureRequirements {
          selectionGestures.add(gesture)
          // A plain hold still starts native selection immediately at UIKit's
          // normal threshold; other selection gestures wait for the host tap.
          if let press = gesture as? UILongPressGestureRecognizer, press.numberOfTapsRequired == 0 { continue }
          if !guardedSelectionGestures.contains(gesture) {
            gesture.require(toFail: doubleTapGuard)
            guardedSelectionGestures.add(gesture)
          }
        }
      }
    }
  }

  // The ancestor recognizer owns the action. This recognizer only establishes
  // UIKit failure requirements, so one double tap never dispatches two actions.
  @objc private func reservedDoubleTap() {}

  override func copy(_ sender: Any?) {
    if let text = copyResolver?(selectedRange) {
      UIPasteboard.general.string = text
    } else {
      super.copy(sender)
    }
  }
}
