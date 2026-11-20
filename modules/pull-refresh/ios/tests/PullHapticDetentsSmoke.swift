// swiftc PullHapticDetents.swift tests/PullHapticDetentsSmoke.swift -o /tmp/pull-detents
@main
struct PullHapticDetentsSmoke {
  static func main() {
    let teeth = [0.2, 0.5, 0.75, 0.9]
    var slow = PullHapticDetents(positions: teeth)
    var slowTicks: [Double] = []
    for step in 0...110 {
      slowTicks += slow.cross(to: Double(step) / 100)
    }

    var fast = PullHapticDetents(positions: teeth)
    let fastTicks = fast.cross(to: 1.1)
    precondition(slowTicks == teeth + [1] && fastTicks == slowTicks, "Sampling must not lose crossed detents")
    precondition(PullHapticDetents.pulses(for: fastTicks) == [1, 0.2, 0.9], "A jump to threshold must carry an immediate accent and texture")
    precondition(fast.cross(to: 1.1).isEmpty && fast.cross(to: 0.99).isEmpty && fast.cross(to: 1).isEmpty, "Resting at threshold must stay quiet")
    precondition(fast.cross(to: 0.97).isEmpty && fast.cross(to: 1) == [1], "A deliberate retreat rearms confirmation")

    precondition(fast.cross(to: 0.89).isEmpty && fast.cross(to: 0.905).isEmpty, "Jitter at a tooth must stay quiet")
    precondition(fast.cross(to: 0.49) == [0.9, 0.75], "Reversing crosses the same teeth in reverse order with slack")
    precondition(fast.cross(to: 0.46) == [0.5] && fast.cross(to: 0.52) == [0.5], "A deliberate direction change should engage the tooth again")

    let toothCount = 42
    let denseTeeth = (1...toothCount).map { Double($0) / Double(toothCount + 1) }
    var dense = PullHapticDetents(positions: denseTeeth)
    precondition(dense.cross(to: 1) == denseTeeth + [1], "A fast pull crosses every configured tooth and confirms once")
    let pitch = denseTeeth[0]
    let last = denseTeeth[toothCount - 1]
    precondition(dense.cross(to: last - pitch * 0.25).isEmpty, "Small reversals stay silent")
    precondition(dense.cross(to: last - pitch * 0.75) == [last], "Reversing engages before reaching the previous tooth")

    fast.align(to: 0)
    precondition(fast.cross(to: 0).isEmpty && fast.cross(to: 0.2) == [0.2], "Settling silently restores the next pull")
    fast.align(to: 0.79)
    precondition(fast.cross(to: 0.80).isEmpty && fast.cross(to: 0.91) == [0.9], "Re-enabling mid-gesture must not replay old teeth")
    precondition(PullHapticDetents.pulses(for: teeth) == [0.2, 0.75, 0.9], "A sparse move produces a bounded roll")
  }
}
