import apiClient from '../client';

export type ContentRelationshipType = 'answers' | 'pins';

export interface ContentRelationshipTip {
  text: string;
  type?: string;
  action_url?: string;
  text_color?: string;
  text_size?: number;
  is_bold?: boolean;
}

export interface ContentRelationshipOptions {
  signal?: AbortSignal;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

export function normalizeContentRelationship(
  value: unknown,
): ContentRelationshipTip | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const text = nonEmptyString(payload.text);
  if (!text) return null;

  const tip: ContentRelationshipTip = { text };
  const type = nonEmptyString(payload.type);
  const actionUrl = nonEmptyString(payload.action_url);
  const textColor = nonEmptyString(payload.text_color);
  if (type) tip.type = type;
  if (actionUrl) tip.action_url = actionUrl;
  if (textColor) tip.text_color = textColor;
  if (
    typeof payload.text_size === 'number' &&
    Number.isFinite(payload.text_size) &&
    payload.text_size > 0
  ) {
    tip.text_size = payload.text_size;
  }
  if (typeof payload.is_bold === 'boolean') tip.is_bold = payload.is_bold;
  return tip;
}

export async function getContentRelationship(
  contentType: ContentRelationshipType,
  id: string | number,
  options: ContentRelationshipOptions = {},
): Promise<ContentRelationshipTip | null> {
  const path = `/${contentType}/${encodeURIComponent(String(id))}/relationship?desktop=true`;
  const response = options.signal
    ? await apiClient.get<unknown>(path, { signal: options.signal })
    : await apiClient.get<unknown>(path);
  return normalizeContentRelationship(response.data);
}
