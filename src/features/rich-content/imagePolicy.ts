export type RichContentVariant = 'default' | 'daily';

export const DAILY_AVATAR_SIZE = 40;

export function hasHtmlClass(
  className: string | undefined,
  expectedClass: string,
): boolean {
  return (className ?? '').split(/\s+/).includes(expectedClass);
}

export function isDailyAvatar(
  attributes: Record<string, string | undefined>,
  variant: RichContentVariant,
): boolean {
  return variant === 'daily' && hasHtmlClass(attributes.class, 'avatar');
}

const ZHIHU_IMAGE_ID = /v2-[a-f\d]{32}/i;

/** A Zhihu image ID, as used by `data-original-token` and `original_token`. */
export function isZhihuImageId(value: string | undefined): value is string {
  return Boolean(value && /^v2-[a-f\d]{32}$/i.test(value));
}

/**
 * Zhihu serves body images with the author watermark drawn in. The uploaded
 * file, without it, lives under the image's original token; swapping that ID
 * into a URL keeps its size and format suffix.
 */
export function withOriginalImageId(url: string, token: string): string {
  return url.replace(ZHIHU_IMAGE_ID, token);
}
