export interface DisplayCutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CutoutMeasurement {
  rect: DisplayCutoutRect | null;
  viewportWidth: number;
  viewportHeight: number;
}

/** Only follow a complete, compact camera cutout clear of the status icons. */
export function getCameraHole({
  rect,
  viewportWidth,
  viewportHeight,
}: CutoutMeasurement): DisplayCutoutRect | null {
  if (!rect || viewportWidth >= viewportHeight) return null;
  const { x, y, width, height } = rect;
  const centerOffset = Math.abs(x + width / 2 - viewportWidth / 2);
  if (
    width < 4 ||
    height < 4 ||
    width > 60 ||
    height > 42 ||
    width > height * 3 ||
    y < 0 ||
    y + height > Math.min(64, viewportHeight) ||
    x < 0 ||
    x + width > viewportWidth ||
    centerOffset > viewportWidth * 0.15
  ) {
    return null;
  }
  return rect;
}
