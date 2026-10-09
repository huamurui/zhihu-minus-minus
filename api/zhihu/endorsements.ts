import { parseZhihuUrl } from '@/utils/url';

export interface AnswerEndorsementColor {
  /** Symbolic server theme group; the renderer maps supported groups to theme tokens. */
  group: string;
  alpha?: number;
}

export interface AnswerEndorsementText {
  key: string;
  type: 'TEXT';
  content: string;
  font_size?: number;
  font_color?: AnswerEndorsementColor;
  is_bold?: boolean;
  max_line?: number;
}

export interface AnswerEndorsementImage {
  key: string;
  type: 'IMAGE';
  /** Symbolic icon key. Unknown icons can be omitted without losing the label text. */
  image_key: string;
  image_color?: AnswerEndorsementColor;
  width?: number;
  height?: number;
}

export type AnswerEndorsementElement =
  | AnswerEndorsementText
  | AnswerEndorsementImage;

export interface AnswerEndorsement {
  key: string;
  elements: AnswerEndorsementElement[];
  descriptionElements: AnswerEndorsementText[];
  backgroundColor?: AnswerEndorsementColor;
  actionPath?: string;
}

const ZHIHU_ENDORSEMENT_HOSTS = new Set([
  'zhihu.com',
  'www.zhihu.com',
  'zhuanlan.zhihu.com',
  'oia.zhihu.com',
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function finiteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum &&
    (!integer || Number.isInteger(value))
    ? value
    : undefined;
}

function normalizeColor(value: unknown): AnswerEndorsementColor | undefined {
  const color = asRecord(value);
  const group = nonEmptyString(color?.group);
  // Group codes are symbolic identifiers, never arbitrary CSS or hex colors.
  if (!group || !/^[A-Z][A-Z0-9]{3,15}$/.test(group)) return undefined;
  const alpha = finiteRange(color?.alpha, 0, 1);
  return alpha === undefined ? { group } : { group, alpha };
}

function normalizeElement(value: unknown): AnswerEndorsementElement | null {
  const payload = asRecord(value);
  if (!payload) return null;
  if (payload.type === 'TEXT') {
    const content = nonEmptyString(payload.content);
    if (!content) return null;
    const element: Omit<AnswerEndorsementText, 'key'> = {
      type: 'TEXT',
      content,
    };
    const fontSize = finiteRange(payload.font_size, 1, 64);
    const maxLine = finiteRange(payload.max_line, 1, 20, true);
    const fontColor = normalizeColor(payload.font_color);
    if (fontSize !== undefined) element.font_size = fontSize;
    if (maxLine !== undefined) element.max_line = maxLine;
    if (fontColor) element.font_color = fontColor;
    if (typeof payload.is_bold === 'boolean') element.is_bold = payload.is_bold;
    return { key: `text:${JSON.stringify(element)}`, ...element };
  }
  if (payload.type === 'IMAGE') {
    const imageKey = nonEmptyString(payload.image_key);
    if (!imageKey || !/^[a-zA-Z0-9_-]{1,128}$/.test(imageKey)) return null;
    const element: Omit<AnswerEndorsementImage, 'key'> = {
      type: 'IMAGE',
      image_key: imageKey,
    };
    const width = finiteRange(payload.width, 1, 128);
    const height = finiteRange(payload.height, 1, 128);
    const imageColor = normalizeColor(payload.image_color);
    if (width !== undefined) element.width = width;
    if (height !== undefined) element.height = height;
    if (imageColor) element.image_color = imageColor;
    return { key: `image:${JSON.stringify(element)}`, ...element };
  }
  return null;
}

function normalizeElements(value: unknown): AnswerEndorsementElement[] {
  if (!Array.isArray(value)) return [];
  const elements: AnswerEndorsementElement[] = [];
  const occurrences = new Map<string, number>();
  for (const source of value) {
    const element = normalizeElement(source);
    if (!element) continue;
    const occurrence = (occurrences.get(element.key) ?? 0) + 1;
    occurrences.set(element.key, occurrence);
    elements.push({
      ...element,
      key: `${element.key}:occurrence:${occurrence}`,
    });
  }
  return elements;
}

function getActionPath(value: unknown): string | undefined {
  const action = nonEmptyString(value);
  if (!action || !/^https?:\/\//i.test(action) || /[\s\\]/.test(action)) {
    return undefined;
  }
  try {
    const parsed = new URL(action);
    if (
      !ZHIHU_ENDORSEMENT_HOSTS.has(parsed.hostname.toLowerCase()) ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname.includes('%')
    ) {
      return undefined;
    }
    return parseZhihuUrl(parsed.href) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Normalize untrusted label metadata while keeping feed and detail payloads compatible. */
export function normalizeAnswerEndorsements(
  value: unknown,
): AnswerEndorsement[] {
  if (!Array.isArray(value)) return [];
  const endorsements: AnswerEndorsement[] = [];
  const keys = new Set<string>();
  for (const source of value) {
    const payload = asRecord(source);
    if (!payload) continue;
    const elements = normalizeElements(payload.elements);
    if (!elements.some((element) => element.type === 'TEXT')) continue;
    const endorsement: Omit<AnswerEndorsement, 'key'> = {
      elements,
      descriptionElements:
        payload.sub_elements_type === 'DESCRIPTION'
          ? normalizeElements(payload.sub_elements).filter(
              (element): element is AnswerEndorsementText =>
                element.type === 'TEXT',
            )
          : [],
    };
    const backgroundColor = normalizeColor(payload.background_color);
    const actionPath = getActionPath(payload.action_url);
    if (backgroundColor) endorsement.backgroundColor = backgroundColor;
    if (actionPath) endorsement.actionPath = actionPath;
    const key = `endorsement:${JSON.stringify(endorsement)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    endorsements.push({ key, ...endorsement });
  }
  return endorsements;
}
