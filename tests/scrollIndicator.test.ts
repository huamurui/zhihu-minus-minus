import {
  calculateScrollIndicatorGeometry,
  updateScrollIndicatorPull,
} from '../src/utils/scrollIndicator';

describe('reading scroll indicator geometry', () => {
  it.each([0, 300, 500])(
    'hides content of height %s that fits in the viewport',
    (contentHeight) => {
      expect(
        calculateScrollIndicatorGeometry(0, contentHeight, 500, 400),
      ).toEqual({ visible: false, thumbHeight: 0, thumbOffset: 0 });
    },
  );

  it('uses the full viewport for the thumb ratio and the inset track for travel', () => {
    expect(calculateScrollIndicatorGeometry(0, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 0,
    });
    expect(calculateScrollIndicatorGeometry(750, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 150,
    });
    expect(calculateScrollIndicatorGeometry(1500, 2000, 500, 400)).toEqual({
      visible: true,
      thumbHeight: 100,
      thumbOffset: 300,
    });
  });

  it.each(['top', 'bottom'])(
    'compresses a pinned thumb during an elastic pull at the %s and restores it on return',
    (edge) => {
      const pull = (distance: number) =>
        calculateScrollIndicatorGeometry(
          edge === 'top' ? -distance : 1500 + distance,
          2000,
          500,
          400,
        );
      const resting = pull(0);
      const small = pull(20);
      const large = pull(80);
      const extreme = pull(1e8);
      expect(small.thumbHeight).toBeLessThan(resting.thumbHeight);
      expect(large.thumbHeight).toBeLessThan(small.thumbHeight);
      expect(extreme.thumbHeight).toBeGreaterThan(0);
      for (const thumb of [resting, small, large, extreme]) {
        if (edge === 'top') expect(thumb.thumbOffset).toBe(0);
        else expect(thumb.thumbOffset + thumb.thumbHeight).toBeCloseTo(400);
      }
      expect(pull(20)).toEqual(small);
      expect(pull(0)).toEqual(resting);
    },
  );

  it('compresses a clamped native edge using only unconsumed movement at that edge', () => {
    const range = 1500;
    expect(updateScrollIndicatorPull(0, -50, 500, range)).toBe(0);
    const topPull = updateScrollIndicatorPull(0, -50, 0, range);
    const bottomPull = updateScrollIndicatorPull(0, 50, range, range);
    expect(topPull).toBe(-50);
    expect(bottomPull).toBe(50);
    expect(updateScrollIndicatorPull(topPull, 30, 0, range)).toBe(-20);
    expect(updateScrollIndicatorPull(topPull, 100, 0, range)).toBe(0);
    expect(updateScrollIndicatorPull(bottomPull, -30, range, range)).toBe(20);
    expect(updateScrollIndicatorPull(bottomPull, -100, range, range)).toBe(0);

    const thumb = (offset: number, drag = 0) =>
      calculateScrollIndicatorGeometry(offset, 2000, 500, 400, undefined, drag);
    expect(thumb(0, topPull)).toEqual(thumb(-50));
    expect(thumb(range, bottomPull)).toEqual(thumb(range + 50));
    expect(thumb(500, bottomPull)).toEqual(thumb(500));
    expect(thumb(-30, topPull)).toEqual(thumb(-30));
    expect(updateScrollIndicatorPull(topPull, -10, 0, 0)).toBe(0);
  });

  it('keeps a long-content thumb legible without overflowing a tiny track', () => {
    expect(
      calculateScrollIndicatorGeometry(4500, 10000, 500, 400).thumbHeight,
    ).toBe(28);
    expect(calculateScrollIndicatorGeometry(9500, 10000, 500, 18)).toEqual({
      visible: true,
      thumbHeight: 18,
      thumbOffset: 0,
    });
  });

  it.each([
    [Number.NaN, 2000, 500, 400],
    [0, Number.POSITIVE_INFINITY, 500, 400],
    [0, 2000, Number.NaN, 400],
    [0, 2000, 0, 400],
    [0, 2000, -100, 400],
    [0, 2000, 500, Number.POSITIVE_INFINITY],
    [0, 2000, 500, 0],
    [0, 2000, 500, -100],
  ])('hides invalid measurements (%s, %s, %s, %s)', (...measurements) => {
    expect(calculateScrollIndicatorGeometry(...measurements)).toEqual({
      visible: false,
      thumbHeight: 0,
      thumbOffset: 0,
    });
  });
});
