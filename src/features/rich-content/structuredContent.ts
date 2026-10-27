import type {
  ZhihuSegmentInfo,
  ZhihuSegmentReaction,
  ZhihuStructuredContent,
  ZhihuStructuredContentMark,
  ZhihuStructuredContentPaging,
  ZhihuStructuredContentSegment,
  ZhihuStructuredContentSegmentLikePayload,
  ZhihuStructuredContentTextPayload,
} from '@/types/zhihu';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuHeadingBlock,
  ZhihuImageResource,
  ZhihuInlineRun,
  ZhihuListItem,
  ZhihuTextRange,
} from './document';
import { isZhihuImageId, withOriginalImageId } from './imagePolicy';
import { getSafeRichContentUrl } from './webviewSecurity';

const INVALID_CONTENT = '原生正文返回结构无效';

function record(
  value: unknown,
  message = INVALID_CONTENT,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, message = INVALID_CONTENT): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error(INVALID_CONTENT);
  return value;
}

function number(value: unknown, message = INVALID_CONTENT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
}

function integer(value: unknown): number {
  const result = number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(INVALID_CONTENT);
  }
  return result;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(INVALID_CONTENT);
  return value;
}

function strings(value: unknown): string[] {
  return array(value).map((entry) => string(entry));
}

/** Decode pagination independently from the outer answer-list pagination. */
export function parseStructuredContentPaging(
  value: unknown,
): ZhihuStructuredContentPaging {
  let decoded = value;
  if (typeof value === 'string') {
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      throw new Error(INVALID_CONTENT);
    }
  }
  const paging = record(decoded);
  const isEnd = boolean(paging.is_end);
  const next = string(paging.next);
  if (!isEnd && !next.trim()) throw new Error(INVALID_CONTENT);
  return {
    is_end: isEnd,
    is_start: boolean(paging.is_start),
    next,
    previous: string(paging.previous),
    totals: number(paging.totals),
  };
}

function parseMark(
  value: unknown,
  text: string,
): ZhihuStructuredContentMark | null {
  const mark = record(value);
  const range = {
    start_index: integer(mark.start_index),
    end_index: integer(mark.end_index),
  };
  if (
    range.end_index <= range.start_index ||
    range.end_index > text.length ||
    bisectsSurrogate(text, range.start_index) ||
    bisectsSurrogate(text, range.end_index)
  ) {
    throw new Error(INVALID_CONTENT);
  }
  switch (mark.type) {
    case 'seg_like': {
      const reaction = record(mark.seg_like);
      return {
        ...range,
        type: 'seg_like',
        seg_like: {
          comment_count: integer(reaction.comment_count),
          count: integer(reaction.count),
          is_like: boolean(reaction.is_like),
          is_span: boolean(reaction.is_span),
          my_comment_count: integer(reaction.my_comment_count),
          seg_ids: strings(reaction.seg_ids),
        },
      };
    }
    case 'bold':
      return { ...range, type: 'bold' };
    case 'link': {
      const link = record(mark.link);
      if (link.link_type !== 'member_mention' && link.link_type !== 'text') {
        throw new Error(INVALID_CONTENT);
      }
      return {
        ...range,
        type: 'link',
        link: {
          href: string(link.href),
          icon_name: string(link.icon_name),
          link_type: link.link_type,
        },
      };
    }
    case 'entity_word': {
      const entity = record(mark.entity_word);
      if (entity.type !== 'search') throw new Error(INVALID_CONTENT);
      return {
        ...range,
        type: 'entity_word',
        entity_word: {
          attach_info_bytes: string(entity.attach_info_bytes),
          id: string(entity.id),
          type: 'search',
          url: string(entity.url),
          word: string(entity.word),
        },
      };
    }
    case 'formula': {
      const formula = record(mark.formula);
      return {
        ...range,
        type: 'formula',
        formula: {
          content: string(formula.content),
          height: integer(formula.height),
          img_url: string(formula.img_url),
          url: string(formula.url),
          width: integer(formula.width),
        },
      };
    }
    default:
      return null;
  }
}

function parseText(value: unknown): ZhihuStructuredContentTextPayload {
  const payload = record(value);
  const text = string(payload.text);
  return {
    text,
    marks: (Array.isArray(payload.marks) ? payload.marks : []).flatMap(
      (mark) => {
        try {
          const parsed = parseMark(mark, text);
          return parsed ? [parsed] : [];
        } catch {
          // An annotation cannot make otherwise valid source prose unreadable.
          return [];
        }
      },
    ),
  };
}

function parseSegment(value: unknown): ZhihuStructuredContentSegment {
  const segment = record(value);
  const id = string(segment.id);
  if (!id) throw new Error(INVALID_CONTENT);
  switch (segment.type) {
    case 'paragraph': {
      const paragraph = record(segment.paragraph);
      return {
        id,
        type: 'paragraph',
        paragraph: {
          ...parseText(paragraph),
          pid: typeof paragraph.pid === 'string' ? paragraph.pid : '',
        },
      };
    }
    case 'heading': {
      const heading = record(segment.heading);
      const level = integer(heading.level);
      if (level < 1 || level > 6) throw new Error(INVALID_CONTENT);
      return { id, type: 'heading', heading: { ...parseText(heading), level } };
    }
    case 'list_node': {
      const list = record(segment.list_node);
      if (list.type !== 'unordered' && list.type !== 'ordered')
        throw new Error(INVALID_CONTENT);
      return {
        id,
        type: 'list_node',
        list_node: {
          type: list.type,
          items: array(list.items).map((value) => {
            const item = record(value);
            return {
              ...parseText(item),
              indent_level: integer(item.indent_level),
            };
          }),
        },
      };
    }
    case 'card': {
      const card =
        segment.card &&
        typeof segment.card === 'object' &&
        !Array.isArray(segment.card)
          ? record(segment.card)
          : {};
      return {
        id,
        type: 'card',
        card: {
          title:
            typeof card.title === 'string' && card.title.trim()
              ? card.title
              : '链接卡片',
          url: typeof card.url === 'string' ? card.url : '',
          cover: typeof card.cover === 'string' ? card.cover : '',
        },
      };
    }
    case 'image': {
      const image = record(segment.image);
      if (
        (image.layout !== 'normal' && image.layout !== 'small') ||
        image.status !== 'normal'
      ) {
        throw new Error(INVALID_CONTENT);
      }
      return {
        id,
        type: 'image',
        image: {
          description: string(image.description),
          height: integer(image.height),
          is_gif: boolean(image.is_gif),
          layout: image.layout,
          original_token: string(image.original_token),
          original_urls: strings(image.original_urls),
          status: 'normal',
          token: string(image.token),
          urls: strings(image.urls),
          width: integer(image.width),
        },
      };
    }
    case 'hr':
      return { id, type: 'hr' };
    default: {
      const sourceType =
        segment.type === 'unsupported' && typeof segment.sourceType === 'string'
          ? segment.sourceType
          : typeof segment.type === 'string'
            ? segment.type
            : 'unknown';
      const payload = segment[sourceType];
      const fallbackText =
        typeof segment.text === 'string'
          ? segment.text
          : typeof segment.fallbackText === 'string'
            ? segment.fallbackText
            : payload && typeof payload === 'object' && 'text' in payload
              ? payload.text
              : undefined;
      if (typeof fallbackText !== 'string') throw new Error(INVALID_CONTENT);
      return { id, type: 'unsupported', sourceType, fallbackText };
    }
  }
}

/** Missing body structure rejects the body; unsupported annotations keep prose. */
export function parseZhihuStructuredContent(
  value: unknown,
): ZhihuStructuredContent {
  const content = record(value);
  const paging = string(content.paging);
  parseStructuredContentPaging(paging);
  return { paging, segments: array(content.segments).map(parseSegment) };
}

/** Replace duplicate source IDs in place while appending new source segments. */
export function mergeStructuredContentPages(
  pages: readonly ZhihuStructuredContent[],
): ZhihuStructuredContent {
  const latest = pages[pages.length - 1];
  if (!latest) throw new Error('结构化正文缺少页面');
  const segments = new Map<
    string,
    ZhihuStructuredContent['segments'][number]
  >();
  for (const page of pages)
    for (const segment of page.segments) segments.set(segment.id, segment);
  return { paging: latest.paging, segments: [...segments.values()] };
}

export interface ZhihuStructuredContentNormalizationOptions {
  documentId?: string;
  /** Explicit trusted test assets, keyed by their validated source image URL. */
  resources?: Readonly<Record<string, ZhihuImageResource>>;
  /** Load the watermark-free upload of body images when Zhihu provides one. Defaults to true. */
  removeImageWatermark?: boolean;
}

/** Source ranges remain UTF-16 offsets into the unmodified paragraph text. */
export type ZhihuStructuredContentInlineRun = ZhihuInlineRun & {
  readonly range?: ZhihuTextRange;
};

const MAX_LIST_DEPTH = 6;

function bisectsSurrogate(text: string, offset: number): boolean {
  return (
    offset > 0 &&
    offset < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[offset])
  );
}

function segmentReaction(
  reaction: ZhihuStructuredContentSegmentLikePayload,
): ZhihuSegmentReaction {
  return {
    like_count: reaction.count,
    comment_count: reaction.comment_count,
    is_like: reaction.is_like,
    is_span: reaction.is_span,
    my_comment_count: reaction.my_comment_count,
    seg_ids: [...reaction.seg_ids],
  };
}

function uniqueParagraphIds(content: ZhihuStructuredContent): Set<string> {
  const counts = new Map<string, number>();
  for (const segment of content.segments) {
    if (segment.type !== 'paragraph') continue;
    const pid = segment.paragraph.pid;
    if (!pid || pid !== pid.trim()) continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return new Set(
    [...counts].filter(([, count]) => count === 1).map(([pid]) => pid),
  );
}

function unambiguousReactions(
  marks: readonly ZhihuStructuredContentMark[],
): Extract<ZhihuStructuredContentMark, { type: 'seg_like' }>[] {
  const reactions = marks.filter(
    (mark): mark is Extract<ZhihuStructuredContentMark, { type: 'seg_like' }> =>
      mark.type === 'seg_like',
  );
  return reactions.filter(
    (mark) =>
      !reactions.some(
        (other) =>
          other !== mark &&
          mark.start_index < other.end_index &&
          other.start_index < mark.end_index,
      ),
  );
}

/** Project verified source paragraph identities and reactions into shared APIs. */
export function getStructuredContentSegmentInfos(
  content: ZhihuStructuredContent,
): ZhihuSegmentInfo[] {
  const parsed = parseZhihuStructuredContent(content);
  const paragraphIds = uniqueParagraphIds(parsed);
  return parsed.segments.flatMap((segment) => {
    if (
      segment.type !== 'paragraph' ||
      !paragraphIds.has(segment.paragraph.pid)
    )
      return [];
    const { pid, text, marks } = segment.paragraph;
    // Existing business APIs require one exact text range in one paragraph.
    // Atomic formula attachments and crossed/span reactions keep local actions.
    if (marks.some((mark) => mark.type === 'formula')) return [];
    const reactions = unambiguousReactions(marks).filter(
      (mark) => !mark.seg_like.is_span,
    );
    if (!reactions.length) return [];
    return [
      {
        pid,
        text,
        marks: reactions.map((mark) => ({
          start_index: mark.start_index,
          end_index: mark.end_index,
          seg_info: segmentReaction(mark.seg_like),
        })),
      },
    ];
  });
}

function localTestUri(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (/^(?:file:\/\/\/|content:\/\/|asset:\/)/.test(value)) return value;
  // Explicit test assets can also resolve to a local Metro HTTP(S) asset URL.
  return getSafeRichContentUrl(value, true);
}

function imageResource(
  candidates: readonly string[],
  width: number,
  height: number,
  resources?: Readonly<Record<string, ZhihuImageResource>>,
): ZhihuImageResource | undefined {
  const safeCandidates = candidates
    .map((candidate) => getSafeRichContentUrl(candidate, true))
    .filter((url): url is string => url !== undefined);
  const orderedCandidates = [...safeCandidates].sort((left, right) => {
    const hasLocal = (url: string) =>
      Boolean(
        resources &&
          Object.hasOwn(resources, url) &&
          localTestUri(resources[url].offlineUri),
      );
    return Number(hasLocal(right)) - Number(hasLocal(left));
  });
  for (const candidate of orderedCandidates) {
    const url = getSafeRichContentUrl(candidate, true);
    if (!url) continue;
    const supplied =
      resources && Object.hasOwn(resources, url) ? resources[url] : undefined;
    const offlineUri =
      supplied?.mediaType === 'image'
        ? localTestUri(supplied.offlineUri)
        : undefined;
    return {
      mediaType: 'image',
      url,
      ...(width > 0 && { width }),
      ...(height > 0 && { height }),
      ...(supplied?.mediaType === 'image' && {
        ...(typeof supplied.width === 'number' &&
          width <= 0 &&
          Number.isFinite(supplied.width) &&
          supplied.width > 0 && { width: supplied.width }),
        ...(typeof supplied.height === 'number' &&
          height <= 0 &&
          Number.isFinite(supplied.height) &&
          supplied.height > 0 && { height: supplied.height }),
        ...(supplied.mimeType && { mimeType: supplied.mimeType }),
      }),
      ...(offlineUri && { offlineUri }),
    };
  }
  return undefined;
}

function textRun(
  text: string,
  id: string,
  start: number,
  end: number,
): ZhihuStructuredContentInlineRun {
  return { id, type: 'text', text, range: { start, end } };
}

/**
 * Scan mark endpoints directly in JSON text, retaining overlaps as nested runs.
 * Formula placeholders are one atomic attachment. Verified paragraph reactions
 * wrap their complete source range after the visual styles have been built.
 * No HTML/XML is produced, parsed, escaped or executed by this adapter.
 */
export function getStructuredContentTextRuns(
  payload: ZhihuStructuredContentTextPayload,
  idPrefix: string,
  resources?: Readonly<Record<string, ZhihuImageResource>>,
  paragraphId?: string,
): ZhihuInlineRun[] {
  const { text, marks } = parseText(payload);
  if (!text) return [];
  const formulaCandidates = marks
    .map((mark, index) => ({ mark, index }))
    .filter(
      (
        entry,
      ): entry is {
        mark: Extract<ZhihuStructuredContentMark, { type: 'formula' }>;
        index: number;
      } => entry.mark.type === 'formula',
    );
  // Conflicting attachments leave their literal placeholders visible.
  const formulas = formulaCandidates.filter(
    (current) =>
      !formulaCandidates.some(
        (other) =>
          other !== current &&
          current.mark.start_index < other.mark.end_index &&
          other.mark.start_index < current.mark.end_index,
      ),
  );
  const endpoints = new Set([0, text.length]);
  for (const mark of marks) {
    endpoints.add(mark.start_index);
    endpoints.add(mark.end_index);
  }
  const boundaries = [...endpoints]
    .filter(
      (offset) =>
        !formulas.some(
          ({ mark }) => mark.start_index < offset && offset < mark.end_index,
        ),
    )
    .sort((left, right) => left - right);
  const runs: { run: ZhihuInlineRun; start: number; end: number }[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === end) continue;
    const formula = formulas.find(
      ({ mark }) => mark.start_index === start && mark.end_index === end,
    );
    let run: ZhihuStructuredContentInlineRun = textRun(
      text.slice(start, end),
      `${idPrefix}:text:${start}:${end}`,
      start,
      end,
    );
    if (formula) {
      const source = formula.mark.formula;
      const image = imageResource(
        [source.img_url],
        source.width,
        source.height,
        resources,
      );
      const model = source.content.trim()
        ? { latex: source.content, ...(image && { image }) }
        : image
          ? { image }
          : undefined;
      if (text.slice(start, end) === '[公式]' && model) {
        run = {
          id: `${idPrefix}:formula:${formula.index}`,
          type: 'inlineFormula',
          range: { start, end },
          formula: model,
        };
      } else {
        run = {
          id: `${idPrefix}:formula-unavailable:${formula.index}`,
          type: 'unsupported',
          sourceType: 'structuredFormula',
          fallbackText: text.slice(start, end),
          range: { start, end },
        };
      }
    }
    for (let markIndex = marks.length - 1; markIndex >= 0; markIndex -= 1) {
      const mark = marks[markIndex];
      if (
        mark.type === 'formula' ||
        mark.type === 'seg_like' ||
        mark.start_index > start ||
        mark.end_index < end
      )
        continue;
      const id = `${idPrefix}:mark:${markIndex}:${start}:${end}`;
      const range = { start: mark.start_index, end: mark.end_index };
      if (mark.type === 'bold') {
        run = { id, type: 'strong', children: [run], range };
      } else {
        const url = getSafeRichContentUrl(
          mark.type === 'link' ? mark.link.href : mark.entity_word.url,
        );
        if (url) {
          run = {
            id,
            type: 'link',
            kind:
              mark.type === 'link' && mark.link.link_type === 'member_mention'
                ? 'memberMention'
                : 'link',
            url,
            children: [run],
            range,
          };
        }
      }
    }
    runs.push({ run, start, end });
  }
  // Formula paragraphs have no shared business metadata, even outside the
  // attachment range, so keep their visual runs without segment click targets.
  if (!paragraphId || formulaCandidates.length)
    return runs.map(({ run }) => run);
  const unambiguous = unambiguousReactions(marks);
  const result: ZhihuInlineRun[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const entry = runs[index];
    const mark = unambiguous.find(
      (candidate) => candidate.start_index === entry.start,
    );
    const endIndex = mark
      ? runs.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex >= index && candidate.end === mark.end_index,
        )
      : -1;
    if (!mark || endIndex < index) {
      result.push(entry.run);
      continue;
    }
    result.push({
      id: `${idPrefix}:segment:${mark.start_index}:${mark.end_index}`,
      type: 'segment',
      paragraphId,
      range: { start: mark.start_index, end: mark.end_index },
      segInfo: segmentReaction(mark.seg_like),
      children: runs.slice(index, endIndex + 1).map(({ run }) => run),
    });
    index = endIndex;
  }
  return result;
}

interface MutableList {
  id: string;
  type: 'list';
  ordered: boolean;
  items: ZhihuListItem[];
}

function listBlock(
  segment: Extract<ZhihuStructuredContentSegment, { type: 'list_node' }>,
  id: string,
  resources?: Readonly<Record<string, ZhihuImageResource>>,
): ZhihuBlock {
  const ordered = segment.list_node.type === 'ordered';
  const root: MutableList = { id, type: 'list', ordered, items: [] };
  const stack = [root];
  for (const [index, item] of segment.list_node.items.entries()) {
    const targetDepth = Math.min(
      MAX_LIST_DEPTH - 1,
      Math.max(0, item.indent_level - 1),
    );
    if (targetDepth < stack.length - 1) stack.length = targetDepth + 1;
    if (targetDepth > stack.length - 1) {
      const parent = stack[stack.length - 1].items.at(-1);
      if (parent) {
        const nested: MutableList = {
          id: `${id}:nested:${index}`,
          type: 'list',
          ordered,
          items: [],
        };
        // At most one new level per item; do not fabricate empty parent items.
        const parentBlocks = parent.blocks as ZhihuBlock[];
        parentBlocks.push(nested);
        stack.push(nested);
      }
    }
    const itemId = `${id}:item:${index}`;
    stack[stack.length - 1].items.push({
      id: itemId,
      blocks: [
        {
          id: `${itemId}:paragraph`,
          type: 'paragraph',
          children: getStructuredContentTextRuns(
            item,
            `${itemId}:runs`,
            resources,
          ),
        },
      ],
    });
  }
  return root;
}

/** Convert observed JSON blocks straight to the semantic model. */
export function normalizeZhihuStructuredContent(
  content: ZhihuStructuredContent,
  options: ZhihuStructuredContentNormalizationOptions = {},
): ZhihuDocument {
  const parsed = parseZhihuStructuredContent(content);
  const paragraphIds = uniqueParagraphIds(parsed);
  const documentId = options.documentId ?? 'structured-content';
  const blocks: ZhihuBlock[] = parsed.segments.map((segment, index) => {
    // Position disambiguates duplicate source IDs without losing their identity.
    const id = `${documentId}:segment:${index}:${segment.id}`;
    switch (segment.type) {
      case 'paragraph': {
        const paragraphId = paragraphIds.has(segment.paragraph.pid)
          ? segment.paragraph.pid
          : undefined;
        return {
          id,
          type: 'paragraph',
          ...(paragraphId && { paragraphId }),
          children: getStructuredContentTextRuns(
            segment.paragraph,
            `${id}:runs`,
            options.resources,
            paragraphId,
          ),
        };
      }
      case 'heading':
        return {
          id,
          type: 'heading',
          level: segment.heading.level as ZhihuHeadingBlock['level'],
          children: getStructuredContentTextRuns(
            segment.heading,
            `${id}:runs`,
            options.resources,
          ),
        };
      case 'list_node':
        return listBlock(segment, id, options.resources);
      case 'card': {
        const url = getSafeRichContentUrl(segment.card.url);
        if (!url) {
          return {
            id,
            type: 'unsupported',
            sourceType: 'structuredCard',
            fallbackText: segment.card.title,
          };
        }
        const image = imageResource(
          [segment.card.cover],
          0,
          0,
          options.resources,
        );
        return {
          id,
          type: 'linkCard',
          title: segment.card.title,
          url,
          ...(image && { image }),
        };
      }
      case 'image': {
        const source = segment.image;
        const token =
          (options.removeImageWatermark ?? true) &&
          isZhihuImageId(source.original_token)
            ? source.original_token
            : undefined;
        const unwatermarked = (urls: readonly string[]) =>
          token ? urls.map((url) => withOriginalImageId(url, token)) : urls;
        const resource = imageResource(
          [
            ...unwatermarked(source.urls),
            ...unwatermarked(source.original_urls),
          ],
          source.width,
          source.height,
          options.resources,
        );
        if (!resource) {
          return {
            id,
            type: 'unsupported',
            sourceType: 'structuredImage',
            fallbackText: source.description || '图片资源不可用',
          };
        }
        const originalUrl = unwatermarked(source.original_urls)
          .map((url) => getSafeRichContentUrl(url, true))
          .find((url) => url !== undefined);
        return {
          id,
          type: 'image',
          layout: source.layout,
          resource: { ...resource, ...(originalUrl && { originalUrl }) },
          alt: source.description,
          ...(source.description && {
            caption: [
              { id: `${id}:caption`, type: 'text', text: source.description },
            ],
          }),
        };
      }
      case 'hr':
        return { id, type: 'divider' };
      case 'unsupported':
        return {
          id,
          type: 'unsupported',
          sourceType: segment.sourceType,
          fallbackText: segment.fallbackText,
        };
    }
    throw new Error(INVALID_CONTENT);
  });
  return { id: documentId, blocks };
}
