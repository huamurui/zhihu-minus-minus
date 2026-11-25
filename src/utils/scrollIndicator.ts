export interface ScrollIndicatorGeometry {
  visible: boolean;
  thumbHeight: number;
  thumbOffset: number;
}

// Android may report a fractional gap of up to one layout unit at its native edge.
const EDGE_TOLERANCE = 1;

/** Residual finger travel while the native Android scroll offset is pinned. */
export function updateScrollIndicatorPull(
  previousPull: number,
  delta: number,
  scrollY: number,
  scrollableDistance: number,
): number {
  'worklet';
  if (scrollableDistance <= 0) return 0;
  const pull = previousPull + delta;
  if (pull < 0 && scrollY <= EDGE_TOLERANCE) return pull;
  if (pull > 0 && scrollY >= scrollableDistance - EDGE_TOLERANCE) return pull;
  return 0;
}

/** Viewport height describes the ScrollView; track height may exclude overlays. */
export function calculateScrollIndicatorGeometry(
  scrollY: number,
  contentHeight: number,
  viewportHeight: number,
  trackHeight: number,
  minimumThumbHeight = 28,
  edgePull = 0,
): ScrollIndicatorGeometry {
  'worklet';
  if (
    !Number.isFinite(scrollY) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(trackHeight) ||
    contentHeight <= 0 ||
    viewportHeight <= 0 ||
    trackHeight <= 0 ||
    contentHeight <= viewportHeight
  ) {
    return { visible: false, thumbHeight: 0, thumbOffset: 0 };
  }

  const minimum = Number.isFinite(minimumThumbHeight)
    ? Math.max(0, minimumThumbHeight)
    : 28;
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(minimum, (viewportHeight / contentHeight) * trackHeight),
  );
  const scrollableDistance = contentHeight - viewportHeight;
  const clampedOffset = Math.min(scrollableDistance, Math.max(0, scrollY));
  const overscroll =
    scrollY - clampedOffset ||
    updateScrollIndicatorPull(0, edgePull, scrollY, scrollableDistance);
  if (overscroll !== 0) {
    const compressedHeight = Math.max(
      Math.min(8, thumbHeight),
      thumbHeight / (1 + Math.abs(overscroll) / thumbHeight),
    );
    return {
      visible: true,
      thumbHeight: compressedHeight,
      thumbOffset: overscroll < 0 ? 0 : trackHeight - compressedHeight,
    };
  }

  return {
    visible: true,
    thumbHeight,
    thumbOffset:
      (clampedOffset / scrollableDistance) * (trackHeight - thumbHeight),
  };
}
