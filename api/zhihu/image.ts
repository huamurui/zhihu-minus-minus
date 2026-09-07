import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import apiClient from '../client';

export interface LocalImageAsset {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface ZhihuImage {
  imageId: string;
  imageKey?: string;
  src: string;
  originalSrc?: string;
}

export interface UploadedImage extends ZhihuImage {
  width: number;
  height: number;
}

interface UploadToken {
  access_key: string;
  access_token: string;
  access_timestamp: number;
  access_id: string;
}

interface UploadFile {
  image_id: string | number;
  state: number;
  publish_state: number;
  object_key?: string;
}

interface ImageCreateResponse {
  upload_token?: UploadToken;
  upload_vendor?: string;
  upload_file?: UploadFile;
}

interface ImageDetailResponse {
  status?: string;
  src?: string;
  original_hash?: string;
  original_src?: string;
}

const IMAGE_API_URL = 'https://api.zhihu.com/images';
const IMAGE_UPLOAD_URL = 'https://zhihu-pics-upload.zhimg.com';
const OSS_BUCKET_NAME = 'zhihu-pics';
const OSS_USER_AGENT = 'aliyun-sdk-js/6.8.0 Expo 55 React Native';

function encodeUtf8(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

function concatenateBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function digestBytes(
  algorithm: CryptoDigestAlgorithm,
  bytes: Uint8Array,
): Promise<ArrayBuffer> {
  // Keep the runtime value as Uint8Array. Android's Expo module bridges
  // TypedArray correctly but cannot convert a standalone ArrayBuffer.
  return digest(algorithm, bytes as unknown as BufferSource);
}

function toBase64(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabet[(bits >> 18) & 63];
    result += alphabet[(bits >> 12) & 63];
    result += second === undefined ? '=' : alphabet[(bits >> 6) & 63];
    result += third === undefined ? '=' : alphabet[bits & 63];
  }
  return result;
}

async function hmacSha1Base64(
  secret: string,
  message: string,
): Promise<string> {
  const blockSize = 64;
  const secretBytes = encodeUtf8(secret);
  const normalizedSecret =
    secretBytes.length > blockSize
      ? new Uint8Array(
          await digestBytes(CryptoDigestAlgorithm.SHA1, secretBytes),
        )
      : secretBytes;
  const paddedSecret = new Uint8Array(blockSize);
  paddedSecret.set(normalizedSecret);

  const innerPad = new Uint8Array(blockSize);
  const outerPad = new Uint8Array(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    innerPad[index] = paddedSecret[index] ^ 0x36;
    outerPad[index] = paddedSecret[index] ^ 0x5c;
  }

  const innerHash = new Uint8Array(
    await digestBytes(
      CryptoDigestAlgorithm.SHA1,
      concatenateBytes(innerPad, encodeUtf8(message)),
    ),
  );
  const signature = new Uint8Array(
    await digestBytes(
      CryptoDigestAlgorithm.SHA1,
      concatenateBytes(outerPad, innerHash),
    ),
  );
  return toBase64(signature);
}

function canonicalizeOssHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
    .join('');
}

async function createOssAuthorization(
  token: UploadToken,
  objectKey: string,
  mimeType: string,
  ossDate: string,
  ossUserAgent: string,
): Promise<string> {
  const ossHeaders = {
    'x-oss-date': ossDate,
    'x-oss-security-token': token.access_token,
    'x-oss-user-agent': ossUserAgent,
  };
  const normalizedObjectKey = objectKey.startsWith('/')
    ? objectKey.slice(1)
    : objectKey;
  // The upload host omits the bucket from its URL, but OSS V1 still expects
  // the bucket name in CanonicalizedResource.
  const canonicalizedResource = `/${OSS_BUCKET_NAME}/${normalizedObjectKey}`;
  const stringToSign = [
    'PUT',
    '',
    mimeType,
    // OSS V1 uses x-oss-date as the Date line when no separate Date header is sent.
    ossDate,
    `${canonicalizeOssHeaders(ossHeaders)}${canonicalizedResource}`,
  ].join('\n');
  const signature = await hmacSha1Base64(token.access_key, stringToSign);
  return `OSS ${token.access_id}:${signature}`;
}

function getImageMimeType(asset: LocalImageAsset): string {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType?.startsWith('image/')) return mimeType;

  const extension = asset.fileName?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function getImageDimensions(asset: LocalImageAsset) {
  return {
    width: Math.max(1, Math.round(asset.width)),
    height: Math.max(1, Math.round(asset.height)),
  };
}

function getResponseHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function getXmlValue(body: string, tag: string): string | undefined {
  const match = body.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`));
  return match?.[1];
}

function sanitizeOssText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const sanitized = value.replace(/\s+/g, ' ').trim().slice(0, 160);
  return sanitized || undefined;
}

function createOssUploadError(
  status: number,
  body: string,
  headers: Record<string, string>,
): Error {
  const code = sanitizeOssText(getXmlValue(body, 'Code'));
  const message = sanitizeOssText(getXmlValue(body, 'Message'));
  const requestId = sanitizeOssText(
    getXmlValue(body, 'RequestId') ||
      getResponseHeader(headers, 'x-oss-request-id'),
  );
  const details = [
    code,
    message,
    requestId ? `request id: ${requestId}` : undefined,
  ].filter(Boolean);
  return new Error(
    `图片上传失败（${status}）${details.length ? `：${details.join('；')}` : ''}`,
  );
}

function normalizeImage(
  imageId: string | number,
  data: ImageDetailResponse,
): ZhihuImage {
  if (data.status !== 'success' || !data.src) {
    throw new Error('知乎图片尚未处理完成');
  }

  return {
    imageId: String(imageId),
    imageKey: data.original_hash,
    src: data.src,
    originalSrc: data.original_src,
  };
}

/** Fetch the public image URLs for a Zhihu image id. */
export async function getImage(imageId: string | number): Promise<ZhihuImage> {
  const response = await apiClient.get<ImageDetailResponse>(
    `${IMAGE_API_URL}/${encodeURIComponent(String(imageId))}`,
  );
  return normalizeImage(imageId, response.data);
}

async function getImageAfterUpload(
  imageId: string | number,
): Promise<ZhihuImage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getImage(imageId);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('知乎图片尚未处理完成');
}

async function uploadToObjectStorage(
  asset: LocalImageAsset,
  token: UploadToken,
  objectKey: string,
): Promise<void> {
  const mimeType = getImageMimeType(asset);
  const ossDate = new Date().toUTCString();
  const authorization = await createOssAuthorization(
    token,
    objectKey,
    mimeType,
    ossDate,
    OSS_USER_AGENT,
  );
  const uploadResponse = await FileSystem.uploadAsync(
    `${IMAGE_UPLOAD_URL}/${objectKey}`,
    asset.uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': mimeType,
        authorization,
        'x-oss-date': ossDate,
        'x-oss-security-token': token.access_token,
        'x-oss-user-agent': OSS_USER_AGENT,
      },
    },
  );

  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw createOssUploadError(
      uploadResponse.status,
      uploadResponse.body,
      uploadResponse.headers,
    );
  }
}

async function markImageUploadSuccessful(imageId: string | number) {
  await apiClient.put(
    `${IMAGE_API_URL}/${encodeURIComponent(String(imageId))}/uploading_status`,
    { upload_result: 'success' },
  );
}

/**
 * Create or reuse a Zhihu image and return its resolved public URLs.
 * The source is passed through because the same image service is used by
 * multiple Zhihu publishing surfaces, not only comments.
 */
export async function uploadImage(
  asset: LocalImageAsset,
  source = 'comment',
): Promise<UploadedImage> {
  const fileInfo = await FileSystem.getInfoAsync(asset.uri, { md5: true });
  if (!fileInfo.exists || !fileInfo.md5) {
    throw new Error('无法读取图片文件');
  }

  const response = await apiClient.post<ImageCreateResponse>(IMAGE_API_URL, {
    image_hash: fileInfo.md5,
    source,
  });
  const file = response.data.upload_file;
  if (file?.image_id === undefined || file.image_id === null) {
    throw new Error('知乎图片上传信息无效');
  }

  const imageId = String(file.image_id);
  const needsUpload = file.state !== 1 || file.publish_state !== 1;
  if (needsUpload) {
    const token = response.data.upload_token;
    if (!token?.access_id || !token.access_key || !token.access_token) {
      throw new Error('知乎图片上传凭证无效');
    }
    if (!file.object_key) {
      throw new Error('知乎图片上传路径无效');
    }

    await uploadToObjectStorage(asset, token, file.object_key);
    await markImageUploadSuccessful(imageId);
  }

  const image = await getImageAfterUpload(imageId);
  const dimensions = getImageDimensions(asset);
  return {
    ...image,
    imageKey: file.object_key ?? image.imageKey,
    ...dimensions,
  };
}
