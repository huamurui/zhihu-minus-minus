import ExpoModulesCore
import QuartzCore
import UIKit

public final class PullRefreshView: ExpoView, UIGestureRecognizerDelegate {
  private let onPull = EventDispatcher()
  private let onRefreshTriggered = EventDispatcher()
  private let pullGesture: UIPanGestureRecognizer
  private let progressFeedback = UIImpactFeedbackGenerator(style: .soft)
  private let thresholdFeedback = UIImpactFeedbackGenerator(style: .rigid)

  private weak var childView: UIView?
  private var threshold: CGFloat = 76
  private var holdDistance: CGFloat = 68
  private var maxPullDistance: CGFloat = 128
  private var pullOffset: CGFloat = 0
  private var pullEnabled = true
  private var hapticsEnabled = true
  private var refreshing = false
  private var refreshLatched = false
  private var thresholdHapticArmed = true
  private var lastHapticAt = 0.0
  private var isPulling = false

  public required init(appContext: AppContext? = nil) {
    pullGesture = UIPanGestureRecognizer()
    super.init(appContext: appContext)

    clipsToBounds = false
    pullGesture.addTarget(self, action: #selector(handlePan(_:)))
    pullGesture.delegate = self
    pullGesture.cancelsTouchesInView = false
    pullGesture.maximumNumberOfTouches = 1
    addGestureRecognizer(pullGesture)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    if childView == nil {
      childView = subviews.first
    }
  }

  func setPullEnabled(_ enabled: Bool) {
    pullEnabled = enabled
    if !enabled && !refreshing && pullOffset > 0 {
      isPulling = false
      animatePull(to: 0)
    }
  }

  func setHapticsEnabled(_ enabled: Bool) {
    hapticsEnabled = enabled
    if !enabled {
      lastHapticAt = 0
    }
  }

  func setRefreshing(_ value: Bool) {
    guard refreshing != value else { return }

    refreshing = value
    thresholdHapticArmed = !value
    lastHapticAt = 0
    if value {
      refreshLatched = true
      animatePull(to: holdDistance)
    } else {
      refreshLatched = false
      animatePull(to: 0)
    }
  }

  func setThreshold(_ value: Double) {
    threshold = max(CGFloat(value), 1)
    constrainDistances()
  }

  func setHoldDistance(_ value: Double) {
    holdDistance = max(CGFloat(value), 0)
    constrainDistances()
  }

  func setMaxPullDistance(_ value: Double) {
    maxPullDistance = max(CGFloat(value), 1)
    constrainDistances()
  }

  func dispose() {
    pullGesture.isEnabled = false
  }

  public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === pullGesture, canStartPull() else { return false }

    let pan = gestureRecognizer as! UIPanGestureRecognizer
    let velocity = pan.velocity(in: self)
    return velocity.y > 0 && abs(velocity.y) > abs(velocity.x) && contentIsAtTop()
  }

  public func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    gestureRecognizer === pullGesture
  }

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    guard pullEnabled, !refreshing else { return }

    switch gesture.state {
    case .began:
      isPulling = true
      progressFeedback.prepare()
      thresholdFeedback.prepare()

    case .changed:
      guard isPulling else { return }
      keepContentAtTop()
      let fingerDistance = max(0, gesture.translation(in: self).y)
      updatePullOffset(applyDragResistance(fingerDistance), dragging: true)

    case .ended:
      guard isPulling else { return }
      isPulling = false
      settleAfterRelease()

    case .cancelled, .failed:
      guard isPulling else { return }
      isPulling = false
      animatePull(to: 0)

    default:
      break
    }
  }

  private func canStartPull() -> Bool {
    pullEnabled && !refreshing && !refreshLatched && findScrollView() != nil
  }

  private func findScrollView(in view: UIView? = nil) -> UIScrollView? {
    let root = view ?? childView ?? subviews.first
    guard let root else { return nil }
    if let scrollView = root as? UIScrollView,
       scrollView.alwaysBounceVertical || scrollView.contentSize.height > scrollView.bounds.height {
      return scrollView
    }
    for subview in root.subviews {
      if let scrollView = findScrollView(in: subview) { return scrollView }
    }
    return nil
  }

  private func contentIsAtTop() -> Bool {
    guard let scrollView = findScrollView() else { return false }
    return scrollView.contentOffset.y <= -scrollView.adjustedContentInset.top + 1
  }

  private func keepContentAtTop() {
    guard let scrollView = findScrollView() else { return }
    let topOffset = -scrollView.adjustedContentInset.top
    if scrollView.contentOffset.y < topOffset || scrollView.contentOffset.y > topOffset {
      scrollView.setContentOffset(CGPoint(x: scrollView.contentOffset.x, y: topOffset), animated: false)
    }
  }

  private func applyDragResistance(_ fingerDistance: CGFloat) -> CGFloat {
    let thresholdFingerDistance = threshold / baseDragResistance
    if fingerDistance <= thresholdFingerDistance {
      return min(maxPullDistance, fingerDistance * baseDragResistance)
    }

    let extraFingerDistance = fingerDistance - thresholdFingerDistance
    return min(maxPullDistance, threshold + extraFingerDistance * extraDragResistance)
  }

  private func settleAfterRelease() {
    guard pullEnabled, !refreshing, !refreshLatched else { return }

    if pullOffset >= threshold {
      emitThresholdHapticIfNeeded()
      refreshLatched = true
      animatePull(to: holdDistance)
      onRefreshTriggered()
    } else {
      animatePull(to: 0)
    }
  }

  private func animatePull(to target: CGFloat) {
    layer.removeAllAnimations()
    let constrainedTarget = min(max(target, 0), maxPullDistance)
    if abs(pullOffset - constrainedTarget) < 0.5 {
      updatePullOffset(constrainedTarget, dragging: false)
      return
    }

    let duration = constrainedTarget == 0 ? resetDuration : holdDuration
    UIView.animate(
      withDuration: duration,
      delay: 0,
      options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]
    ) { [weak self] in
      self?.updatePullOffset(constrainedTarget, dragging: false)
    }
  }

  private func updatePullOffset(_ offset: CGFloat, dragging: Bool) {
    pullOffset = min(max(offset, 0), maxPullDistance)
    updateProgressHaptic(dragging: dragging)

    if pullOffset < threshold * thresholdRearmProgress {
      thresholdHapticArmed = true
    }
    emitThresholdHapticIfNeeded()

    childView?.transform = CGAffineTransform(translationX: 0, y: pullOffset)
    onPull([
      "offset": Double(pullOffset),
      "progress": Double(max(pullOffset / threshold, 0)),
      "dragging": dragging
    ])
  }

  private func emitThresholdHapticIfNeeded() {
    guard !refreshing, thresholdHapticArmed, pullOffset >= threshold else { return }

    thresholdHapticArmed = false
    guard hapticsEnabled else { return }
    thresholdFeedback.impactOccurred(intensity: 0.65)
    thresholdFeedback.prepare()
  }

  private func updateProgressHaptic(dragging: Bool) {
    guard dragging, hapticsEnabled, !refreshing, pullOffset >= 2, pullOffset < threshold else {
      if !dragging || pullOffset < 2 { lastHapticAt = 0 }
      return
    }

    let progress = min(max(pullOffset / threshold, 0), 1)
    let interval = 0.07 - Double(progress) * 0.025
    let now = CACurrentMediaTime()
    guard lastHapticAt == 0 || now - lastHapticAt >= interval else { return }

    progressFeedback.impactOccurred(intensity: 0.08 + progress * 0.3)
    progressFeedback.prepare()
    lastHapticAt = now
  }

  private func constrainDistances() {
    maxPullDistance = max(maxPullDistance, threshold)
    holdDistance = min(max(holdDistance, 0), maxPullDistance)
    updatePullOffset(pullOffset, dragging: false)
  }

  private let baseDragResistance: CGFloat = 0.5
  private let extraDragResistance: CGFloat = 0.28
  private let resetDuration: TimeInterval = 0.22
  private let holdDuration: TimeInterval = 0.16
  private let thresholdRearmProgress: CGFloat = 0.99
}
