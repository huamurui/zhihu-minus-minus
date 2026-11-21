import { getCameraHole } from '../modules/display-cutout/cameraHole';

const portrait = { viewportWidth: 360, viewportHeight: 760 };

test('keeps an inset camera hole at its reported position', () => {
  const rect = { x: 176, y: 6, width: 16, height: 16 };
  expect(getCameraHole({ ...portrait, rect })).toEqual(rect);
});

test('accepts a narrow reserved rectangle extending up to the bezel', () => {
  // Some OEMs include the pixels above the lens in both the path and the box.
  const rect = { x: 162, y: 0, width: 23, height: 34 };
  expect(getCameraHole({ ...portrait, rect })).toEqual(rect);
});

test('ignores absent, wide, off-center and cropped cutouts', () => {
  for (const rect of [
    null,
    { x: 92, y: 0, width: 176, height: 32 },
    { x: 12, y: 6, width: 18, height: 18 },
    { x: 170, y: -5, width: 20, height: 20 },
  ]) {
    expect(getCameraHole({ ...portrait, rect })).toBeNull();
  }
});

test('ignores a cutout in a landscape viewport', () => {
  expect(
    getCameraHole({
      viewportWidth: 760,
      viewportHeight: 360,
      rect: { x: 371, y: 4, width: 18, height: 18 },
    }),
  ).toBeNull();
});
