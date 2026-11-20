// Both sizes use the same 24-unit drawing. The small marker needs a heavier
// outline to keep its sides visible after scaling down to 7.5 layout units.
export const commentBubble = {
  viewBoxSize: 24,
  toolbarWeight: 2.1,
  markerWeight: 3.2,
} as const;

// The two arcs share a center at (12, 11.75). Trace the inset arc in reverse
// so SVG and both native renderers leave the center transparent.
export function commentBubblePath(weight: number): string {
  const outer =
    'M4 17.75 A10 10 0 1 1 9.2 21.35 L2.95 22.75 Q1.55 23.06 1.92 21.67 Z';
  const radius = 10 - weight;
  const bottomX = 12 - 0.28 * radius;
  const bottomY = 11.75 + 0.96 * radius;
  const sideX = 12 - 0.8 * radius;
  const sideY = 11.75 + 0.6 * radius;
  const tipX = 1.8 + 1.33 * weight;
  const tipY = 22.9 - 1.32 * weight;
  const inner = `M${bottomX} ${bottomY} A${radius} ${radius} 0 1 0 ${sideX} ${sideY} L${tipX} ${tipY} Z`;
  return `${outer} ${inner}`;
}
