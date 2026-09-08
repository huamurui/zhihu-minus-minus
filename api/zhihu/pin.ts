import client from '../client';
import type { UploadedImage } from './image';
import {
  createPublishingTraceId,
  getPublishingTextLength,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';

interface PinDraftResponse {
  data?: {
    content_id?: string | number;
  };
}

export interface PinMediaImage {
  height: number;
  originalUrl: string;
  url: string;
  watermark: string;
  watermarkUrl: string;
  width: number;
}

export interface PinPublishOptions {
  images?: UploadedImage[];
  pinId?: string | number;
  title?: string;
}

interface PinContentData {
  commentsPermission: { comment_permission: 'all' };
  extra_info: { publisher: 'pc'; view_permission: 'all' };
  hybrid: { html: string; textLength: number };
  media: { medias: Array<{ image: PinMediaImage }> };
  publish: { traceId: string };
  title: { title: string };
}

export const getPin = async (id: string | number) => {
  const include =
    'author,author.is_following,content,content_html,created,like_count,comment_count,relationship.voting';
  const res = await client.get(`/pins/${id}?include=${include}`);
  return res.data;
};

function toPinMediaImage(image: UploadedImage): PinMediaImage {
  return {
    height: image.height,
    width: image.width,
    url: image.src,
    originalUrl: image.originalSrc ?? image.src,
    watermark: image.watermark ?? 'watermark',
    watermarkUrl: image.watermarkSrc ?? image.src,
  };
}

function createPinContentData(
  html: string,
  traceId: string,
  options: PinPublishOptions,
): PinContentData {
  return {
    publish: { traceId },
    commentsPermission: { comment_permission: 'all' },
    extra_info: { view_permission: 'all', publisher: 'pc' },
    title: { title: options.title?.trim() ?? '' },
    hybrid: {
      html,
      textLength: getPublishingTextLength(html),
    },
    media: {
      medias: (options.images ?? []).map((image) => ({
        image: toPinMediaImage(image),
      })),
    },
  };
}

async function createPinDraft(
  html: string,
  traceId: string,
  options: PinPublishOptions,
): Promise<string> {
  const response = await client.post<PinDraftResponse>(
    'https://api.zhihu.com/content/drafts',
    {
      action: 'pin',
      data: {
        ...createPinContentData(html, traceId, options),
        draft: { disabled: 1 },
      },
    },
  );
  const draftId = response.data.data?.content_id;
  if (draftId === undefined || draftId === null || draftId === '') {
    throw new Error('知乎没有返回想法草稿 ID');
  }
  return String(draftId);
}

/**
 * Publish a new pin, or update an existing pin when `pinId` is provided.
 * Unlike articles and answers, pin images must live in `data.media.medias`.
 */
export const createPin = async (
  html: string,
  options: PinPublishOptions = {},
): Promise<PublishedContentResult> => {
  const traceId = createPublishingTraceId();
  const isPublished = options.pinId !== undefined;
  const draftId = isPublished
    ? String(options.pinId)
    : await createPinDraft(html, traceId, options);

  const response = await client.post('/content/publish', {
    action: 'pin',
    data: {
      ...createPinContentData(html, traceId, options),
      draft: { disabled: 1, id: draftId, isPublished },
    },
  });
  return parsePublishedContentResult(response.data);
};

export const updatePin = async (
  pinId: string | number,
  html: string,
  options: Omit<PinPublishOptions, 'pinId'> = {},
): Promise<PublishedContentResult> => createPin(html, { ...options, pinId });
