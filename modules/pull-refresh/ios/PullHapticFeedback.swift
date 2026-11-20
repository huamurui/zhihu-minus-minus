import CoreHaptics
import UIKit

final class PullHapticFeedback {
  private let light = UIImpactFeedbackGenerator(style: .light)
  private let rigid = UIImpactFeedbackGenerator(style: .rigid)
  private var rollPlayer: CHHapticPatternPlayer?
  private lazy var engine: CHHapticEngine? = {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics,
          let engine = try? CHHapticEngine() else { return nil }
    engine.playsHapticsOnly = true
    engine.isAutoShutdownEnabled = true
    return engine
  }()

  func prepare() {
    light.prepare()
    rigid.prepare()
    engine?.start(completionHandler: nil)
  }

  func cancelRoll() {
    try? rollPlayer?.stop(atTime: CHHapticTimeImmediate)
    rollPlayer = nil
  }

  func play(_ ticks: [Double]) {
    guard let first = ticks.first else { return }
    cancelRoll()
    if let engine {
      let events = ticks.enumerated().map { index, position in
        CHHapticEvent(eventType: .hapticTransient, parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity(at: position))),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: position == 1 ? 0.9 : 0.65)
        ], relativeTime: Double(index) * 0.016)
      }
      do {
        let pattern = try CHHapticPattern(events: events, parameters: [])
        let player = try engine.makePlayer(with: pattern)
        try player.start(atTime: CHHapticTimeImmediate)
        rollPlayer = ticks.count > 1 ? player : nil
        return
      } catch {
        // Players are single-use, so a reset cannot leave cached players stale.
        // Recover for the next crossing and use UIKit immediately for this one.
        engine.start(completionHandler: nil)
      }
    }
    let position = first == 1 ? first : ticks[ticks.count - 1]
    let feedback = position == 1 ? rigid : light
    feedback.impactOccurred(intensity: intensity(at: position))
    feedback.prepare()
  }

  private func intensity(at position: Double) -> CGFloat {
    position == 1 ? 0.72 : 0.36 * position
  }
}
