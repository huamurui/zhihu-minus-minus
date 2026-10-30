import ExpoModulesCore
import UIKit

private final class RichTextAttachmentSlot {
  let spec: RichTextSpec
  let attachment: RichTextAttachment
  let range: NSRange
  let fontSize: CGFloat
  let maxWidth: CGFloat
  let scale: CGFloat
  let visibility = RichTextAttachmentVisibility()
  var request: RichTextAttachmentRequest?

  init(spec: RichTextSpec, attachment: RichTextAttachment, range: NSRange, fontSize: CGFloat, maxWidth: CGFloat, scale: CGFloat) {
    self.spec = spec; self.attachment = attachment; self.range = range
    self.fontSize = fontSize; self.maxWidth = maxWidth; self.scale = scale
  }
}

/** One flow, one UTF-16 buffer and one UIKit selection context. */
public final class RichTextView: ExpoView, UITextViewDelegate, UIGestureRecognizerDelegate {
  private let onSelectionChange = EventDispatcher()
  private let onHeightChange = EventDispatcher()
  private let onAction = EventDispatcher()
  private let storage: NSTextStorage
  private let manager: RichTextLayoutManager
  private let container: NSTextContainer
  private let textView: FlowTextView
  private var flow: RichTextFlow?
  private var config = RichTextConfig()
  private var previousFlowJson = ""
  private var previousConfigJson = ""
  private var contentWidth: CGFloat = 0
  private var layoutKey = ""
  private var nativeAutoSize = false
  private var performanceTracing = false
  private var tracePropsTime: TimeInterval?
  private var selectable = true
  private var needsRebuild = false
  private var lastWidth: CGFloat = 0
  private var lastMeasuredWidth: CGFloat = 0
  private var generation = 0
  private var suppressSelection = false
  private var lastHeightKey = ""
  private var lastSelectionKey = ""
  private var lastParseMs: Double?
  private var lastRebuildMs: Double?
  private var lastSpannableMs: Double?
  private var lastSetTextMs: Double?
  private var measureCount = 0
  private var setViewSizeCount = 0
  private var lastPropsSetEpochMs: Double?
  private var firstMeasureEpochMs: Double?
  private var firstLayoutEpochMs: Double?
  private var attachments: [RichTextAttachmentSlot] = []
  private var attachmentUpdates: [(RichTextAttachmentSlot, Int, RichTextAttachmentAsset)] = []
  private var viewportObservations: [NSKeyValueObservation] = []
  private var lifecycleObservers: [NSObjectProtocol] = []
  private var pausedAttachments = false
  private var synchronizingAttachments = false
  private var lastAttachmentViewport: CGRect?
  private var attachmentUpdateScheduled = false
  private var tapHadSelection = false
  private var longPressActive = false
  private lazy var tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
  private lazy var longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))

  public required init(appContext: AppContext? = nil) {
    let storage = NSTextStorage()
    let manager = RichTextLayoutManager()
    let container = NSTextContainer(size: .zero)
    storage.addLayoutManager(manager)
    manager.addTextContainer(container)
    self.storage = storage
    self.manager = manager
    self.container = container
    textView = FlowTextView(frame: .zero, textContainer: container)
    super.init(appContext: appContext)

    backgroundColor = .clear
    clipsToBounds = false
    textView.backgroundColor = .clear
    textView.isEditable = false
    textView.isSelectable = true
    textView.isScrollEnabled = false
    textView.alwaysBounceVertical = false
    textView.alwaysBounceHorizontal = false
    textView.textContainerInset = .zero
    textView.contentInset = .zero
    textView.contentInsetAdjustmentBehavior = .never
    textView.dataDetectorTypes = []
    textView.delegate = self
    container.lineFragmentPadding = 0
    container.widthTracksTextView = false
    container.heightTracksTextView = false
    addSubview(textView)
    textView.copyResolver = { [weak self] range in self?.flow?.selectionText(range) }
    tap.cancelsTouchesInView = false
    tap.delegate = self
    longPress.cancelsTouchesInView = false
    longPress.minimumPressDuration = 0.55
    longPress.delegate = self
    textView.addGestureRecognizer(tap)
    textView.addGestureRecognizer(longPress)
  }

  deinit {
    attachments.forEach { $0.request?.cancel() }
    lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    viewportObservations.removeAll()
    lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
    lifecycleObservers.removeAll()
    guard window != nil else { releaseAttachments(); return }
    // Prop updates can precede installation of Fabric's state. Re-submit the
    // latest measured size after mounting without emitting a duplicate event.
    if nativeAutoSize, textView.frame.width > 0, !needsRebuild {
      setViewSize(textView.frame.size)
      setViewSizeCount += 1
    }
    pausedAttachments = UIApplication.shared.applicationState == .background
    var ancestor = superview
    while let view = ancestor {
      if let scroll = view as? UIScrollView {
        viewportObservations.append(scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in self?.synchronizeAttachments() })
        viewportObservations.append(scroll.observe(\.bounds, options: [.new]) { [weak self] _, _ in self?.synchronizeAttachments() })
        viewportObservations.append(scroll.observe(\.contentSize, options: [.new]) { [weak self] _, _ in self?.synchronizeAttachments() })
      }
      ancestor = view.superview
    }
    for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
      lifecycleObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.pausedAttachments = true; self?.releaseAttachments()
      })
    }
    lifecycleObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.pausedAttachments = false; self?.synchronizeAttachments()
    })
    lifecycleObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
      self?.releaseAttachments()
    })
    synchronizeAttachments()
  }

  func setFlowJson(_ value: String) {
    guard previousFlowJson != value else { return }
    previousFlowJson = value
    let parseStart = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    flow = RichTextFlow.parse(value)
    if let parseStart { lastParseMs = (ProcessInfo.processInfo.systemUptime - parseStart) * 1000 }
    needsRebuild = true
    lastMeasuredWidth = 0
    lastSelectionKey = ""
    lastHeightKey = ""
  }

  func setConfigJson(_ value: String) {
    guard previousConfigJson != value else { return }
    previousConfigJson = value
    config = RichTextConfig.parse(value)
    needsRebuild = true
    lastMeasuredWidth = 0
  }

  func setContentWidth(_ value: Double) {
    let width = value.isFinite ? CGFloat(max(0, value)) : 0
    guard contentWidth != width else { return }
    contentWidth = width
    needsRebuild = true
    lastMeasuredWidth = 0
  }

  func setLayoutKey(_ value: String) {
    guard layoutKey != value else { return }
    layoutKey = value
    lastHeightKey = ""
  }

  func setNativeAutoSize(_ value: Bool) {
    guard nativeAutoSize != value else { return }
    nativeAutoSize = value
    lastHeightKey = ""
    if !value {
      // Clear the intrinsic dimensions when returning ownership to React.
      setViewSize(CGSize(width: -1, height: -1))
    }
  }

  func setPerformanceTracing(_ value: Bool) {
    performanceTracing = value
  }

  func setSelectable(_ value: Bool) {
    selectable = value
    textView.isSelectable = value
    textView.synchronizeSelectionGestures()
    if !value { emitSelection() }
  }

  func setSuppressDoubleTapSelection(_ value: Bool) {
    textView.suppressDoubleTapSelection = value
  }

  func applyPendingProps() {
    tracePropsTime = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    lastPropsSetEpochMs = performanceTracing ? Date().timeIntervalSince1970 * 1000 : nil
    firstMeasureEpochMs = nil
    firstLayoutEpochMs = nil
    measureCount = 0
    setViewSizeCount = 0
    let width = effectiveWidth
    guard width > 0 else { setNeedsLayout(); return }
    if needsRebuild || width != lastWidth { rebuild(width: width) }
    measureAndLayout(width: width)
    setNeedsLayout()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    if performanceTracing && firstLayoutEpochMs == nil {
      firstLayoutEpochMs = Date().timeIntervalSince1970 * 1000
    }
    let width = effectiveWidth
    guard width > 0 else { return }
    if needsRebuild || width != lastWidth { rebuild(width: width) }
    if !needsRebuild && width == lastMeasuredWidth && !lastHeightKey.isEmpty && textView.frame.height > 0 {
      textView.frame = CGRect(x: 0, y: 0, width: width, height: textView.frame.height)
      return
    }
    measureAndLayout(width: width)
  }

  public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if previousTraitCollection?.preferredContentSizeCategory != traitCollection.preferredContentSizeCategory {
      needsRebuild = true
      applyPendingProps()
    }
  }

  private var effectiveWidth: CGFloat { contentWidth > 0 ? contentWidth : bounds.width }

  private func rebuild(width: CGFloat) {
    let rebuildStart = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    let previousFlowIdentity = renderedIdentity
    let selection = textView.selectedRange
    generation += 1
    needsRebuild = false
    lastWidth = width
    lastHeightKey = ""
    releaseAttachments()
    attachments.removeAll()
    attachmentUpdates.removeAll()
    attachmentUpdateScheduled = false
    manager.decorations = []
    manager.quotes = []
    suppressSelection = true
    defer { suppressSelection = false; emitSelection() }
    guard let flow else {
      renderedIdentity = nil
      storage.setAttributedString(NSAttributedString(string: ""))
      return
    }
    renderedIdentity = (flow.id, flow.textVersion)
    let baseFont = UIFontMetrics(forTextStyle: .body).scaledFont(for: UIFont.systemFont(ofSize: config.fontSize), compatibleWith: traitCollection)
    let scale = baseFont.pointSize / config.fontSize
    manager.scale = scale
    manager.quoteColor = config.secondaryColor
    textView.font = baseFont
    textView.textColor = config.textColor
    textView.tintColor = config.linkColor
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = config.alignment
    paragraphStyle.minimumLineHeight = config.lineHeight * scale
    paragraphStyle.paragraphSpacing = config.paragraphSpacing * scale
    let content = NSMutableAttributedString(string: flow.text as String, attributes: [
      .font: baseFont, .foregroundColor: config.textColor, .paragraphStyle: paragraphStyle
    ])

    for spec in flow.paragraphs {
      guard let range = richTextRange(spec, in: flow.text) else { continue }
      let style = paragraphStyle.mutableCopy() as! NSMutableParagraphStyle
      let kind = spec["kind"] as? String ?? "paragraph"
      style.paragraphSpacingBefore = CGFloat(max(0, richTextNumber(spec["marginTop"], fallback: 0))) * scale
      style.paragraphSpacing = CGFloat(max(0, richTextNumber(spec["marginBottom"], fallback: Double(config.paragraphSpacing)))) * scale
      var font = baseFont
      if kind == "heading" {
        let level = richTextNumber(spec["level"], fallback: 2)
        let fallbackScale: CGFloat = level == 1 ? 1.55 : level == 2 ? 1.35 : 1.15
        let size = CGFloat(richTextNumber(spec["fontSize"], fallback: Double(config.fontSize * fallbackScale)))
        font = UIFont.boldSystemFont(ofSize: max(1, size) * scale)
        style.minimumLineHeight = CGFloat(max(1, richTextNumber(spec["lineHeight"], fallback: Double(config.lineHeight)))) * scale
      } else if kind == "code" {
        font = UIFont.monospacedSystemFont(ofSize: baseFont.pointSize * 0.9, weight: .regular)
        content.addAttribute(.backgroundColor, value: config.secondaryColor.withAlphaComponent(0.09), range: range)
      }
      if richTextEmptyLineAnchor(spec, in: flow.text) != nil {
        let height = CGFloat(max(1, richTextNumber(spec["lineHeight"], fallback: Double(config.lineHeight)))) * scale
        // The anchor is invisible; a tiny font keeps its natural metrics below
        // the requested height while leaving ordinary text/attachments uncapped.
        font = UIFont.systemFont(ofSize: min(baseFont.pointSize, max(scale, height * 0.5)))
        style.minimumLineHeight = height
        style.maximumLineHeight = height
      }
      if kind == "listItem" || kind == "quote" {
        let fallbackIndent = kind == "quote" ? config.fontSize : config.fontSize * 1.2
        let indent = CGFloat(max(0, richTextNumber(spec["indent"], fallback: Double(fallbackIndent)))) * scale
        style.headIndent = indent
        style.firstLineHeadIndent = indent
      }
      if kind == "quote" {
        manager.quotes.append(range)
        content.addAttribute(.foregroundColor, value: config.secondaryColor, range: range)
      }
      // A minimum height leaves tall image/formula attachments free to extend the line.
      content.addAttributes([.font: font, .paragraphStyle: style], range: range)
    }
    for spec in flow.spans {
      guard let range = richTextRange(spec, in: flow.text) else { continue }
      switch spec["kind"] as? String {
      case "strong": applyFont(content, range: range, fallback: baseFont) { font in
        let traits = font.fontDescriptor.symbolicTraits.union(.traitBold)
        return font.fontDescriptor.withSymbolicTraits(traits).map { UIFont(descriptor: $0, size: font.pointSize) } ?? font
      }
      case "emphasis": applyFont(content, range: range, fallback: baseFont) { font in
        let traits = font.fontDescriptor.symbolicTraits.union(.traitItalic)
        return font.fontDescriptor.withSymbolicTraits(traits).map { UIFont(descriptor: $0, size: font.pointSize) } ?? font
      }
      case "underline": content.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      case "strikethrough": content.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      case "highlight": content.addAttribute(.backgroundColor, value: richTextColor(spec["color"], fallback: UIColor(red: 244 / 255, green: 197 / 255, blue: 66 / 255, alpha: 0.2)), range: range)
      case "subscript", "superscript":
        let sign: CGFloat = spec["kind"] as? String == "superscript" ? 1 : -1
        content.addAttribute(.baselineOffset, value: sign * baseFont.pointSize * 0.25, range: range)
        applyFont(content, range: range, fallback: baseFont) { $0.withSize($0.pointSize * 0.75) }
      case "code":
        applyFont(content, range: range, fallback: baseFont) { UIFont.monospacedSystemFont(ofSize: $0.pointSize, weight: .regular) }
        content.addAttribute(.backgroundColor, value: config.secondaryColor.withAlphaComponent(0.09), range: range)
      case "link":
        content.addAttribute(.foregroundColor, value: richTextColor(spec["color"], fallback: config.linkColor), range: range)
        content.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      default: break
      }
    }
    manager.decorations = flow.decorations.compactMap { spec in
      guard let range = richTextRange(spec, in: flow.text) else { return nil }
      return RichTextDrawDecoration(
        range: range, kind: spec["kind"] as? String ?? "solid",
        color: richTextColor(spec["color"], fallback: config.linkColor),
        thickness: max(0.5, CGFloat(richTextNumber(spec["thickness"], fallback: 1.2)) * scale),
        offset: CGFloat(richTextNumber(spec["offset"], fallback: 3)) * scale
      )
    }
    for spec in flow.attachments {
      guard let range = richTextRange(spec, in: flow.text), range.length == 1,
            flow.text.character(at: range.location) == 0xfffc else { continue }
      let attachment = RichTextAttachment(spec: spec, font: baseFont, maxWidth: width, textColor: config.textColor, secondaryColor: config.secondaryColor, scale: scale)
      content.addAttribute(.attachment, value: attachment, range: range)
      attachments.append(RichTextAttachmentSlot(spec: spec, attachment: attachment, range: range, fontSize: baseFont.pointSize, maxWidth: width, scale: scale))
    }
    let spannableEnd = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    storage.setAttributedString(content)
    let setTextEnd = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    textView.isSelectable = selectable
    if let previous = previousFlowIdentity, previous.0 == flow.id, previous.1 == flow.textVersion,
       selection.location != NSNotFound, selection.location <= flow.text.length,
       selection.length <= flow.text.length - selection.location,
       validRichTextBoundary(selection.location, in: flow.text), validRichTextBoundary(NSMaxRange(selection), in: flow.text) {
      textView.selectedRange = selection
    } else {
      textView.selectedRange = NSRange(location: 0, length: 0)
    }
    if let rebuildStart {
      lastRebuildMs = (ProcessInfo.processInfo.systemUptime - rebuildStart) * 1000
      if let spannableEnd { lastSpannableMs = (spannableEnd - rebuildStart) * 1000 }
      if let setTextEnd, let spannableEnd { lastSetTextMs = (setTextEnd - spannableEnd) * 1000 }
    }
  }

  private func releaseAttachments() {
    lastAttachmentViewport = nil
    for slot in attachments {
      slot.visibility.setActive(false)
      slot.request?.cancel(); slot.request = nil
      slot.attachment.releaseAsset()
      manager.invalidateDisplay(forCharacterRange: slot.range)
    }
    attachmentUpdates.removeAll()
    textView.setNeedsDisplay()
  }

  private func synchronizeAttachments() {
    guard !synchronizingAttachments else { return }
    guard let window, !pausedAttachments, !isHidden, !window.isHidden else { releaseAttachments(); return }
    guard !attachments.isEmpty, container.size.width > 0 else { return }
    synchronizingAttachments = true
    defer { synchronizingAttachments = false }
    var viewport = window.convert(window.bounds, to: textView)
    var ancestor = superview
    while let view = ancestor {
      if view.isHidden { releaseAttachments(); return }
      if view is UIScrollView { viewport = viewport.intersection(view.convert(view.bounds, to: textView)) }
      ancestor = view.superview
    }
    guard !viewport.isNull, viewport.height > 0 else { releaseAttachments(); return }
    guard lastAttachmentViewport != viewport else { return }
    lastAttachmentViewport = viewport
    let top = Double(viewport.minY - viewport.height)
    let bottom = Double(viewport.maxY + viewport.height)
    manager.ensureLayout(for: container)
    for slot in attachments {
      let glyphs = manager.glyphRange(forCharacterRange: slot.range, actualCharacterRange: nil)
      let rect = manager.boundingRect(forGlyphRange: glyphs, in: container)
      let active = intersectsRichTextAttachmentViewport(top: Double(rect.minY), bottom: Double(rect.maxY), viewportTop: top, viewportBottom: bottom)
      if slot.visibility.setActive(active), !active {
        slot.request?.cancel(); slot.request = nil; slot.attachment.releaseAsset()
        manager.invalidateDisplay(forCharacterRange: slot.range)
      }
      guard let revision = slot.visibility.beginLoad() else { continue }
      let currentGeneration = generation
      slot.request = RichTextAttachmentLoader.load(spec: slot.spec, fontSize: slot.fontSize, maxWidth: slot.maxWidth, scale: slot.scale) { [weak self, weak slot] asset in
        guard let self, let slot, self.generation == currentGeneration, slot.visibility.accepts(revision) else { return }
        slot.request = nil
        guard let asset else { return }
        self.attachmentUpdates.append((slot, revision, asset))
        self.scheduleAttachmentUpdate(generation: currentGeneration)
      }
    }
  }

  private var renderedIdentity: (String, String)?

  private func applyFont(_ content: NSMutableAttributedString, range: NSRange, fallback: UIFont, transform: @escaping (UIFont) -> UIFont) {
    var updates: [(NSRange, UIFont)] = []
    content.enumerateAttribute(.font, in: range) { value, effective, _ in
      updates.append((effective, transform(value as? UIFont ?? fallback)))
    }
    for (range, font) in updates { content.addAttribute(.font, value: font, range: range) }
  }

  private func scheduleAttachmentUpdate(generation: Int) {
    guard !attachmentUpdateScheduled else { return }
    attachmentUpdateScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self, self.generation == generation else { return }
      self.attachmentUpdateScheduled = false
      let updates = self.attachmentUpdates.filter { $0.0.visibility.accepts($0.1) }
      self.attachmentUpdates.removeAll()
      let selection = self.textView.selectedRange
      self.suppressSelection = true
      self.storage.beginEditing()
      for (slot, _, asset) in updates {
        slot.attachment.update(asset: asset)
        slot.visibility.hasAsset = true
        self.storage.edited(.editedAttributes, range: slot.range, changeInLength: 0)
      }
      self.storage.endEditing()
      // TextKit can generate glyphs when invalidating layout; the storage edit
      // transaction must be finished before asking it to fill layout holes.
      for (slot, _, _) in updates {
        self.manager.invalidateLayout(forCharacterRange: slot.range, actualCharacterRange: nil)
        self.manager.invalidateDisplay(forCharacterRange: slot.range)
      }
      self.textView.selectedRange = selection
      self.suppressSelection = false
      self.lastAttachmentViewport = nil
      self.measureAndLayout(width: self.effectiveWidth)
      self.textView.setNeedsDisplay()
      self.setNeedsLayout()
    }
  }

  private func measureAndLayout(width: CGFloat) {
    guard width > 0, let flow else { textView.frame = .zero; return }
    measureCount += 1
    if performanceTracing && firstMeasureEpochMs == nil {
      firstMeasureEpochMs = Date().timeIntervalSince1970 * 1000
    }
    let measurementStart = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    container.size = CGSize(width: width, height: .greatestFiniteMagnitude)
    manager.ensureLayout(for: container)
    let fit = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    let measurementEnd = measurementStart == nil ? nil : ProcessInfo.processInfo.systemUptime
    let rawHeight = flow.text.length == 0 ? 0 : max(fit.height, manager.usedRect(for: container).maxY)
    guard rawHeight.isFinite else { return }
    let pixelScale = max(1, traitCollection.displayScale)
    let height = ceil(rawHeight * pixelScale) / pixelScale
    textView.frame = CGRect(x: 0, y: 0, width: width, height: height)
    lastMeasuredWidth = width
    synchronizeAttachments()
    let key = "\(flow.id)|\(flow.textVersion)|\(layoutKey)|\(height)"
    guard key != lastHeightKey else { return }
    lastHeightKey = key
    if nativeAutoSize {
      // UIKit and Fabric both use points. React still receives the measured
      // height event for readiness and stale-document checks.
      setViewSize(CGSize(width: width, height: height))
      setViewSizeCount += 1
    }
    let sizeRequestTime = performanceTracing && nativeAutoSize ? ProcessInfo.processInfo.systemUptime : nil
    let propsTime = tracePropsTime
    let currentGeneration = generation
    let currentLayoutKey = layoutKey
    let dispatchScheduledAt = performanceTracing ? ProcessInfo.processInfo.systemUptime : nil
    DispatchQueue.main.async { [weak self] in
      guard let self, self.generation == currentGeneration, self.layoutKey == currentLayoutKey,
            self.lastHeightKey == key, self.flow?.id == flow.id, self.flow?.textVersion == flow.textVersion else { return }
      var event: [String: Any] = ["flowId": flow.id, "textVersion": flow.textVersion, "layoutKey": currentLayoutKey, "height": Double(height)]
      let now = ProcessInfo.processInfo.systemUptime
      if let dispatchScheduledAt {
        event["heightPostWaitMs"] = (now - dispatchScheduledAt) * 1000
      }
      if let measurementStart, let measurementEnd {
        let measureDuration = (measurementEnd - measurementStart) * 1000
        event["nativeMeasureMs"] = measureDuration
        event["nativeSuperMeasureMs"] = measureDuration
        if let propsTime {
          event["nativePropsToMeasureMs"] = (measurementEnd - propsTime) * 1000
          if let sizeRequestTime { event["nativePropsToSizeRequestMs"] = (sizeRequestTime - propsTime) * 1000 }
          event["nativePropsToDispatchMs"] = (now - propsTime) * 1000
        }
      }
      if let rebuildMs = self.lastRebuildMs { event["nativeRebuildMs"] = rebuildMs }
      if let parseMs = self.lastParseMs { event["nativeParseMs"] = parseMs }
      if let spannableMs = self.lastSpannableMs { event["nativeSpannableMs"] = spannableMs }
      if let setTextMs = self.lastSetTextMs { event["nativeSetTextMs"] = setTextMs }
      event["measureCount"] = self.measureCount
      event["setViewSizeCount"] = self.setViewSizeCount
      if let propsSetEpoch = self.lastPropsSetEpochMs { event["nativePropsSetEpochMs"] = propsSetEpoch }
      if let firstMeasureEpoch = self.firstMeasureEpochMs { event["nativeFirstMeasureEpochMs"] = firstMeasureEpoch }
      if let firstLayoutEpoch = self.firstLayoutEpochMs { event["nativeFirstLayoutEpochMs"] = firstLayoutEpoch }
      if self.performanceTracing { event["nativeDispatchEpochMs"] = Date().timeIntervalSince1970 * 1000 }
      self.onHeightChange(event)
    }
  }

  public func textViewDidChangeSelection(_ textView: UITextView) { emitSelection() }

  private func emitSelection() {
    guard !suppressSelection, let flow, renderedIdentity?.0 == flow.id, renderedIdentity?.1 == flow.textVersion else { return }
    let selection = textView.selectedRange
    let valid = selectable && validRichTextRange(selection, in: flow.text)
    let start = valid ? selection.location : -1
    let end = valid ? NSMaxRange(selection) : -1
    let key = "\(flow.id)|\(flow.textVersion)|\(start)|\(end)"
    guard key != lastSelectionKey else { return }
    lastSelectionKey = key
    onSelectionChange(["flowId": flow.id, "textVersion": flow.textVersion, "start": start, "end": end])
  }

  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    if gestureRecognizer === tap {
      tapHadSelection = textView.selectedRange.length > 0
      longPressActive = false
    }
    return true
  }

  public override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    if gestureRecognizer === longPress {
      return action(at: gestureRecognizer.location(in: textView))?.kind == "attachment"
    }
    return true
  }

  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    gestureRecognizer === tap || gestureRecognizer === longPress
  }

  @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended, !tapHadSelection, !longPressActive, textView.selectedRange.length == 0,
          let item = action(at: gesture.location(in: textView)) else { return }
    emitAction(item.spec, kind: item.kind)
  }

  @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
    guard gesture.state == .began else { return }
    longPressActive = true
    if let item = action(at: gesture.location(in: textView)), item.kind == "attachment" {
      emitAction(item.spec, kind: "attachmentLongPress")
    }
  }

  private func action(at point: CGPoint) -> (spec: RichTextSpec, kind: String)? {
    guard let flow, manager.numberOfGlyphs > 0 else { return nil }
    let location = CGPoint(x: point.x - textView.textContainerInset.left + textView.contentOffset.x, y: point.y - textView.textContainerInset.top + textView.contentOffset.y)
    let glyph = manager.glyphIndex(for: location, in: container)
    guard glyph < manager.numberOfGlyphs,
          manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container).contains(location) else { return nil }
    let character = manager.characterIndexForGlyph(at: glyph)
    let groups: [([RichTextSpec], String)] = [
      (flow.attachments.filter { spec in
        guard let range = richTextRange(spec, in: flow.text), range.length == 1 else { return false }
        return flow.text.character(at: range.location) == 0xfffc
      }, "attachment"),
      (flow.decorations.filter { $0["actionId"] as? String != nil }, "segment"),
      (flow.spans.filter { $0["kind"] as? String == "link" }, "link")
    ]
    for (specs, kind) in groups {
      if let spec = specs.first(where: { spec in
        guard let range = richTextRange(spec, in: flow.text) else { return false }
        return NSLocationInRange(character, range)
      }) { return (spec, kind) }
    }
    return nil
  }

  private func emitAction(_ spec: RichTextSpec, kind: String) {
    guard let flow, let range = richTextRange(spec, in: flow.text) else { return }
    let id = (kind == "link" ? spec["nodeId"] : kind == "segment" ? spec["actionId"] : spec["id"]) as? String
    guard let id else { return }
    var event: [String: Any] = ["flowId": flow.id, "textVersion": flow.textVersion, "kind": kind, "id": id, "start": range.location, "end": NSMaxRange(range)]
    if let url = spec["url"] as? String { event["url"] = url }
    onAction(event)
  }
}
