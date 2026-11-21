export interface ProfileAvatarBridgeFrame {
  target: { x: number; y: number; width: number; height: number };
  avatar: { cx: number; cy: number; r: number };
}

function capsuleSurface(
  target: ProfileAvatarBridgeFrame['target'],
  px: number,
  py: number,
) {
  'worklet';
  // A capsule is the set of points within one radius of its center segment.
  const radius = Math.min(target.width, target.height) / 2;
  const spineX = Math.max(
    target.x + radius,
    Math.min(px, target.x + target.width - radius),
  );
  const spineY = Math.max(
    target.y + radius,
    Math.min(py, target.y + target.height - radius),
  );
  const dx = px - spineX;
  const dy = py - spineY;
  const length = Math.hypot(dx, dy);
  const nx = length > 0 ? dx / length : 0;
  const ny = length > 0 ? dy / length : 0;
  return {
    x: spineX + nx * radius,
    y: spineY + ny * radius,
    nx,
    ny,
    distance: length - radius,
  };
}

function bridgeSide(
  frame: ProfileAvatarBridgeFrame,
  contact: ReturnType<typeof capsuleSurface>,
  spread: number,
  sign: number,
) {
  'worklet';
  const { avatar } = frame;
  const dx = sign * contact.ny * spread;
  const dy = -sign * contact.nx * spread;
  const base = capsuleSurface(frame.target, contact.x + dx, contact.y + dy);
  const length = Math.hypot(avatar.r, spread);
  const nx = (dx - contact.nx * avatar.r) / length;
  const ny = (dy - contact.ny * avatar.r) / length;
  const x = avatar.cx + avatar.r * nx;
  const y = avatar.cy + avatar.r * ny;
  // Both cubic handles follow the local surface tangent. Limit the pull to the
  // available shoulder width so the two sides cannot cross as the neck thins.
  const handle = Math.min(
    Math.hypot(x - base.x, y - base.y) * 0.75,
    spread * 0.83,
  );
  return {
    base: `${base.x} ${base.y}`,
    baseHandle: `${base.x - sign * base.ny * handle} ${base.y + sign * base.nx * handle}`,
    avatarHandle: `${x + sign * ny * handle} ${y - sign * nx * handle}`,
    avatar: `${x} ${y}`,
  };
}

export function getProfileAvatarBridge(frame: ProfileAvatarBridgeFrame | null) {
  'worklet';
  const hidden = { d: '', opacity: 0 };
  if (!frame) return hidden;
  const { avatar, target } = frame;
  if (
    !Number.isFinite(avatar.cx) ||
    !Number.isFinite(avatar.cy) ||
    !Number.isFinite(avatar.r) ||
    avatar.r <= 0 ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(target.width) ||
    target.width <= 0 ||
    !Number.isFinite(target.height) ||
    target.height <= 0
  )
    return hidden;

  const contact = capsuleSurface(target, avatar.cx, avatar.cy);
  const gap = contact.distance - avatar.r;
  const radius = Math.min(avatar.r, target.width / 2, target.height / 2);
  const reach = radius * 1.5;
  const overlap = radius * 0.6;
  if (gap >= reach || gap <= -overlap) return hidden;

  const proximity = 1 - Math.max(0, gap / reach);
  const spread = radius * 1.3 * Math.sqrt(proximity);
  const right = bridgeSide(frame, contact, spread, 1);
  const left = bridgeSide(frame, contact, spread, -1);
  return {
    d: `M ${right.base} C ${right.baseHandle} ${right.avatarHandle} ${right.avatar} L ${left.avatar} C ${left.avatarHandle} ${left.baseHandle} ${left.base} Z`,
    opacity: Math.min(1, proximity * 4, 1 + gap / overlap),
  };
}
