import {
  getProfileAvatarBridge,
  type ProfileAvatarBridgeFrame,
} from '../src/components/profile/profileAvatarBridgeGeometry';

type Target = ProfileAvatarBridgeFrame['target'];
type Point = { x: number; y: number };

function distanceToSpine(target: Target, p: Point) {
  const radius = Math.min(target.width, target.height) / 2;
  const dx = Math.max(
    target.x + radius - p.x,
    p.x - (target.x + target.width - radius),
    0,
  );
  const dy = Math.max(
    target.y + radius - p.y,
    p.y - (target.y + target.height - radius),
    0,
  );
  return Math.hypot(dx, dy);
}

function pointsOf(path: string): Point[] {
  const coords = path
    .split(/\s+/)
    .filter((item) => !['M', 'C', 'L', 'Z'].includes(item))
    .map(Number);
  expect(coords.every(Number.isFinite)).toBe(true);
  expect(coords).toHaveLength(16);
  return Array.from({ length: coords.length / 2 }, (_, i) => ({
    x: coords[i * 2],
    y: coords[i * 2 + 1],
  }));
}

describe('profile avatar liquid bridge', () => {
  const pill = { x: 30, y: 10, width: 100, height: 30 };
  const camera = { x: 80, y: 8, width: 20, height: 20 };
  const cameraToTop = { x: 80, y: 0, width: 23, height: 34 };

  test.each([
    { target: pill, avatar: { cx: 80, cy: 57, r: 12 } },
    { target: pill, avatar: { cx: 131, cy: 48, r: 12 } },
    { target: camera, avatar: { cx: 90, cy: 43, r: 10 } },
    { target: cameraToTop, avatar: { cx: 91.5, cy: 49, r: 10 } },
  ])('joins both sides to the actual cutout and avatar outlines', (frame) => {
    const { d, opacity } = getProfileAvatarBridge(frame);
    const points = pointsOf(d);
    const { target, avatar } = frame;
    expect(opacity).toBeGreaterThan(0);
    for (const base of [points[0], points[7]]) {
      expect(distanceToSpine(target, base)).toBeCloseTo(
        Math.min(target.width, target.height) / 2,
      );
    }
    for (const tip of [points[3], points[4]]) {
      expect(Math.hypot(tip.x - avatar.cx, tip.y - avatar.cy)).toBeCloseTo(
        avatar.r,
      );
    }
  });

  test('releases the neck continuously on the way out and absorbs it on the way in', () => {
    const opacity = (cy: number) =>
      getProfileAvatarBridge({ target: camera, avatar: { cx: 90, cy, r: 10 } })
        .opacity;
    const opacities = Array.from({ length: 81 }, (_, i) => opacity(25 + i / 2));
    const peak = opacities.indexOf(Math.max(...opacities));
    expect(opacities[0]).toBe(0);
    expect(opacities[peak]).toBe(1);
    expect(opacities[opacities.length - 1]).toBe(0);
    for (let i = 1; i < opacities.length; i++) {
      const change = opacities[i] - opacities[i - 1];
      if (i <= peak) expect(change).toBeGreaterThanOrEqual(0);
      else expect(change).toBeLessThanOrEqual(0);
      expect(Math.abs(change)).toBeLessThan(1);
    }
  });

  test('follows the same cutout in translated view coordinates', () => {
    const frame = { target: camera, avatar: { cx: 99, cy: 38, r: 10 } };
    const delta = { x: 103, y: -42 };
    const before = getProfileAvatarBridge(frame);
    const after = getProfileAvatarBridge({
      target: { ...camera, x: camera.x + delta.x, y: camera.y + delta.y },
      avatar: {
        ...frame.avatar,
        cx: frame.avatar.cx + delta.x,
        cy: frame.avatar.cy + delta.y,
      },
    });
    expect(after.opacity).toBeCloseTo(before.opacity);
    const original = pointsOf(before.d);
    for (const [i, actual] of pointsOf(after.d).entries()) {
      expect(actual.x).toBeCloseTo(original[i].x + delta.x);
      expect(actual.y).toBeCloseTo(original[i].y + delta.y);
    }
  });

  test('leaves the header clear for unknown geometry, a vanished avatar, or a distant cutout', () => {
    const avatar = { cx: 90, cy: 43, r: 10 };
    for (const frame of [
      null,
      { target: { ...camera, width: 0 }, avatar },
      { target: { ...camera, y: NaN }, avatar },
      { target: camera, avatar: { ...avatar, r: 0 } },
      { target: camera, avatar: { ...avatar, cy: 150 } },
      { target: camera, avatar: { ...avatar, cy: 18 } },
    ]) {
      expect(getProfileAvatarBridge(frame)).toEqual({ d: '', opacity: 0 });
    }
  });
});
