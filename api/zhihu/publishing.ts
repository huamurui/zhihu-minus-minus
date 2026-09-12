import { randomUUID } from 'expo-crypto';

export interface PublishedContentResult {
  id?: string;
  publish?: {
    id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createPublishingTraceId(): string {
  return `${Date.now()},${randomUUID()}`;
}

/** Match the browser editor's text length without counting HTML markup. */
export function getPublishingTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, 'x').length;
}

/** Zhihu wraps publish results in a JSON string inside `data.result`. */
export function parsePublishedContentResult(
  response: unknown,
): PublishedContentResult {
  const envelope = asRecord(response);
  if (!envelope) throw new Error('知乎返回了无效的发布结果');

  const data = asRecord(envelope.data);
  const rawResult = data?.result;
  let result: unknown = rawResult;
  if (typeof rawResult === 'string') {
    try {
      result = JSON.parse(rawResult) as unknown;
    } catch {
      throw new Error('知乎返回了无法解析的发布结果');
    }
  }

  const parsedResult = asRecord(result);
  if (parsedResult) return parsedResult as PublishedContentResult;

  const error = asRecord(envelope.error);
  const errorMessage = typeof error?.message === 'string' ? error.message : '';
  if (errorMessage) throw new Error(errorMessage);

  const message = typeof envelope.message === 'string' ? envelope.message : '';
  if (message && message.toLowerCase() !== 'success') {
    throw new Error(message);
  }
  return envelope as PublishedContentResult;
}
