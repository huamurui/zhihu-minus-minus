import assert from 'node:assert/strict';
import {
  getImageResizeMethod,
  getServedImageSize,
  isLongImage,
} from '../src/utils/imageDecode';

// A long phone screenshot (issue #147 shape) shown across a 1264px wide screen.
const LONG_SCREENSHOT = { width: 1080, height: 12000 };
const SCREEN_PIXELS = 1264;

test('decodes long screenshots at full size so their text stays sharp', () => {
  assert.equal(
    getImageResizeMethod({ ...LONG_SCREENSHOT, displayPixels: SCREEN_PIXELS }),
    'none',
  );
});

test('keeps the default decode when the decode cap still covers the screen', () => {
  // 4000×3000 photo: the capped decode is still 2000px wide.
  assert.equal(
    getImageResizeMethod({
      width: 4000,
      height: 3000,
      displayPixels: SCREEN_PIXELS,
    }),
    'auto',
  );
  // Ordinary images never reach the cap.
  assert.equal(
    getImageResizeMethod({
      width: 1080,
      height: 1920,
      displayPixels: SCREEN_PIXELS,
    }),
    'auto',
  );
});

test('keeps the default decode for images too large to draw at full size', () => {
  // 1440×20000 ARGB is about 110MB, above Android's per-bitmap draw limit.
  assert.equal(
    getImageResizeMethod({
      width: 1440,
      height: 20000,
      displayPixels: SCREEN_PIXELS,
    }),
    'auto',
  );
});

test('keeps the default decode when the source size is unknown', () => {
  assert.equal(getImageResizeMethod({ displayPixels: SCREEN_PIXELS }), 'auto');
  assert.equal(
    getImageResizeMethod({ width: 1080, displayPixels: SCREEN_PIXELS }),
    'auto',
  );
});

test('sizes a scaled Zhihu URL by the file it serves, not the original', () => {
  // The image from the blurry-answer report: 1216×36140, fetched as _720w.
  assert.deepEqual(
    getServedImageSize(
      'https://pic1.zhimg.com/50/v2-2474c690224e18b4ac06ca6465056f14_720w.jpg?source=1def8aca',
      1216,
      36140,
    ),
    { width: 720, height: 21399 },
  );
  // Narrower originals are served as they are.
  assert.deepEqual(
    getServedImageSize('https://pic1.zhimg.com/v2-a_720w.jpg', 222, 7830),
    { width: 222, height: 7830 },
  );
  assert.deepEqual(
    getServedImageSize('https://pic1.zhimg.com/v2-a_r.jpg', 1216, 36140),
    { width: 1216, height: 36140 },
  );
});

test('only images taller than three widths count as long', () => {
  assert.equal(isLongImage(1216, 36140), true);
  assert.equal(isLongImage(1080, 3240), false);
  assert.equal(isLongImage(1080, 1920), false);
  assert.equal(isLongImage(undefined, 36140), false);
});
