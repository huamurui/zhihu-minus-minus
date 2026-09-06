import type { UploadedImage } from '@/api/zhihu/image';

const IMAGE_SOURCE = '1d2f5c51';

export function buildZhihuContent(text: string, imageHtml?: string): string {
  const trimmedText = text.trim();
  if (!imageHtml) return trimmedText;
  return trimmedText ? `${trimmedText}<br/>${imageHtml}` : imageHtml;
}

export function buildZhihuImageHtml(image: UploadedImage): string {
  const imageUrl = image.imageKey
    ? `https://pic1.zhimg.com/${image.imageKey}_qhd.png?source=${IMAGE_SOURCE}`
    : image.originalSrc || image.src;
  return `<a class="comment_img" href="${imageUrl}" data-width="${image.width}" data-height="${image.height}">[图片]</a>`;
}
