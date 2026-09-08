import { type Element, isTag, isText, type Node } from 'domhandler';
import { parseDocument } from 'htmlparser2';

export type EnrichedFallbackKind =
  | 'block-image'
  | 'embedded-media'
  | 'table'
  | 'unsupported-tag'
  | 'unsafe-url';

export interface EnrichedNormalizationDiagnostic {
  kind: EnrichedFallbackKind;
  source: string;
}

export interface EnrichedNormalizationResult {
  html: string;
  diagnostics: EnrichedNormalizationDiagnostic[];
  inlineImageCount: number;
  blockImageCount: number;
}

export interface EnrichedNormalizationOptions {
  maxImageWidth?: number;
}

interface SerializeContext {
  parentTag?: string;
}

interface NormalizationState {
  diagnostics: EnrichedNormalizationDiagnostic[];
  inlineImageCount: number;
  blockImageCount: number;
  maxImageWidth: number;
}

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'li',
]);

const BLOCK_LAYOUT_TAGS = new Set([
  ...BLOCK_TAGS,
  'figure',
  'table',
  'pre',
  'hr',
  'video',
  'audio',
  'html',
  'body',
  'main',
  'article',
  'section',
  'div',
]);

const TRANSPARENT_CONTAINER_TAGS = new Set([
  'html',
  'body',
  'main',
  'article',
  'section',
  'div',
  'span',
  'label',
  'small',
  'sup',
  'sub',
]);

const REMOVED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
]);

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function normalizeUrl(
  value: string | undefined,
  kind: 'href' | 'image',
): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  const absolute = candidate.startsWith('//')
    ? `https:${candidate}`
    : candidate.startsWith('/')
      ? `https://www.zhihu.com${candidate}`
      : candidate;

  try {
    const url = new URL(absolute);
    const allowedProtocols =
      kind === 'image'
        ? new Set(['http:', 'https:'])
        : new Set(['http:', 'https:', 'mailto:', 'tel:', 'zhihu:']);
    return allowedProtocols.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDimension(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getImageDimensions(
  element: Element,
  isFormula: boolean,
  isBlock: boolean,
  maxWidth: number,
): { width: number; height: number } {
  const rawWidth =
    parseDimension(element.attribs['data-rawwidth']) ??
    parseDimension(element.attribs.width);
  const rawHeight =
    parseDimension(element.attribs['data-rawheight']) ??
    parseDimension(element.attribs.height);

  const formulaText = element.attribs.alt?.trim() ?? '';
  let width =
    rawWidth ??
    (isFormula
      ? isBlock
        ? maxWidth
        : Math.min(maxWidth, Math.max(40, formulaText.length * 8))
      : maxWidth);
  let height = rawHeight ?? (isFormula ? (isBlock ? 60 : 22) : width * 0.5625);

  if (width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function serializeChildren(
  element: { children: Node[] },
  state: NormalizationState,
  context: SerializeContext,
): string {
  return element.children
    .map((child, index, children) => {
      if (isText(child) && child.data.trim() === '') {
        const previous = children[index - 1];
        const next = children[index + 1];
        const touchesBlock = [previous, next].some(
          (sibling) =>
            sibling &&
            isTag(sibling) &&
            BLOCK_LAYOUT_TAGS.has(sibling.name.toLowerCase()),
        );

        // Pretty-printed source HTML often contains indentation around block
        // nodes. Enriched renders those bytes as content, unlike a browser.
        if (touchesBlock) return '';
      }

      return serializeNode(child, state, context);
    })
    .join('');
}

function serializeImage(
  element: Element,
  state: NormalizationState,
  context: SerializeContext,
): string {
  const sourceCandidate =
    element.attribs['data-actualsrc'] ||
    element.attribs['data-original'] ||
    element.attribs.src;
  const source = normalizeUrl(sourceCandidate, 'image');
  if (!source) {
    state.diagnostics.push({ kind: 'unsafe-url', source: 'img' });
    return element.attribs.alt
      ? `<i>[图片：${escapeText(element.attribs.alt)}]</i>`
      : '<i>[图片不可用]</i>';
  }

  const eeimg = element.attribs.eeimg;
  const isFormula =
    eeimg === '1' ||
    eeimg === '2' ||
    source.includes('/equation') ||
    source.includes('equation?');
  const isBlock = eeimg === '2' || (!isFormula && context.parentTag !== 'p');
  const { width, height } = getImageDimensions(
    element,
    isFormula,
    isBlock,
    state.maxImageWidth,
  );
  const image = `<img src="${escapeAttribute(source)}" width="${width}" height="${height}">`;

  if (isBlock) {
    state.blockImageCount += 1;
    state.diagnostics.push({ kind: 'block-image', source: 'img' });
    return `<p>${image}</p>`;
  }

  state.inlineImageCount += 1;
  return image;
}

function serializeLink(element: Element, state: NormalizationState): string {
  const href = normalizeUrl(element.attribs.href, 'href');
  const children = serializeChildren(element, state, { parentTag: 'a' }).trim();
  const draftTitle = element.attribs['data-draft-title']?.trim();
  const label = children || (draftTitle ? escapeText(draftTitle) : '链接');

  if (!href) {
    if (element.attribs.href) {
      state.diagnostics.push({ kind: 'unsafe-url', source: 'a' });
    }
    return label;
  }

  return `<a href="${escapeAttribute(href)}">${label}</a>`;
}

function serializeTable(element: Element, state: NormalizationState): string {
  state.diagnostics.push({ kind: 'table', source: 'table' });
  const rows = element.children
    .filter((node): node is Element => isTag(node) && node.name === 'tr')
    .map((row) =>
      row.children
        .filter(
          (node): node is Element =>
            isTag(node) && (node.name === 'td' || node.name === 'th'),
        )
        .map((cell) =>
          serializeChildren(cell, state, { parentTag: cell.name }).trim(),
        )
        .filter(Boolean)
        .join(' · '),
    )
    .filter(Boolean);

  if (rows.length > 0) {
    return rows.map((row) => `<p>${row}</p>`).join('');
  }

  const fallback = serializeChildren(element, state, { parentTag: 'table' });
  return fallback ? `<p>${fallback}</p>` : '<p>[表格]</p>';
}

function serializeNode(
  node: Node,
  state: NormalizationState,
  context: SerializeContext,
): string {
  if (isText(node)) return escapeText(node.data);
  if (!isTag(node)) return '';

  const tag = node.name.toLowerCase();
  if (REMOVED_TAGS.has(tag)) {
    state.diagnostics.push({ kind: 'embedded-media', source: tag });
    return tag === 'iframe' || tag === 'object' || tag === 'embed'
      ? '<p>[嵌入内容]</p>'
      : '';
  }

  if (tag === 'img') return serializeImage(node, state, context);
  if (tag === 'a') return serializeLink(node, state);
  if (tag === 'br' || tag === 'hr') return '<br>';
  if (tag === 'table') return serializeTable(node, state);
  if (tag === 'figure') {
    return serializeChildren(node, state, { parentTag: 'figure' });
  }
  if (tag === 'figcaption') {
    const caption = serializeChildren(node, state, { parentTag: tag }).trim();
    return caption ? `<p><i>${caption}</i></p>` : '';
  }
  if (tag === 'video' || tag === 'audio') {
    state.diagnostics.push({ kind: 'embedded-media', source: tag });
    const source = normalizeUrl(node.attribs.src, 'href');
    return source
      ? `<p><a href="${escapeAttribute(source)}">[${tag === 'video' ? '视频' : '音频'}]</a></p>`
      : `<p>[${tag === 'video' ? '视频' : '音频'}]</p>`;
  }

  const children = serializeChildren(node, state, { parentTag: tag });
  if (TRANSPARENT_CONTAINER_TAGS.has(tag)) return children;

  if (tag === 'strong') return `<b>${children}</b>`;
  if (tag === 'em') return `<i>${children}</i>`;
  if (tag === 'del' || tag === 'strike') return `<s>${children}</s>`;
  if (tag === 'pre') return `<codeblock>${children}</codeblock>`;
  if (tag === 'mark') return `<u>${children}</u>`;
  if (
    tag === 'b' ||
    tag === 'i' ||
    tag === 'u' ||
    tag === 's' ||
    tag === 'code'
  ) {
    return `<${tag}>${children}</${tag}>`;
  }
  if (BLOCK_TAGS.has(tag)) return `<${tag}>${children}</${tag}>`;

  state.diagnostics.push({ kind: 'unsupported-tag', source: tag });
  return children;
}

/**
 * Lowers untrusted Zhihu HTML to the deliberately small dialect accepted by
 * react-native-enriched-html. The output is canonical internal HTML, so the
 * native component can skip its permissive external-HTML normalizer.
 */
export function normalizeZhihuHtmlForEnriched(
  source: string,
  options: EnrichedNormalizationOptions = {},
): EnrichedNormalizationResult {
  const state: NormalizationState = {
    diagnostics: [],
    inlineImageCount: 0,
    blockImageCount: 0,
    maxImageWidth: Math.max(1, Math.floor(options.maxImageWidth ?? 320)),
  };
  const document = parseDocument(source, {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  });
  const body = serializeChildren(document, state, {});

  return {
    html: `<html>${body}</html>`,
    diagnostics: state.diagnostics,
    inlineImageCount: state.inlineImageCount,
    blockImageCount: state.blockImageCount,
  };
}
