/**
 * Fresco, which decodes React Native images on Android, samples every image
 * down until its longest side fits this size.
 */
export const ANDROID_DECODE_MAX_DIMENSION = 2048;

/** Android refuses to draw bitmaps over 100MB; stay well below it. */
export const FULL_DECODE_MAX_BYTES = 80 * 1024 * 1024;

const BYTES_PER_PIXEL = 4;

/**
 * Images taller than this many widths show only their top in the body, like
 * the official app: drawn whole at the body width they would need a bitmap
 * taller than the GPU can upload, so they would be squeezed and blurred.
 */
export const LONG_IMAGE_MIN_ASPECT = 3;

/** Height of a long image's visible top, in widths. */
export const LONG_IMAGE_CROP_ASPECT = 1.5;

export function isLongImage(width?: number, height?: number): boolean {
  return Boolean(width && height && height / width > LONG_IMAGE_MIN_ASPECT);
}

/**
 * Zhihu serves `_720w` style URLs scaled down to that width, while the
 * document records the original's size. Decode decisions need the size of
 * the file actually fetched.
 */
export function getServedImageSize(
  url: string,
  width?: number,
  height?: number,
): { width?: number; height?: number } {
  const servedWidth = /_(\d+)w\.[a-z]+(?:[?#]|$)/i.exec(url)?.[1];
  if (!servedWidth || !width || !height) return { width, height };
  const scale = Math.min(1, Number(servedWidth) / width);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Picks the Android decode for an image. The capped decode squeezes long
 * screenshots to a sliver of the screen width and blurs their text, so those
 * decode at full size; everything else keeps the cheaper default.
 */
export function getImageResizeMethod({
  width,
  height,
  displayPixels,
}: {
  width?: number;
  height?: number;
  /** Rendered width in physical pixels. */
  displayPixels: number;
}): 'auto' | 'none' {
  if (!width || !height) return 'auto';
  const sampleSize = Math.ceil(
    Math.max(width, height) / ANDROID_DECODE_MAX_DIMENSION,
  );
  if (sampleSize <= 1 || width / sampleSize >= displayPixels) return 'auto';
  return width * height * BYTES_PER_PIXEL <= FULL_DECODE_MAX_BYTES
    ? 'none'
    : 'auto';
}
