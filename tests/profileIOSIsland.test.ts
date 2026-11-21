import { getProfileIOSIslandRect } from '../src/utils/profileIOSIsland';

describe('iOS profile avatar cutout', () => {
  test.each([
    ['iPhone15,2', 393, 852, 59],
    ['iPhone17,4', 430, 932, 59],
    ['iPhone18,1', 402, 874, 62],
    ['iPhone18,2', 440, 956, 62],
    ['iPhone18,4', 420, 912, 68],
    ['iPhone19,2', 402, 874, 62],
  ] as const)(
    'places the attachment inside the status area of %s',
    (id, width, height, top) => {
      const rect = getProfileIOSIslandRect(id, width, height, top);
      expect(rect).not.toBeNull();
      if (!rect) throw new Error('missing island');
      expect(rect.x + rect.width / 2).toBe(width / 2);
      expect(rect.y).toBeGreaterThan(0);
      expect(rect.y + rect.height).toBeLessThan(top);
    },
  );

  test.each([
    null,
    'arm64',
    'iPhone14,6',
    'iPhone14,7',
    'iPhone17,5',
    'iPhone18,5',
    'iPad16,5',
    'iPhone99,1',
  ])(
    'requires a known island model on hardware even when the viewport matches (%s)',
    (modelId) => {
      expect(getProfileIOSIslandRect(modelId, 393, 852, 59)).toBeNull();
    },
  );

  test('falls back for landscape, Display Zoom, partial windows, and unmeasured safe areas', () => {
    for (const [width, height, top] of [
      [852, 393, 0],
      [375, 812, 54],
      [393, 738, 59],
      [393, 852, 0],
      [393, 852, Number.NaN],
    ]) {
      expect(
        getProfileIOSIslandRect('iPhone15,2', width, height, top),
      ).toBeNull();
    }
  });

  test('keeps ambiguous Simulator targets inside both generations of island', () => {
    const width = 402;
    const simulated = getProfileIOSIslandRect('arm64', width, 874, 62, true);
    const older = getProfileIOSIslandRect('iPhone18,1', width, 874, 62);
    const newer = getProfileIOSIslandRect('iPhone19,2', width, 874, 62);
    expect(simulated).toEqual(newer);
    expect(simulated?.width).toBeLessThan(older?.width ?? 0);
    expect(getProfileIOSIslandRect('arm64', 375, 667, 20, true)).toBeNull();
    expect(getProfileIOSIslandRect('x86_64', width, 874, 47, true)).toBeNull();
    expect(
      getProfileIOSIslandRect('iPhone99,1', width, 874, 62, true),
    ).toBeNull();
  });
});
