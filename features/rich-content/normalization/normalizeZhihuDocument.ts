import { type Element, isTag, isText, type Node } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import { parseZhihuVideoReference } from '@/utils/zhihuVideo';
import { getDirectZhihuVideoUrl } from '@/utils/zhihuVideoRoute';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuFootnoteDefinition,
  ZhihuImageResource,
  ZhihuInlineRun,
  ZhihuListItem,
  ZhihuTableAlignment,
  ZhihuTableRow,
} from '../document';
import { isDailyAvatar, type RichContentVariant } from '../imagePolicy';
import type { RichTextDiagnostic } from '../richText';
import { parseZhihuSegmentHighlight } from '../segmentHighlight';
import { createInlineRunSlicer } from './inlineRunSlicer';

export interface ZhihuDocumentNormalizationOptions {
  documentId: string;
  variant?: RichContentVariant;
  segmentInfos?: readonly ZhihuSegmentInfo[];
  linkCardInfo?: unknown;
}

export interface ZhihuDocumentNormalizationResult {
  document: ZhihuDocument;
  diagnostics: readonly RichTextDiagnostic[];
}

const REMOVED = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'svg',
]);
const BLOCKS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'figure',
  'table',
  'hr',
  'video',
  'audio',
]);
const CONTAINERS = new Set([
  'html',
  'body',
  'main',
  'article',
  'section',
  'div',
  'figcaption',
]);
const TRANSPARENT_INLINE = new Set(['span', 'small', 'label', 'font']);
const LINK_SCHEMES = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'zhihu:',
  'zhihu--:',
]);
const FORMATS = {
  b: 'strong',
  strong: 'strong',
  i: 'emphasis',
  em: 'emphasis',
  u: 'underline',
  del: 'strikethrough',
  s: 'strikethrough',
  strike: 'strikethrough',
  mark: 'highlight',
  sub: 'subscript',
  sup: 'superscript',
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function dimension(value: string | undefined): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 && number <= 100000
    ? number
    : undefined;
}

function textContent(node: Node): string {
  if (isText(node)) return node.data;
  return isTag(node) ? node.children.map(textContent).join('') : '';
}

function hasClass(node: Element, className: string): boolean {
  return (node.attribs.class ?? '').split(/\s+/).includes(className);
}

function isLinkCard(node: Element): boolean {
  return (
    node.name === 'a' &&
    (hasClass(node, 'LinkCard') ||
      node.attribs['data-draft-type'] === 'link-card' ||
      Boolean(node.attribs['data-draft-title']))
  );
}

function plainHtmlText(value: unknown): string | undefined {
  const html = nonempty(value);
  if (!html) return undefined;
  const visibleText = (node: Node): string => {
    if (isText(node)) return node.data;
    if (!isTag(node) || REMOVED.has(node.name) || 'hidden' in node.attribs)
      return '';
    return node.children.map(visibleText).join('');
  };
  return nonempty(parseDocument(html).children.map(visibleText).join(''));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Normalize pin's structured content sequence through the same HTML boundary. */
export function normalizeZhihuContentSegments(
  contentArray: readonly ZhihuContentSegment[],
  options: ZhihuDocumentNormalizationOptions,
): ZhihuDocumentNormalizationResult {
  const unsupported: RichTextDiagnostic[] = [];
  const attribute = (name: string, value: unknown) =>
    typeof value !== 'string' ? '' : ` ${name}="${escapeHtml(value)}"`;
  const sizeAttribute = (name: string, value: number | undefined) =>
    typeof value === 'number' && dimension(String(value)) !== undefined
      ? attribute(name, String(value))
      : '';
  const html = contentArray
    .map((segment) => {
      if (segment.type === 'text') {
        const htmlText =
          typeof segment.content === 'string'
            ? segment.content
            : typeof segment.own_text === 'string'
              ? segment.own_text
              : '';
        return `<div>${htmlText}</div>`;
      }
      if (segment.type === 'image')
        return `<img${attribute('src', segment.url)}${sizeAttribute('data-rawwidth', segment.width)}${sizeAttribute('data-rawheight', segment.height)}>`;
      if (segment.type === 'link_card') {
        const title =
          nonempty(segment.data_draft_title) ??
          nonempty(segment.title) ??
          '链接';
        return `<a data-draft-type="link-card"${attribute('href', segment.url)}${attribute('data-draft-title', title)}${attribute('data-draft-cover', segment.data_draft_cover)}>${escapeHtml(title)}</a>`;
      }
      if (segment.type === 'video') {
        const url = safeUrl(nonempty(segment.url));
        const pageId = url ? parseZhihuVideoReference(url)?.id : undefined;
        return `<video${attribute(pageId ? 'href' : 'src', segment.url)}${attribute('data-lens-id', nonempty(segment.video_id) ?? nonempty(segment.video_bo_id))}${attribute('poster', segment.thumbnail)}${attribute('title', segment.title)}${sizeAttribute('width', segment.width)}${sizeAttribute('height', segment.height)}>视频</video>`;
      }
      unsupported.push({
        kind: 'unsupported-node',
        sourceType: 'pin-content-segment',
      });
      const fallback =
        typeof segment.content === 'string'
          ? segment.content
          : typeof segment.own_text === 'string'
            ? segment.own_text
            : '';
      const label = nonempty(segment.title);
      return `<div>${fallback}</div><p>[暂不支持的想法内容${label ? `：${escapeHtml(label)}` : ''}]</p>`;
    })
    .join('');
  const normalized = normalizeZhihuDocument(html, options);
  return {
    ...normalized,
    diagnostics: [...normalized.diagnostics, ...unsupported],
  };
}

/** URL allowlist for this prototype; no executable HTML is passed to native. */
function safeUrl(value: string | undefined, image = false): string | undefined {
  let candidate = value?.trim();
  // Synthetic development images are decoded by native bitmap/SVG code, never
  // loaded as an HTML page. Restrict data URLs to explicit image media types.
  if (
    image &&
    candidate &&
    candidate.length <= 1024 * 1024 &&
    /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;(?:base64|utf8|charset=utf-8))*,/i.test(
      candidate,
    )
  )
    return candidate;
  const visited = new Set<string>();
  for (let count = 0; count < 5; count += 1) {
    if (!candidate) return undefined;
    try {
      const url = new URL(
        candidate.startsWith('//')
          ? `https:${candidate}`
          : candidate.startsWith('/')
            ? `https://www.zhihu.com${candidate}`
            : candidate,
      );
      if (
        image
          ? !['http:', 'https:'].includes(url.protocol)
          : !LINK_SCHEMES.has(url.protocol)
      )
        return undefined;
      if (url.username || url.password || visited.has(url.href))
        return undefined;
      visited.add(url.href);
      const target =
        !image && url.hostname.toLowerCase() === 'link.zhihu.com'
          ? url.searchParams.get('target')
          : null;
      if (!target) return url.href;
      candidate = target;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function resolveImageUrl(element: Element): string | undefined {
  const token = element.attribs['data-original-token'];
  const validToken =
    token && /^v2-[a-f\d]{32}$/i.test(token) ? token : undefined;
  const sources = [
    element.attribs['data-actualsrc'],
    element.attribs['data-original'],
    element.attribs['data-original-src'],
    element.attribs['data-default-watermark-src'],
    element.attribs['data-thumbnail'],
    element.attribs.src,
    ...(validToken ? [`https://pic1.zhimg.com/${validToken}`] : []),
  ];
  return sources
    .map((source) =>
      safeUrl(
        validToken && source
          ? source.replace(/v2-[a-f\d]{32}/i, validToken)
          : source,
        true,
      ),
    )
    .find((candidate) => candidate !== undefined);
}

function isFormulaUrl(url: string | undefined): boolean {
  return /(?:\/|\b)equation(?:\?|\/|$)/i.test(url ?? '');
}

function isFormulaImage(element: Element): boolean {
  return (
    element.attribs.eeimg === '1' ||
    element.attribs.eeimg === '2' ||
    isFormulaUrl(resolveImageUrl(element))
  );
}

function formulaSource(
  element: Element,
  imageUrl = resolveImageUrl(element),
): string | undefined {
  if (
    element.attribs.eeimg !== '1' &&
    element.attribs.eeimg !== '2' &&
    !isFormulaUrl(imageUrl)
  )
    return undefined;
  if (element.attribs.alt) return element.attribs.alt;
  if (!imageUrl || !isFormulaUrl(imageUrl)) return undefined;
  try {
    return new URL(imageUrl).searchParams.get('tex') ?? undefined;
  } catch {
    // Formula classification must never prevent surrounding text from rendering.
    // imageResource owns URL diagnostics and the visible unavailable-image fallback.
    return undefined;
  }
}

/** Inspect MathJax display constructs without rewriting LaTeX or matrix rows. */
function isDisplayFormula(latex: string | undefined): boolean {
  if (!latex) return false;
  let depth = 0;
  const environments: string[] = [];
  let cursor = 0;
  while (cursor < latex.length) {
    const character = latex[cursor];
    if (character === '%') {
      while (
        cursor < latex.length &&
        latex[cursor] !== '\n' &&
        latex[cursor] !== '\r'
      )
        cursor += 1;
    } else if (character === '{') {
      depth += 1;
      cursor += 1;
    } else if (character === '}') {
      depth = Math.max(0, depth - 1);
      cursor += 1;
    } else if (character === '\\') {
      if (latex[cursor + 1] === '\\') {
        if (depth === 0 && environments.length === 0) return true;
        cursor += 2;
        continue;
      }
      const command = /^\\([a-zA-Z]+|[^a-zA-Z])/.exec(latex.slice(cursor));
      if (!command) {
        cursor += 1;
        continue;
      }
      cursor += command[0].length;
      if (command[1] === 'tag') return true;
      if (command[1] !== 'begin' && command[1] !== 'end') continue;
      // Whitespace and LaTeX comments may separate a command and its argument.
      while (cursor < latex.length) {
        if (/\s/.test(latex[cursor])) cursor += 1;
        else if (latex[cursor] === '%') {
          while (
            cursor < latex.length &&
            latex[cursor] !== '\n' &&
            latex[cursor] !== '\r'
          )
            cursor += 1;
        } else break;
      }
      const environment = /^\{([^{}]+)\}/.exec(latex.slice(cursor));
      if (!environment) continue;
      cursor += environment[0].length;
      const name = environment[1];
      if (command[1] === 'begin') {
        if (
          depth === 0 &&
          environments.length === 0 &&
          (name === 'align' || name === 'align*')
        )
          return true;
        environments.push(name);
      } else if (environments.at(-1) === name) environments.pop();
    } else cursor += 1;
  }
  return false;
}

/** Source paragraph text excludes generated markers and image placeholders. */
function inlineText(runs: readonly ZhihuInlineRun[]): string {
  return runs
    .map((run) => {
      if ('children' in run) return inlineText(run.children);
      if ('text' in run) return run.text;
      if (run.type === 'unsupported') return run.fallbackText;
      if (run.type === 'footnoteReference') return run.label;
      return '';
    })
    .join('');
}

export function normalizeZhihuDocument(
  html: string,
  options: ZhihuDocumentNormalizationOptions,
): ZhihuDocumentNormalizationResult {
  const diagnostics: RichTextDiagnostic[] = [];
  const footnotes = new Map<string, ZhihuFootnoteDefinition>();
  const embeddedFootnotes = new Set<string>();
  const referencedFootnotes = new Set<string>();
  const displayFormulaIds = new Set<string>();
  const segments = new Map(
    (options.segmentInfos ?? []).map((segment) => [segment.pid, segment]),
  );
  let serial = 0;
  const id = (kind: string) => `${options.documentId}:${kind}:${++serial}`;
  const diagnostic = (
    kind: RichTextDiagnostic['kind'],
    sourceType: string,
    nodeId?: string,
  ) => diagnostics.push({ kind, sourceType, ...(nodeId && { nodeId }) });
  const footnoteId = (label: string) =>
    `${options.documentId}:footnote:${encodeURIComponent(label)}`;

  function imageResource(element: Element): ZhihuImageResource | undefined {
    const url = resolveImageUrl(element);
    if (!url) {
      diagnostic('unsafe-url', 'img');
      return undefined;
    }
    const width =
      dimension(element.attribs['data-rawwidth']) ??
      dimension(element.attribs.width);
    const height =
      dimension(element.attribs['data-rawheight']) ??
      dimension(element.attribs.height);
    let originalUrl = safeUrl(
      element.attribs['data-original-src'] ?? element.attribs['data-original'],
      true,
    );
    const originalToken = element.attribs['data-original-token'];
    if (originalUrl && originalToken && /^v2-[a-f\d]{32}$/i.test(originalToken))
      originalUrl = originalUrl.replace(/v2-[a-f\d]{32}/i, originalToken);
    return {
      mediaType: 'image',
      url,
      ...(width && { width }),
      ...(height && { height }),
      ...(originalUrl && originalUrl !== url && { originalUrl }),
    };
  }

  function imageRun(element: Element): ZhihuInlineRun {
    const resource = imageResource(element);
    const nodeId = id('image');
    if (!resource)
      return {
        id: nodeId,
        type: 'unsupported',
        sourceType: 'img',
        fallbackText: element.attribs.alt
          ? `[图片：${element.attribs.alt}]`
          : '[图片不可用]',
      };
    const latex = formulaSource(element, resource.url);
    if (
      element.attribs.eeimg === '1' ||
      element.attribs.eeimg === '2' ||
      isFormulaUrl(resource.url)
    ) {
      if (element.attribs.eeimg === '2' || isDisplayFormula(latex))
        displayFormulaIds.add(nodeId);
      return {
        id: nodeId,
        type: 'inlineFormula',
        formula: { image: resource, ...(latex && { latex }) },
      };
    }
    return {
      id: nodeId,
      type: 'inlineImage',
      resource,
      role: isDailyAvatar(element.attribs, options.variant ?? 'default')
        ? 'avatar'
        : 'content',
      ...(element.attribs.alt && { alt: element.attribs.alt }),
    };
  }

  function inline(
    nodes: readonly Node[],
    preserveWhitespace = false,
  ): ZhihuInlineRun[] {
    const result: ZhihuInlineRun[] = [];
    for (const node of nodes) {
      if (isText(node)) {
        const text = preserveWhitespace
          ? node.data
          : node.data.replace(/[\t\n\f\r ]+/g, ' ');
        if (text) result.push({ id: id('text'), type: 'text', text });
        continue;
      }
      if (!isTag(node)) continue;
      const tag = node.name.toLowerCase();
      if (REMOVED.has(tag) || 'hidden' in node.attribs) {
        diagnostic('removed-node', tag);
        continue;
      }
      if (tag === 'img') {
        result.push(imageRun(node));
        continue;
      }
      if (tag === 'br') {
        result.push({ id: id('break'), type: 'lineBreak' });
        continue;
      }
      const label = nonempty(node.attribs['data-numero']);
      if (
        (tag === 'a' || tag === 'sup') &&
        (hasClass(node, 'footnote-ref') || label)
      ) {
        const number =
          label ??
          textContent(node)
            .replace(/^\[|\]$/g, '')
            .trim();
        if (number) {
          const definitionId = footnoteId(number);
          referencedFootnotes.add(number);
          // Zhihu reference nodes carry their definition in attributes rather
          // than a separate footnotes section (see the formula/table fixture).
          const definitionText = nonempty(node.attribs['data-text']);
          if (definitionText && !footnotes.has(number)) {
            const definitionUrl = safeUrl(node.attribs['data-url']);
            if (node.attribs['data-url'] && !definitionUrl)
              diagnostic('unsafe-url', 'footnote-source');
            const textRun: ZhihuInlineRun = {
              id: id('footnote-text'),
              type: 'text',
              text: definitionText,
            };
            footnotes.set(number, {
              id: definitionId,
              label: number,
              blocks: [
                {
                  id: id('footnote-paragraph'),
                  type: 'paragraph',
                  children: definitionUrl
                    ? [
                        {
                          id: id('footnote-source'),
                          type: 'link',
                          kind: 'link',
                          url: definitionUrl,
                          children: [textRun],
                        },
                      ]
                    : [textRun],
                },
              ],
            });
            embeddedFootnotes.add(number);
          }
          result.push({
            id: id('footnote-reference'),
            type: 'footnoteReference',
            label: textContent(node).trim() || number,
            definitionId,
          });
          continue;
        }
      }
      const children = inline(node.children, preserveWhitespace);
      const highlight = parseZhihuSegmentHighlight(node.attribs);
      if (highlight !== null) {
        const sourceUrl = safeUrl(highlight.sourceUrl);
        result.push({
          id: id('segment-highlight'),
          type: 'segmentHighlight',
          children,
          highlight: { ...highlight, sourceUrl },
        });
      } else if (tag === 'a') {
        const url = safeUrl(node.attribs.href);
        if (!url) {
          if (node.attribs.href) diagnostic('unsafe-url', 'a');
          result.push(...children);
        } else
          result.push({
            id: id('link'),
            type: 'link',
            url,
            kind: hasClass(node, 'member_mention')
              ? 'memberMention'
              : hasClass(node, 'hash_tag')
                ? 'topicTag'
                : 'link',
            children: children.length
              ? children
              : [{ id: id('text'), type: 'text', text: '链接' }],
          });
      } else if (tag === 'code' || tag === 'kbd') {
        result.push({
          id: id(tag),
          type: tag === 'code' ? 'inlineCode' : 'keyboardInput',
          text: textContent(node),
        });
      } else if (Object.hasOwn(FORMATS, tag)) {
        const type = FORMATS[tag as keyof typeof FORMATS];
        result.push({ id: id(type), type, children });
      } else if (
        TRANSPARENT_INLINE.has(tag) ||
        BLOCKS.has(tag) ||
        CONTAINERS.has(tag)
      )
        result.push(...children);
      else {
        diagnostic('unsupported-node', tag);
        // Keep nested supported content visible while documenting the missing box semantics.
        result.push(...children);
      }
    }
    return result;
  }

  function trimRuns(runs: ZhihuInlineRun[]): ZhihuInlineRun[] {
    // Preserve whitespace between formatting nodes, trim only paragraph edges.
    const trimEdge = (
      run: ZhihuInlineRun,
      beginning: boolean,
    ): ZhihuInlineRun => {
      if (run.type === 'text')
        return {
          ...run,
          text: beginning
            ? run.text.replace(/^ +/, '')
            : run.text.replace(/ +$/, ''),
        };
      if ('children' in run && run.children.length) {
        const children = [...run.children];
        const position = beginning ? 0 : children.length - 1;
        children[position] = trimEdge(children[position], beginning);
        return { ...run, children };
      }
      return run;
    };
    if (runs.length) {
      runs[0] = trimEdge(runs[0], true);
      runs[runs.length - 1] = trimEdge(runs[runs.length - 1], false);
    }
    return runs.filter((run) => run.type !== 'text' || run.text.length > 0);
  }

  function annotate(
    children: ZhihuInlineRun[],
    paragraphId: string | undefined,
  ): ZhihuInlineRun[] {
    const source = inlineText(children);
    const validate = (runs: readonly ZhihuInlineRun[]): ZhihuInlineRun[] =>
      runs.map((run) => {
        if (run.type === 'segmentHighlight' && run.highlight?.location) {
          const location = run.highlight.location;
          if (
            location.range.end > source.length ||
            location.paragraphId !== paragraphId
          ) {
            diagnostic('invalid-range', 'highlight-wrap', run.id);
            return {
              ...run,
              children: validate(run.children),
              highlight: { ...run.highlight, location: undefined },
            };
          }
        }
        return 'children' in run
          ? { ...run, children: validate(run.children) }
          : run;
      });
    children = validate(children);
    const segment = paragraphId ? segments.get(paragraphId) : undefined;
    if (!segment) return children;
    if (segment.text !== source) {
      diagnostic('invalid-range', 'segment-text');
      return children;
    }
    if (!source.length) return children;
    const sliceRuns = createInlineRunSlicer(children);
    let previousEnd = 0;
    const result: ZhihuInlineRun[] = [];
    for (const mark of [...segment.marks].sort(
      (a, b) => a.start_index - b.start_index,
    )) {
      const { start_index: start, end_index: end } = mark;
      const bisectsSurrogate = (offset: number) =>
        offset > 0 &&
        offset < source.length &&
        /[\uD800-\uDBFF]/.test(source[offset - 1]) &&
        /[\uDC00-\uDFFF]/.test(source[offset]);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < previousEnd ||
        start < 0 ||
        start >= end ||
        end > source.length ||
        bisectsSurrogate(start) ||
        bisectsSurrogate(end)
      ) {
        diagnostic('invalid-range', 'segment');
        continue;
      }
      result.push(...sliceRuns(previousEnd, start));
      result.push({
        id: id('segment'),
        type: 'segment',
        paragraphId: segment.pid,
        range: { start, end },
        children: sliceRuns(start, end),
        ...(mark.seg_info && { segInfo: mark.seg_info }),
        ...(mark.master_seg_info && { masterSegInfo: mark.master_seg_info }),
      });
      previousEnd = end;
    }
    result.push(...sliceRuns(previousEnd, source.length));
    return result;
  }

  function paragraph(nodes: readonly Node[], paragraphId?: string): ZhihuBlock {
    return {
      id: id('paragraph'),
      type: 'paragraph',
      ...(paragraphId && { paragraphId }),
      children: annotate(trimRuns(inline(nodes)), paragraphId),
    };
  }

  /** Lift display math through inline wrappers without losing their adjacent text. */
  function paragraphBlocks(
    nodes: readonly Node[],
    paragraphId?: string,
  ): ZhihuBlock[] {
    const original = paragraph(nodes, paragraphId);
    if (original.type !== 'paragraph') return [original];
    type FormulaRun = Extract<ZhihuInlineRun, { type: 'inlineFormula' }>;
    type Part = ZhihuInlineRun[] | FormulaRun;
    const isDisplay = (run: ZhihuInlineRun): boolean =>
      (run.type === 'inlineFormula' && displayFormulaIds.has(run.id)) ||
      ('children' in run && run.children.some(isDisplay));
    if (!original.children.some(isDisplay)) return [original];

    const split = (runs: readonly ZhihuInlineRun[]): Part[] => {
      const parts: Part[] = [];
      let pending: ZhihuInlineRun[] = [];
      const flush = () => {
        if (pending.length) parts.push(pending);
        pending = [];
      };
      for (const run of runs) {
        if (run.type === 'inlineFormula' && displayFormulaIds.has(run.id)) {
          flush();
          parts.push(run);
        } else if ('children' in run && run.children.some(isDisplay)) {
          const children = split(run.children);
          for (const [index, part] of children.entries()) {
            if (Array.isArray(part))
              pending.push({
                ...run,
                id: `${run.id}:part:${index}`,
                children: part,
              });
            else {
              flush();
              parts.push(part);
            }
          }
        } else pending.push(run);
      }
      flush();
      return parts;
    };
    // A hard break adjacent to an extracted block is already represented by the
    // block boundary. Keep all other br nodes, including inline formula lines.
    const trimBoundary = (
      runs: readonly ZhihuInlineRun[],
      beginning: boolean,
    ): ZhihuInlineRun[] => {
      const trimmed = [...runs];
      while (trimmed.length) {
        const index = beginning ? 0 : trimmed.length - 1;
        const run = trimmed[index];
        if (
          run.type === 'lineBreak' ||
          (run.type === 'text' && !run.text.trim())
        )
          trimmed.splice(index, 1);
        else if ('children' in run) {
          const children = trimBoundary(run.children, beginning);
          if (children.length) {
            trimmed[index] = { ...run, children };
            break;
          }
          trimmed.splice(index, 1);
        } else break;
      }
      return trimmed;
    };
    const parts = split(original.children);
    return parts.flatMap((part, index): ZhihuBlock[] => {
      if (!Array.isArray(part))
        return [{ id: part.id, type: 'blockFormula', formula: part.formula }];
      let children = part;
      if (index > 0 && !Array.isArray(parts[index - 1]))
        children = trimBoundary(children, true);
      if (index < parts.length - 1 && !Array.isArray(parts[index + 1]))
        children = trimBoundary(children, false);
      children = trimRuns(children);
      return children.length
        ? [{ ...original, id: `${original.id}:part:${index}`, children }]
        : [];
    });
  }

  function collectFootnotes(node: Element): void {
    const visit = (element: Element) => {
      const label =
        nonempty(element.attribs['data-numero']) ??
        (element.name === 'li'
          ? nonempty(element.attribs.id)?.replace(/^(?:fn|footnote)[-_]?/i, '')
          : undefined);
      if (label) {
        if (footnotes.has(label) && !embeddedFootnotes.has(label)) {
          diagnostic('unsupported-node', 'duplicate-footnote');
          return;
        }
        footnotes.set(label, {
          id: footnoteId(label),
          label,
          blocks: blocks(element.children),
        });
        embeddedFootnotes.delete(label);
        return;
      }
      for (const child of element.children) if (isTag(child)) visit(child);
    };
    visit(node);
  }

  function tableRows(nodes: readonly Node[]): ZhihuTableRow[] {
    const rows: ZhihuTableRow[] = [];
    for (const node of nodes) {
      if (!isTag(node)) continue;
      if (node.name !== 'tr') {
        rows.push(...tableRows(node.children));
        continue;
      }
      const cells = node.children
        .filter(
          (cell): cell is Element =>
            isTag(cell) && (cell.name === 'td' || cell.name === 'th'),
        )
        .map((cell) => {
          const align =
            cell.attribs.align ??
            /text-align\s*:\s*(left|center|right)/i.exec(
              cell.attribs.style ?? '',
            )?.[1];
          const alignment: ZhihuTableAlignment =
            align === 'left' || align === 'center' || align === 'right'
              ? align
              : 'default';
          const span = (value: string | undefined) => {
            const parsed = Number(value);
            return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100
              ? parsed
              : undefined;
          };
          return {
            id: id('cell'),
            isHeader: cell.name === 'th',
            alignment,
            colSpan: span(cell.attribs.colspan),
            rowSpan: span(cell.attribs.rowspan),
            blocks: blocks(cell.children),
          };
        });
      rows.push({ id: id('row'), cells });
    }
    return rows;
  }

  function linkCard(node: Element): ZhihuBlock | undefined {
    const url = safeUrl(node.attribs.href);
    if (!url) {
      diagnostic('unsafe-url', 'link-card');
      return undefined;
    }
    let metadata =
      record(options.linkCardInfo)?.[node.attribs.href] ??
      record(options.linkCardInfo)?.[url];
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = undefined;
      }
    }
    const card = record(metadata);
    const display = record(card?.display);
    const image = record(display?.image);
    const content = record(display?.content);
    const title =
      plainHtmlText(display?.title) ??
      plainHtmlText(card?.title) ??
      plainHtmlText(node.attribs['data-draft-title']) ??
      nonempty(textContent(node)) ??
      '链接';
    const description =
      plainHtmlText(display?.desc) ??
      plainHtmlText(display?.description) ??
      plainHtmlText(card?.description);
    const imageUrl = [
      node.attribs['data-draft-cover'],
      display?.image,
      image?.image_url,
      image?.url,
      image?.src,
      display?.image_url,
      display?.cover_url,
      display?.thumbnail,
      display?.cover,
      content?.image_url,
      content?.cover_url,
      content?.thumbnail,
      content?.url,
      content?.src,
    ]
      .map((candidate) => safeUrl(nonempty(candidate), true))
      .find((candidate) => candidate !== undefined);
    const cardUrl = safeUrl(nonempty(display?.card_open_url)) ?? url;
    return {
      id: id('card'),
      type: 'linkCard',
      url: cardUrl,
      title,
      ...(description && { description }),
      ...(imageUrl && { image: { mediaType: 'image', url: imageUrl } }),
    };
  }

  function block(node: Element): ZhihuBlock[] {
    const tag = node.name.toLowerCase();
    const paragraphId = nonempty(node.attribs['data-pid']);
    if (REMOVED.has(tag) || 'hidden' in node.attribs) {
      diagnostic('removed-node', tag);
      return [];
    }
    if (
      hasClass(node, 'footnotes') ||
      (hasClass(node, 'footnote') && tag === 'aside')
    ) {
      collectFootnotes(node);
      return [];
    }
    if (tag === 'p') {
      const meaningful = node.children.filter(
        (child) => !isText(child) || child.data.trim(),
      );
      const independent = (child: Node): child is Element => {
        if (!isTag(child)) return false;
        if (child.name !== 'img')
          return (
            BLOCKS.has(child.name) ||
            isLinkCard(child) ||
            (child.name === 'a' &&
              (hasClass(child, 'video-box') ||
                Boolean(child.attribs['data-lens-id'])))
          );
        if (
          isFormulaImage(child) ||
          isDailyAvatar(child.attribs, options.variant ?? 'default')
        )
          return false;
        const width =
          dimension(child.attribs['data-rawwidth']) ??
          dimension(child.attribs.width);
        const height =
          dimension(child.attribs['data-rawheight']) ??
          dimension(child.attribs.height);
        return (
          meaningful.length === 1 ||
          !width ||
          !height ||
          width > 128 ||
          height > 128
        );
      };
      if (meaningful.some(independent)) {
        const result: ZhihuBlock[] = [];
        let pending: Node[] = [];
        for (const child of node.children) {
          if (independent(child)) {
            if (pending.some((item) => !isText(item) || item.data.trim()))
              result.push(...paragraphBlocks(pending, paragraphId));
            pending = [];
            result.push(...block(child));
          } else pending.push(child);
        }
        if (pending.some((item) => !isText(item) || item.data.trim()))
          result.push(...paragraphBlocks(pending, paragraphId));
        return result;
      }
      return paragraphBlocks(node.children, paragraphId);
    }
    if (/^h[1-6]$/.test(tag)) {
      const children = annotate(trimRuns(inline(node.children)), paragraphId);
      return children.length
        ? [
            {
              id: id('heading'),
              type: 'heading',
              level: Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6,
              ...(paragraphId && { paragraphId }),
              children,
            },
          ]
        : [];
    }
    if (tag === 'img') {
      const run = imageRun(node);
      if (run.type === 'inlineFormula')
        return displayFormulaIds.has(run.id)
          ? [{ id: run.id, type: 'blockFormula', formula: run.formula }]
          : [{ id: id('paragraph'), type: 'paragraph', children: [run] }];
      if (run.type === 'inlineImage')
        return [
          {
            id: run.id,
            type: 'image',
            resource: run.resource,
            role: run.role,
            alt: run.alt,
          },
        ];
      return [
        {
          id: run.id,
          type: 'unsupported',
          sourceType: 'img',
          fallbackText:
            run.type === 'unsupported' ? run.fallbackText : '[图片不可用]',
        },
      ];
    }
    if (tag === 'figure') {
      const result = blocks(
        node.children.filter(
          (child) => !isTag(child) || child.name !== 'figcaption',
        ),
      );
      const captionNode = node.children.find(
        (child): child is Element =>
          isTag(child) && child.name === 'figcaption',
      );
      const caption = captionNode
        ? trimRuns(inline(captionNode.children))
        : undefined;
      const firstImage = result.findIndex((item) => item.type === 'image');
      if (caption?.length && firstImage >= 0) {
        const image = result[firstImage];
        if (image.type === 'image') result[firstImage] = { ...image, caption };
      } else if (caption?.length)
        result.push({
          id: id('caption'),
          type: 'paragraph',
          children: caption,
        });
      return result;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items: ZhihuListItem[] = [];
      for (const child of node.children) {
        if (!isTag(child)) continue;
        if (child.name === 'li')
          items.push({
            id: id('list-item'),
            blocks: blocks(child.children, nonempty(child.attribs['data-pid'])),
          });
        else if (child.name === 'ul' || child.name === 'ol') {
          // Some stored Zhihu lists put the nested list beside, rather than
          // inside, its preceding <li>. Do not silently discard that content.
          const nestedBlocks = block(child);
          const previous = items[items.length - 1];
          if (previous)
            items[items.length - 1] = {
              ...previous,
              blocks: [...previous.blocks, ...nestedBlocks],
            };
          else items.push({ id: id('list-item'), blocks: nestedBlocks });
        }
      }
      return [
        {
          id: id('list'),
          type: 'list',
          ordered: tag === 'ol',
          start:
            tag === 'ol' &&
            Number.isSafeInteger(Number(node.attribs.start)) &&
            Number(node.attribs.start) > 0
              ? Number(node.attribs.start)
              : undefined,
          items,
        },
      ];
    }
    if (tag === 'blockquote')
      return [
        { id: id('quote'), type: 'quote', blocks: blocks(node.children) },
      ];
    if (tag === 'pre') {
      const code = node.children.find(
        (child): child is Element => isTag(child) && child.name === 'code',
      );
      const language =
        /(?:^|\s)language-([^\s]+)/.exec(code?.attribs.class ?? '')?.[1] ??
        /(?:^|\s)language-([^\s]+)/.exec(node.attribs.class ?? '')?.[1] ??
        nonempty(node.attribs.lang);
      return [
        {
          id: id('code'),
          type: 'code',
          text: textContent(node),
          ...(language && { language }),
        },
      ];
    }
    if (tag === 'hr') return [{ id: id('divider'), type: 'divider' }];
    if (tag === 'table') {
      const elements = node.children.filter(isTag);
      const head = tableRows(
        elements.filter((child) => child.name === 'thead'),
      );
      const foot = tableRows(
        elements.filter((child) => child.name === 'tfoot'),
      );
      const body = tableRows(
        elements.filter(
          (child) => child.name === 'tbody' || child.name === 'tr',
        ),
      );
      const caption = elements.find((child) => child.name === 'caption');
      return [
        {
          id: id('table'),
          type: 'table',
          ...(head.length && { head }),
          body,
          ...(foot.length && { foot }),
          ...(caption && { caption: trimRuns(inline(caption.children)) }),
        },
      ];
    }
    if (
      tag === 'video' ||
      (tag === 'a' &&
        (hasClass(node, 'video-box') || node.attribs['data-lens-id']))
    ) {
      const source = node.children.find(
        (child): child is Element => isTag(child) && child.name === 'source',
      );
      const rawResourceUrl = node.attribs.src ?? source?.attribs.src;
      const safeResourceUrl = safeUrl(rawResourceUrl, true);
      const resourceUrl = getDirectZhihuVideoUrl(safeResourceUrl);
      if (rawResourceUrl && !resourceUrl)
        diagnostic('unsafe-url', 'video-resource');
      const href = safeUrl(node.attribs.href);
      const page = href ? parseZhihuVideoReference(href) : null;
      const attributeLensId = nonempty(node.attribs['data-lens-id']);
      const lensId =
        (attributeLensId && /^\d+$/.test(attributeLensId)
          ? attributeLensId
          : undefined) ?? (page?.kind === 'lens' ? page.id : undefined);
      const videoId = page?.id ?? attributeLensId;
      const url =
        href ??
        (videoId && /^\d+$/.test(videoId)
          ? `https://www.zhihu.com/zvideo/${videoId}`
          : undefined) ??
        resourceUrl;
      const posterImage = DomUtils.findOne(
        (child) => child.name === 'img',
        node.children,
        true,
      );
      const poster =
        safeUrl(node.attribs.poster, true) ??
        safeUrl(node.attribs['data-thumbnail'], true) ??
        (posterImage ? resolveImageUrl(posterImage) : undefined);
      if (url)
        return [
          {
            id: id('video'),
            type: 'video',
            url,
            ...(videoId && { videoId }),
            ...(lensId && { lensId }),
            ...(resourceUrl && {
              resource: {
                mediaType: 'video',
                url: resourceUrl,
                ...(dimension(node.attribs.width) && {
                  width: dimension(node.attribs.width),
                }),
                ...(dimension(node.attribs.height) && {
                  height: dimension(node.attribs.height),
                }),
              },
            }),
            ...(poster && { poster: { mediaType: 'image', url: poster } }),
            ...(nonempty(node.attribs.title) && { title: node.attribs.title }),
          },
        ];
      diagnostic('unsupported-node', 'video');
      return [
        {
          id: id('unsupported'),
          type: 'unsupported',
          sourceType: 'video',
          fallbackText: '[视频不可用]',
        },
      ];
    }
    if (isLinkCard(node)) {
      const card = linkCard(node);
      return card ? [card] : paragraphBlocks(node.children);
    }
    if (tag === 'audio') {
      diagnostic('unsupported-node', 'audio');
      return [
        {
          id: id('unsupported'),
          type: 'unsupported',
          sourceType: 'audio',
          fallbackText: '[音频内容]',
        },
      ];
    }
    if (CONTAINERS.has(tag)) return blocks(node.children, paragraphId);
    return paragraphBlocks([node], paragraphId);
  }

  function blocks(nodes: readonly Node[], paragraphId?: string): ZhihuBlock[] {
    const result: ZhihuBlock[] = [];
    let pending: Node[] = [];
    const flush = () => {
      if (pending.some((node) => !isText(node) || node.data.trim()))
        result.push(...paragraphBlocks(pending, paragraphId));
      pending = [];
    };
    for (const node of nodes) {
      if (
        isTag(node) &&
        (BLOCKS.has(node.name) ||
          CONTAINERS.has(node.name) ||
          REMOVED.has(node.name) ||
          'hidden' in node.attribs ||
          // Bare list items, quotes and containers need the same inline math
          // handling as <p>. The paragraph splitter lifts actual display math.
          (node.name === 'img' &&
            (!isFormulaImage(node) || !resolveImageUrl(node))) ||
          isLinkCard(node) ||
          (node.name === 'a' &&
            (hasClass(node, 'video-box') || node.attribs['data-lens-id'])))
      ) {
        flush();
        result.push(...block(node));
      } else pending.push(node);
    }
    flush();
    return result;
  }

  const parsed = parseDocument(html, {
    decodeEntities: true,
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
  });
  const documentBlocks = blocks(parsed.children);
  for (const label of referencedFootnotes) {
    if (!footnotes.has(label)) {
      diagnostic('missing-footnote', 'footnote-reference');
      footnotes.set(label, {
        id: footnoteId(label),
        label,
        blocks: [
          {
            id: id('missing-footnote'),
            type: 'unsupported',
            sourceType: 'footnote',
            fallbackText: `[脚注 ${label} 暂无定义]`,
          },
        ],
      });
    }
  }
  return {
    document: {
      id: options.documentId,
      blocks: documentBlocks,
      ...(footnotes.size && { footnotes: [...footnotes.values()] }),
    },
    diagnostics,
  };
}
