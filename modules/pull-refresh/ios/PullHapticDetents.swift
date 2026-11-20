// Positions are fractions of the visible distance to the refresh threshold.
struct PullHapticDetents {
  private let positions: [Double]
  private var crossedCount = 0
  private var thresholdArmed = true
  private let thresholdRearmSlack = 0.015

  init(positions: [Double] = []) {
    self.positions = Set(positions.filter { $0 > 0 && $0 < 1 }).sorted()
  }

  mutating func align(to progress: Double) {
    crossedCount = positions.prefix { $0 <= progress }.count
    thresholdArmed = progress < 1
  }

  mutating func cross(to progress: Double) -> [Double] {
    var ticks: [Double] = []
    while crossedCount < positions.count && progress >= positions[crossedCount] {
      ticks.append(positions[crossedCount])
      crossedCount += 1
    }
    while crossedCount > 0 {
      let tooth = positions[crossedCount - 1]
      let previousTooth = crossedCount > 1 ? positions[crossedCount - 2] : 0
      let reverseSlack = min(thresholdRearmSlack, (tooth - previousTooth) / 2)
      guard progress < tooth - reverseSlack else { break }
      crossedCount -= 1
      ticks.append(tooth)
    }

    if progress < 1 - thresholdRearmSlack {
      thresholdArmed = true
    }
    if thresholdArmed && progress >= 1 {
      thresholdArmed = false
      ticks.append(1)
    }
    return ticks
  }

  // A fast sample can cross the entire track. Play the threshold accent first
  // so releasing immediately cannot cancel it along with the remaining texture.
  static func pulses(for ticks: [Double]) -> [Double] {
    guard let first = ticks.first, let last = ticks.last else { return [] }
    if last == 1 && ticks.count > 1 {
      return ticks.count == 2 ? [1, first] : [1, first, ticks[ticks.count - 2]]
    }
    if ticks.count > 3 {
      return [first, ticks[ticks.count / 2], last]
    }
    return ticks
  }
}
