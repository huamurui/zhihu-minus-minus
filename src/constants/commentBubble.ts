// Geometry in the 24-unit SVG viewBox. The arc and the two tail edges share
// one centerline. The small marker gets a heavier stroke to stay legible.
export const commentBubble = {
  viewBoxSize: 24,
  toolbarWeight: 2.1,
  markerWeight: 3.2,
} as const;

const center = { x: 12, y: 11.7 };
const radius = 9.2;
const tip = { x: 2.85, y: 21.55 };

function side(r: number) {
  return { x: center.x - 0.8 * r, y: center.y + 0.6 * r };
}

function bottom(r: number) {
  return { x: center.x - 0.28 * r, y: center.y + 0.96 * r };
}

type Point = typeof center;
const xy = ({ x, y }: Point) => `${x} ${y}`;

export const commentBubbleCenterline = `M${xy(side(radius))} A${radius} ${radius} 0 1 1 ${xy(bottom(radius))} L${xy(tip)} Z`;

// The native text renderers take a filled path. These clockwise subpaths
// describe the same round-joined stroke as <Path strokeLinejoin="round">.
export function commentBubblePath(weight: number): string {
  const half = weight / 2;
  const outer = radius + half;
  const inner = radius - half;
  const arc = `M${xy(side(outer))} A${outer} ${outer} 0 1 1 ${xy(bottom(outer))} L${xy(bottom(inner))} A${inner} ${inner} 0 1 0 ${xy(side(inner))} Z`;

  function edge(a: Point, b: Point) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = ((b.y - a.y) * half) / length;
    const dy = ((a.x - b.x) * half) / length;
    return `M${a.x + dx} ${a.y + dy} L${b.x + dx} ${b.y + dy} L${b.x - dx} ${b.y - dy} L${a.x - dx} ${a.y - dy} Z`;
  }

  function join({ x, y }: Point) {
    return `M${x - half} ${y} a${half} ${half} 0 1 1 ${weight} 0 a${half} ${half} 0 1 1 ${-weight} 0 Z`;
  }

  const a = side(radius);
  const b = bottom(radius);
  return [arc, edge(b, tip), edge(tip, a), join(a), join(b), join(tip)].join(
    ' ',
  );
}
