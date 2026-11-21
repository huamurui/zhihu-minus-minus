import type { ProfileAvatarBridgeFrame } from './profileAvatarBridgeGeometry';

export const AVATAR_SIZE = 112;
export const AVATAR_TOP = 36;
export const NAME_GAP = 8;
export const COLLAPSE_DISTANCE = AVATAR_TOP + AVATAR_SIZE + NAME_GAP;

export function getMyProfileAvatarMotion(
  progress: number,
  width: number,
  safeTop: number,
  cutout: ProfileAvatarBridgeFrame['target'] | null,
) {
  'worklet';
  const startX = width / 2;
  const startY = safeTop + AVATAR_TOP + AVATAR_SIZE / 2;
  const endX = cutout ? cutout.x + cutout.width / 2 : startX;
  const endY = cutout ? cutout.y + cutout.height / 2 : safeTop / 2;
  const translateX = (endX - startX) * progress;
  // The header's origin moves up with the scroll view until it pins.
  const headerOffset = COLLAPSE_DISTANCE * progress;
  const translateY = (endY - startY) * progress + headerOffset;
  const scale = 1 - progress;
  const r = (AVATAR_SIZE / 2) * scale;
  let bridge: ProfileAvatarBridgeFrame | null = null;
  let darkness = 0;
  if (cutout && progress > 0 && progress < 1) {
    const cy = startY + translateY - headerOffset;
    bridge = { target: cutout, avatar: { cx: startX + translateX, cy, r } };
    const gap = cy - r - (cutout.y + cutout.height);
    const fadeDistance = Math.min(32, cutout.height);
    const tint = Math.min(1, Math.max(0, 1 - gap / fadeDistance));
    darkness = tint * tint * (3 - 2 * tint);
  }
  return { translateX, translateY, scale, bridge, darkness };
}
