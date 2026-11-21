import {
  AVATAR_SIZE,
  AVATAR_TOP,
  COLLAPSE_DISTANCE,
  getMyProfileAvatarMotion,
} from '../src/components/profile/myProfileAvatarMotion';
import { getProfileAvatarBridge } from '../src/components/profile/profileAvatarBridgeGeometry';

const width = 390;
const safeTop = 50;
const startY = safeTop + AVATAR_TOP + AVATAR_SIZE / 2;
const target = { x: 193, y: 10, width: 24, height: 24 };

test('the bridge stays attached to the same window coordinates as the photo scrolls', () => {
  let visible = false;
  for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const motion = getMyProfileAvatarMotion(progress, width, safeTop, target);
    const frame = motion.bridge;
    if (progress === 0 || progress === 1) {
      expect(frame).toBeNull();
      continue;
    }
    expect(frame).not.toBeNull();
    if (!frame) throw new Error('missing bridge frame');
    const scroll = COLLAPSE_DISTANCE * progress;
    expect(frame.target).toEqual(target);
    expect(frame.avatar.cx).toBeCloseTo(width / 2 + motion.translateX);
    expect(frame.avatar.cy).toBeCloseTo(startY + motion.translateY - scroll);
    expect(frame.avatar.r).toBeCloseTo((AVATAR_SIZE * motion.scale) / 2);
    visible ||= getProfileAvatarBridge(frame).opacity > 0;
  }
  expect(visible).toBe(true);
  const collapsed = getMyProfileAvatarMotion(1, width, safeTop, target);
  expect(width / 2 + collapsed.translateX).toBe(target.x + target.width / 2);
  expect(startY + collapsed.translateY - COLLAPSE_DISTANCE).toBe(
    target.y + target.height / 2,
  );
});

test('without a cutout the photo keeps its original centerline and color', () => {
  for (const progress of [0, 0.4, 0.8, 1]) {
    expect(
      getMyProfileAvatarMotion(progress, width, safeTop, null),
    ).toMatchObject({
      translateX: 0,
      darkness: 0,
      bridge: null,
    });
  }
  const collapsed = getMyProfileAvatarMotion(1, width, safeTop, null);
  expect(startY + collapsed.translateY - COLLAPSE_DISTANCE).toBe(safeTop / 2);
});
