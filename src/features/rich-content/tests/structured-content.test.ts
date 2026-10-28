import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ZhihuStructuredContent,
  ZhihuStructuredContentMark,
  ZhihuStructuredContentParagraphSegment,
  ZhihuStructuredContentSegment,
} from '@/types/zhihu';
import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuImageResource,
} from '../document';
import { serializeZhihuDocumentHtml } from '../documentHtml';
import { walkZhihuDocument } from '../documentTraversal';
import { resolveNativeAnswerSegment } from '../nativeInteractions';
import {
  getStructuredContentSegmentInfos,
  getStructuredContentTextRuns,
  normalizeZhihuStructuredContent,
  parseStructuredContentPaging,
  parseZhihuStructuredContent,
  type ZhihuStructuredContentInlineRun,
} from '../structuredContent';

const IMAGE_URL = 'https://example.invalid/body.png';
const FORMULA_URL = 'https://example.invalid/formula.png';
const LOCAL_IMAGE = 'data:image/png;base64,AA==';
const PAGING =
  '{ "is_end": true, "is_start": true, "next": "", "previous": "", "totals": 0 }';

function paragraph(
  text: string,
  marks: ZhihuStructuredContentMark[] = [],
  id = 'source-id',
): ZhihuStructuredContentParagraphSegment {
  return {
    id,
    type: 'paragraph',
    paragraph: { pid: 'source-business-pid', text, marks },
  };
}

function content(
  segments: ZhihuStructuredContentSegment[],
): ZhihuStructuredContent {
  return { paging: PAGING, segments };
}

function compile(document: ZhihuDocument) {
  return compileZhihuDocument(document, { fontSize: 17, lineHeight: 26 });
}

function flow(document: ZhihuDocument) {
  const part = compile(document).parts.find((part) => part.type === 'flow');
  if (part?.type !== 'flow') throw new Error('Expected synthetic text flow');
  return part.flow;
}

function listDepth(blocks: readonly ZhihuBlock[], depth = 0): number {
  return Math.max(
    depth,
    ...blocks.map((block) =>
      block.type === 'list'
        ? Math.max(
            depth + 1,
            ...block.items.map((item) => listDepth(item.blocks, depth + 1)),
          )
        : depth,
    ),
  );
}

function canonicalJson(value: unknown): string {
  const ordered = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(ordered);
    if (!entry || typeof entry !== 'object') return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, ordered(child)]),
    );
  };
  return JSON.stringify(ordered(value));
}

function isPublicCapturedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'zhimg.com' || url.hostname.endsWith('.zhimg.com')) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      [...url.searchParams.keys()].every(
        (key) => key === 'source' || key === 'needBackground',
      )
    );
  } catch {
    return false;
  }
}

function imageSegment(): Extract<
  ZhihuStructuredContentSegment,
  { type: 'image' }
> {
  return {
    id: 'image-id',
    type: 'image',
    image: {
      description: '合成图片',
      height: 20,
      width: 30,
      is_gif: false,
      layout: 'small',
      original_token: 'synthetic-original',
      original_urls: [IMAGE_URL],
      status: 'normal',
      token: 'synthetic-image',
      urls: [IMAGE_URL],
    },
  };
}

function formulaMark(): Extract<
  ZhihuStructuredContentMark,
  { type: 'formula' }
> {
  return {
    type: 'formula',
    start_index: 1,
    end_index: 5,
    formula: {
      content: 'E = mc^2',
      height: 20,
      width: 30,
      img_url: FORMULA_URL,
      url: 'https://example.invalid/source',
    },
  };
}

function reactionMark(
  start_index: number,
  end_index: number,
): Extract<ZhihuStructuredContentMark, { type: 'seg_like' }> {
  return {
    type: 'seg_like',
    start_index,
    end_index,
    seg_like: {
      count: 3,
      comment_count: 2,
      my_comment_count: 1,
      is_like: false,
      is_span: false,
      seg_ids: ['200', '201'],
    },
  };
}

test('converts all five JSON nodes directly without modifying the source or paging string', () => {
  const source = content([
    paragraph('正文'),
    {
      id: 'heading-id',
      type: 'heading',
      heading: { text: '标题', level: 2, marks: [] },
    },
    {
      id: 'list-id',
      type: 'list_node',
      list_node: {
        type: 'unordered',
        items: [{ text: '列表', indent_level: 1, marks: [] }],
      },
    },
    imageSegment(),
    { id: 'divider-id', type: 'hr' },
  ]);
  const original = JSON.stringify(source);
  const document = normalizeZhihuStructuredContent(source, {
    documentId: 'test-document',
  });
  expect(document.blocks.map((block) => block.type)).toEqual([
    'paragraph',
    'heading',
    'list',
    'image',
    'divider',
  ]);
  expect(document.blocks[0].id).toContain('source-id');
  expect(document.blocks[0]).toHaveProperty(
    'paragraphId',
    'source-business-pid',
  );
  expect(document.blocks[1]).not.toHaveProperty('paragraphId');
  expect(document.blocks[2]).not.toHaveProperty('paragraphId');
  expect(JSON.stringify(source)).toBe(original);
  expect(parseZhihuStructuredContent(source).paging).toBe(PAGING);
  expect(parseStructuredContentPaging(PAGING).is_end).toBe(true);
});

test('ordered JSON lists and body cards retain safe shared semantics while optional metadata cannot reject prose', () => {
  const safeUrl = 'https://www.zhihu.com/question/1001/answer/1002';
  const title = '<script>literal</script> & 合成卡片';
  const source = {
    paging: PAGING,
    segments: [
      paragraph('前文'),
      {
        id: 'ordered-list',
        type: 'list_node',
        list_node: {
          type: 'ordered',
          items: [
            { text: '首项', indent_level: 1, marks: [] },
            { text: '嵌套项', indent_level: 2, marks: [] },
            { text: '次项', indent_level: 1, marks: [] },
          ],
        },
      },
      {
        id: 'card-safe',
        type: 'card',
        card: {
          title,
          url: safeUrl,
          cover: IMAGE_URL,
          extra_info: { unobserved: ['not display metadata'] },
          id: null,
        },
      },
      {
        id: 'card-unsafe',
        type: 'card',
        card: { title: '保留卡片文字', url: 'javascript:alert(1)' },
      },
      {
        id: 'card-missing-title',
        type: 'card',
        card: { url: safeUrl, cover: 'file:///untrusted/cover.png' },
      },
      { id: 'card-missing-payload', type: 'card' },
      paragraph('后文', [], 'last-source'),
    ],
  };
  const original = JSON.stringify(source);
  const parsed = parseZhihuStructuredContent(source);
  const document = normalizeZhihuStructuredContent(parsed);
  const lists = [...walkZhihuDocument(document)].filter(
    (node) => node.type === 'list',
  );
  expect(lists).toHaveLength(2);
  expect(lists.every((node) => node.ordered)).toBe(true);
  expect(document.blocks[2]).toMatchObject({
    type: 'linkCard',
    title,
    url: safeUrl,
    image: { mediaType: 'image', url: IMAGE_URL },
  });
  expect(document.blocks[3]).toMatchObject({
    type: 'unsupported',
    sourceType: 'structuredCard',
    fallbackText: '保留卡片文字',
  });
  expect(document.blocks[4]).toMatchObject({
    type: 'linkCard',
    title: '链接卡片',
    url: safeUrl,
  });
  expect(document.blocks[4]).not.toHaveProperty('image');
  expect(document.blocks[5]).toMatchObject({
    type: 'unsupported',
    fallbackText: '链接卡片',
  });
  const compiled = compile(document);
  expect(
    compiled.parts
      .filter((part) => part.type === 'block')
      .map((part) => part.block.type),
  ).toEqual(['linkCard', 'unsupported', 'linkCard', 'unsupported']);
  const prose = compiled.parts
    .flatMap((part) => (part.type === 'flow' ? [part.flow.text] : []))
    .join('\n');
  for (const text of ['前文', '1. 首项', '1. 嵌套项', '2. 次项', '后文'])
    expect(prose).toContain(text);
  const html = serializeZhihuDocumentHtml(document);
  expect(html.match(/<ol>/g)).toHaveLength(2);
  expect(html).toContain('class="zhihu-link-card"');
  expect(html).toContain(
    'href="https://www.zhihu.com/question/1001/answer/1002"',
  );
  expect(html).toContain('&lt;script&gt;literal&lt;/script&gt; &amp; 合成卡片');
  expect(html).not.toMatch(
    /<script>|javascript:|file:\/\/\/|extra_info|not display metadata/,
  );
  expect(JSON.stringify(source)).toBe(original);
});

test('retains raw markup-looking text and entities instead of HTML escaping, parsing or decoding them', () => {
  const text = '<b>原文</b> &amp; "引号" <script>literal</script>\n下一行';
  const document = normalizeZhihuStructuredContent(content([paragraph(text)]));
  expect(flow(document).text).toBe(text);
  const nodes = [...walkZhihuDocument(document)];
  expect(nodes.filter((node) => node.type === 'text')).toHaveLength(1);
  expect(nodes.some((node) => node.type === 'strong')).toBe(false);
});

test('endpoint scanning keeps crossed bold/link ranges as nested semantic runs and native spans', () => {
  const source = content([
    paragraph('abcdef', [
      { type: 'bold', start_index: 0, end_index: 4 },
      {
        type: 'link',
        start_index: 2,
        end_index: 6,
        link: {
          href: 'https://example.invalid/link',
          icon_name: '',
          link_type: 'text',
        },
      },
    ]),
  ]);
  const document = normalizeZhihuStructuredContent(source);
  const compiled = flow(document);
  expect(compiled.text).toBe('abcdef');
  expect(
    compiled.spans
      .filter((span) => span.kind === 'strong')
      .map(({ start, end }) => [start, end]),
  ).toEqual([
    [0, 2],
    [2, 4],
  ]);
  expect(
    compiled.spans
      .filter((span) => span.kind === 'link')
      .map(({ start, end }) => [start, end]),
  ).toEqual([
    [2, 4],
    [4, 6],
  ]);
  const strong = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'strong',
  ) as ZhihuStructuredContentInlineRun | undefined;
  expect(strong?.range).toEqual({ start: 0, end: 4 });
});

test('preserves mention and entity-word link meanings while bold still overlaps the entity', () => {
  const source = content([
    paragraph('甲乙丙', [
      { type: 'bold', start_index: 0, end_index: 2 },
      {
        type: 'entity_word',
        start_index: 1,
        end_index: 2,
        entity_word: {
          id: 'entity-id',
          type: 'search',
          attach_info_bytes: 'opaque',
          url: 'https://example.invalid/search',
          word: '乙',
        },
      },
      {
        type: 'link',
        start_index: 2,
        end_index: 3,
        link: {
          href: 'zhihu://people/test',
          icon_name: '',
          link_type: 'member_mention',
        },
      },
    ]),
  ]);
  const document = normalizeZhihuStructuredContent(source);
  expect(flow(document).text).toBe('甲乙丙');
  const links = [...walkZhihuDocument(document)].filter(
    (node) => node.type === 'link',
  );
  expect(links.map((node) => node.kind)).toEqual(['link', 'memberMention']);
  expect(
    flow(document).spans.filter((span) => span.kind === 'strong'),
  ).toHaveLength(2);
});

test('consumes formula placeholders as atomic inlineFormula attachments with exact source latex', () => {
  const marks: ZhihuStructuredContentMark[] = [
    formulaMark(),
    { type: 'bold', start_index: 0, end_index: 6 },
  ];
  const document = normalizeZhihuStructuredContent(
    content([paragraph('甲[公式]乙', marks)]),
  );
  const compiled = flow(document);
  expect(compiled.text).toBe('甲\uFFFC乙');
  expect(compiled.attachments).toHaveLength(1);
  expect(compiled.attachments[0]).toMatchObject({
    kind: 'formula',
    start: 1,
    end: 2,
    latex: 'E = mc^2',
    copyText: 'E = mc^2',
  });
  // Model the formula image URL; its separate source-page URL is not an image.
  expect(compiled.attachments[0].url).toBe(FORMULA_URL);
  expect(compiled.attachments[0].url).not.toBe(formulaMark().formula.url);
  const formula = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'inlineFormula',
  ) as ZhihuStructuredContentInlineRun | undefined;
  expect(formula?.range).toEqual({ start: 1, end: 5 });
});

test('an unsafe formula image never falls back to the otherwise safe source-page URL', () => {
  const mark = formulaMark();
  mark.formula.img_url = 'javascript:alert(1)';
  mark.formula.url = 'https://www.zhihu.com/question/test/answer/test';
  const document = normalizeZhihuStructuredContent(
    content([paragraph('甲[公式]乙', [mark])]),
  );
  const attachment = flow(document).attachments[0];
  expect(attachment.latex).toBe('E = mc^2');
  expect(attachment.url).toBeUndefined();
});

test('uses verified UTF-16 ranges for non-BMP text and adjacent formula placeholders', () => {
  const payload = {
    text: '😀[公式]乙',
    marks: [{ ...formulaMark(), start_index: 2, end_index: 6 }],
  };
  const runs = getStructuredContentTextRuns(payload, 'non-bmp');
  expect(runs).toHaveLength(3);
  expect(runs[0]).toMatchObject({ type: 'text', text: '😀' });
  expect(runs[1]).toMatchObject({ type: 'inlineFormula' });
  const document = normalizeZhihuStructuredContent(
    content([paragraph(payload.text, payload.marks)]),
  );
  expect(flow(document).attachments).toHaveLength(1);
  expect(flow(document).text).toBe('😀\uFFFC乙');
});

test.each([
  'javascript:alert(1)',
  'https://synthetic-user:synthetic-pass@example.invalid/link',
  'https://link.zhihu.com/?target=javascript%3Aalert(1)',
])('unsafe links keep visible text without a clickable URL', (href) => {
  const document = normalizeZhihuStructuredContent(
    content([
      paragraph('原文字', [
        {
          type: 'link',
          start_index: 0,
          end_index: 3,
          link: { href, icon_name: '', link_type: 'text' },
        },
      ]),
    ]),
  );
  expect(flow(document).text).toBe('原文字');
  expect(
    [...walkZhihuDocument(document)].some((node) => node.type === 'link'),
  ).toBe(false);
});

test('unsafe image resources produce a visible unsupported fallback', () => {
  const segment = imageSegment();
  segment.image.urls = ['javascript:alert(1)'];
  segment.image.original_urls = ['file:///untrusted/source.png'];
  const document = normalizeZhihuStructuredContent(content([segment]));
  expect(document.blocks[0]).toMatchObject({
    type: 'unsupported',
    sourceType: 'structuredImage',
    fallbackText: '合成图片',
  });
});

test('only an explicit trusted resource map can add local image/formula URIs', () => {
  const resources: Readonly<Record<string, ZhihuImageResource>> = {
    [IMAGE_URL]: {
      mediaType: 'image',
      url: IMAGE_URL,
      offlineUri: LOCAL_IMAGE,
      width: 5,
      height: 6,
    },
    [FORMULA_URL]: {
      mediaType: 'image',
      url: FORMULA_URL,
      offlineUri: LOCAL_IMAGE,
    },
  };
  const source = content([
    paragraph('甲[公式]乙', [formulaMark()]),
    imageSegment(),
  ]);
  const document = normalizeZhihuStructuredContent(source, { resources });
  const image = document.blocks[1];
  if (image.type !== 'image') throw new Error('Expected synthetic image');
  expect(image.resource).toMatchObject({
    url: IMAGE_URL,
    offlineUri: LOCAL_IMAGE,
    width: 30,
    height: 20,
  });
  expect(image.layout).toBe('small');
  const formula = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'inlineFormula',
  );
  if (formula?.type !== 'inlineFormula')
    throw new Error('Expected synthetic formula');
  expect(formula.formula.image?.offlineUri).toBe(LOCAL_IMAGE);
  expect(normalizeZhihuStructuredContent(source).blocks[1]).not.toHaveProperty(
    'resource.offlineUri',
  );
});

test('resource selection prefers an explicitly mapped local original over an unmapped thumbnail', () => {
  const image = imageSegment();
  image.image.urls = ['https://example.invalid/thumbnail.png'];
  const document = normalizeZhihuStructuredContent(content([image]), {
    resources: {
      [IMAGE_URL]: {
        mediaType: 'image',
        url: IMAGE_URL,
        offlineUri: LOCAL_IMAGE,
      },
    },
  });
  const block = document.blocks[0];
  if (block.type !== 'image') throw new Error('Expected synthetic image');
  expect(block.resource.url).toBe(IMAGE_URL);
  expect(block.resource.offlineUri).toBe(LOCAL_IMAGE);
});

test('explicit test resources accept safe Metro asset URLs while retaining source image dimensions', () => {
  const metroUri =
    'http://localhost:8081/assets/test.png?platform=android&hash=synthetic';
  const document = normalizeZhihuStructuredContent(content([imageSegment()]), {
    resources: {
      [IMAGE_URL]: {
        mediaType: 'image',
        url: IMAGE_URL,
        offlineUri: metroUri,
        width: 1024,
        height: 1024,
      },
    },
  });
  const image = document.blocks[0];
  if (image.type !== 'image') throw new Error('Expected synthetic image');
  expect(image.resource).toMatchObject({
    offlineUri: metroUri,
    width: 30,
    height: 20,
  });
  expect(image.layout).toBe('small');
});

test('trusted resource dimensions fill only missing source sizes and unsafe resource URIs remain unusable', () => {
  const image = imageSegment();
  image.image.width = 0;
  image.image.height = 0;
  const document = normalizeZhihuStructuredContent(content([image]), {
    resources: {
      [IMAGE_URL]: {
        mediaType: 'image',
        url: IMAGE_URL,
        offlineUri:
          'https://synthetic-user:synthetic-pass@example.invalid/asset',
        width: 5,
        height: 6,
      },
    },
  });
  const block = document.blocks[0];
  if (block.type !== 'image') throw new Error('Expected synthetic image');
  expect(block.resource).toMatchObject({ width: 5, height: 6 });
  expect(block.resource.offlineUri).toBeUndefined();
});

test('original JSON cannot smuggle an offline URI into trusted model resources', () => {
  const source = content([imageSegment()]);
  Object.assign(source.segments[0], {
    offlineUri: 'file:///untrusted/source.png',
  });
  Object.assign((source.segments[0] as ReturnType<typeof imageSegment>).image, {
    offlineUri: 'file:///untrusted/source.png',
  });
  const document = normalizeZhihuStructuredContent(source);
  expect(document.blocks[0]).not.toHaveProperty('resource.offlineUri');
});

test('duplicates get deterministic unique model IDs without creating paragraph business identities', () => {
  const source = content([paragraph('第一段'), paragraph('第二段')]);
  const document = normalizeZhihuStructuredContent(source, {
    documentId: 'stable-document',
  });
  expect(
    normalizeZhihuStructuredContent(source, { documentId: 'stable-document' }),
  ).toEqual(document);
  const nodes = [...walkZhihuDocument(document)];
  expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  expect(nodes.every((node) => !Object.hasOwn(node, 'paragraphId'))).toBe(true);
  expect(
    flow(document).sourceMap.every((entry) => entry.paragraphId === undefined),
  ).toBe(true);
  // Collapsing slices the already normalized document instead of regenerating IDs.
  const collapsed = { ...document, blocks: document.blocks.slice(0, 1) };
  expect(collapsed.blocks[0].id).toBe(document.blocks[0].id);
});

test('list indentation is bounded while every source item remains visible', () => {
  const list: Extract<ZhihuStructuredContentSegment, { type: 'list_node' }> = {
    id: 'deep-list',
    type: 'list_node',
    list_node: {
      type: 'unordered',
      items: Array.from({ length: 12 }, (_, index) => ({
        text: `条目${index}`,
        indent_level: index === 0 ? 1 : 1000000,
        marks: [],
      })),
    },
  };
  const document = normalizeZhihuStructuredContent(content([list]));
  const compiled = flow(document);
  for (let index = 0; index < 12; index += 1)
    expect(compiled.text).toContain(`条目${index}`);
  expect(listDepth(document.blocks)).toBeLessThanOrEqual(6);
});

test.each([
  { id: 'unknown', type: 'unobserved-video' },
  {
    id: 'missing-text',
    type: 'paragraph',
    paragraph: { pid: 'source', marks: [] },
  },
])(
  'rejects missing body structure with a fixed error that does not include source content',
  (segment) => {
    expect(() =>
      parseZhihuStructuredContent({ paging: PAGING, segments: [segment] }),
    ).toThrow('原生正文返回结构无效');
  },
);

test('invalid formula ranges preserve visible placeholder text rather than dropping source text', () => {
  const mark = formulaMark();
  mark.start_index = 0;
  mark.end_index = 1;
  const document = normalizeZhihuStructuredContent(
    content([paragraph('甲[公式]乙', [mark])]),
  );
  expect(flow(document).text).toBe('甲[公式]乙');
  expect(
    [...walkZhihuDocument(document)].some(
      (node) => node.type === 'unsupported',
    ),
  ).toBe(true);
});

test('all five sanitized capture cases preserve 48 source segments and 99 marks through direct model compilation', () => {
  const segmentCounts = new Map<string, number>();
  const markCounts = new Map<string, number>();
  let sourceFormulaCount = 0;
  let compiledFormulaCount = 0;
  const caseIds = Array.from({ length: 5 }, (_, index) => `answer-${index}`);
  for (const caseId of caseIds) {
    const value: unknown = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          `../fixtures/inbox/structured-content/capture-derived/${caseId}.json`,
        ),
        'utf8',
      ),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('pages' in value) ||
      !Array.isArray(value.pages)
    ) {
      throw new Error('Invalid captured-case envelope');
    }
    for (const [index, page] of value.pages.entries()) {
      const original = JSON.stringify(page);
      const parsed = parseZhihuStructuredContent(page);
      const document = normalizeZhihuStructuredContent(parsed, {
        documentId: `capture:${caseId}:page:${index}`,
      });
      expect(document.blocks.length).toBe(parsed.segments.length);
      // Compare as booleans so a failure never prints original captured prose.
      expect(JSON.stringify(page) === original).toBe(true);
      expect(parsed.paging === (page as { paging: unknown }).paging).toBe(true);
      expect(
        canonicalJson(parsed.segments) ===
          canonicalJson((page as { segments: unknown }).segments),
      ).toBe(true);
      const nodes = [...walkZhihuDocument(document)];
      expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
      const paragraphIds = new Set(
        parsed.segments.flatMap((segment) =>
          segment.type === 'paragraph' ? [segment.paragraph.pid] : [],
        ),
      );
      expect(
        nodes.every(
          (node) =>
            !('paragraphId' in node) ||
            (node.type === 'paragraph' &&
              paragraphIds.has(node.paragraphId ?? '')),
        ),
      ).toBe(true);
      for (const segment of parsed.segments) {
        segmentCounts.set(
          segment.type,
          (segmentCounts.get(segment.type) ?? 0) + 1,
        );
        if (segment.type === 'image') {
          expect(
            [...segment.image.urls, ...segment.image.original_urls].every(
              isPublicCapturedImageUrl,
            ),
          ).toBe(true);
        }
        const payloads =
          segment.type === 'paragraph'
            ? [segment.paragraph]
            : segment.type === 'heading'
              ? [segment.heading]
              : segment.type === 'list_node'
                ? segment.list_node.items
                : [];
        for (const payload of payloads) {
          for (const mark of payload.marks) {
            markCounts.set(mark.type, (markCounts.get(mark.type) ?? 0) + 1);
            if (mark.type === 'formula') {
              sourceFormulaCount += 1;
              expect(isPublicCapturedImageUrl(mark.formula.img_url)).toBe(true);
            }
          }
        }
      }
      for (const part of compile(document).parts) {
        if (part.type !== 'flow') continue;
        compiledFormulaCount += part.flow.attachments.filter(
          (attachment) => attachment.kind === 'formula',
        ).length;
        expect(
          part.flow.sourceMap.every(
            (range) =>
              range.paragraphId === undefined ||
              paragraphIds.has(range.paragraphId),
          ),
        ).toBe(true);
      }
    }
  }
  expect([...segmentCounts.keys()].sort()).toEqual([
    'heading',
    'hr',
    'image',
    'list_node',
    'paragraph',
  ]);
  expect([...markCounts.keys()].sort()).toEqual([
    'bold',
    'entity_word',
    'formula',
    'link',
  ]);
  expect(
    [...segmentCounts.values()].reduce((sum, count) => sum + count, 0),
  ).toBe(48);
  expect([...markCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(
    99,
  );
  expect(sourceFormulaCount).toBe(53);
  expect(compiledFormulaCount).toBe(sourceFormulaCount);
});

test('preserves captured UTF-16 paragraph identities and resolves complete reactions through crossed visual styles', () => {
  const fixture: unknown = JSON.parse(
    readFileSync(
      resolve(__dirname, '../fixtures/cases/next-render-seg-like-001.json'),
      'utf8',
    ),
  );
  if (
    !fixture ||
    typeof fixture !== 'object' ||
    !('data' in fixture) ||
    !Array.isArray(fixture.data)
  )
    throw new Error('Invalid captured answer fixture');
  let reactionCount = 0;
  for (const answer of fixture.data) {
    if (
      !answer ||
      typeof answer !== 'object' ||
      !('structured_content' in answer)
    )
      throw new Error('Invalid captured answer');
    const parsed = parseZhihuStructuredContent(answer.structured_content);
    const document = normalizeZhihuStructuredContent(parsed);
    const infos = getStructuredContentSegmentInfos(parsed);
    reactionCount += infos.reduce(
      (count, info) => count + info.marks.length,
      0,
    );
    for (const segment of parsed.segments) {
      if (segment.type !== 'paragraph') continue;
      expect(document.blocks).toContainEqual(
        expect.objectContaining({ paragraphId: segment.paragraph.pid }),
      );
      for (const mark of segment.paragraph.marks) {
        if (mark.type !== 'seg_like') continue;
        const info = infos.find((entry) => entry.pid === segment.paragraph.pid);
        expect(info?.text).toBe(segment.paragraph.text);
        expect(info?.marks).toContainEqual({
          start_index: mark.start_index,
          end_index: mark.end_index,
          seg_info: {
            like_count: mark.seg_like.count,
            comment_count: mark.seg_like.comment_count,
            my_comment_count: mark.seg_like.my_comment_count,
            is_like: mark.seg_like.is_like,
            is_span: mark.seg_like.is_span,
            seg_ids: mark.seg_like.seg_ids,
          },
        });
      }
    }
  }
  expect(reactionCount).toBe(4);
  const firstAnswer = fixture.data[0] as { structured_content: unknown };
  const captured = normalizeZhihuStructuredContent(
    parseZhihuStructuredContent(firstAnswer.structured_content),
  );
  expect(mapRichTextSelection(flow(captured), 0, 44)).toMatchObject({
    start: { paragraphId: 'synthetic-paragraph-001-001', offset: 0 },
    end: { paragraphId: 'synthetic-paragraph-001-001', offset: 44 },
  });

  const text = '甲😀乙丙丁末';
  const source = content([
    paragraph(text, [
      reactionMark(0, 6),
      { type: 'bold', start_index: 1, end_index: 4 },
      {
        type: 'link',
        start_index: 3,
        end_index: 7,
        link: {
          href: 'https://example.invalid/linked-source',
          icon_name: '',
          link_type: 'text',
        },
      },
    ]),
  ]);
  const document = normalizeZhihuStructuredContent(source);
  const nodes = [...walkZhihuDocument(document)];
  const segments = nodes.filter((node) => node.type === 'segment');
  expect(segments).toHaveLength(1);
  const segment = segments[0];
  expect(segment.range).toEqual({ start: 0, end: 6 });
  expect(nodes.some((node) => node.type === 'strong')).toBe(true);
  expect(nodes.some((node) => node.type === 'link')).toBe(true);
  expect(flow(document).text).toBe(text);
  expect(
    resolveNativeAnswerSegment(
      {
        nodeId: segment.id,
        paragraphId: segment.paragraphId,
        start: 0,
        end: 6,
        text: text.slice(0, 6),
        segment,
      },
      {
        objectId: '42',
        type: 'answer',
        document,
        segmentInfos: getStructuredContentSegmentInfos(source),
      },
    ),
  ).toMatchObject({
    pid: 'source-business-pid',
    interaction: { like_count: 3, comment_count: 2, seg_ids: ['200', '201'] },
  });
});

test('keeps prose through bad annotations and textual unknown blocks without enabling ambiguous reactions', () => {
  const parsed = parseZhihuStructuredContent({
    paging: PAGING,
    segments: [
      {
        id: 'source',
        type: 'paragraph',
        paragraph: {
          pid: 'source-pid',
          text: '甲😀乙',
          marks: [
            null,
            { type: 'future-mark', start_index: 0, end_index: 4 },
            { type: 'bold', start_index: 1, end_index: 2 },
            { type: 'bold', start_index: 0, end_index: 9 },
            { type: 'link', start_index: 0, end_index: 4 },
            { ...reactionMark(0, 4), seg_like: { count: 'invalid' } },
            { type: 'bold', start_index: 0, end_index: 4 },
          ],
        },
      },
      {
        id: 'future-block',
        type: 'future-node',
        'future-node': { text: '额外原文' },
      },
    ],
  });
  const document = normalizeZhihuStructuredContent(parsed);
  expect(flow(document).text).toBe('甲😀乙');
  expect(parsed.segments[0]).toHaveProperty('paragraph.marks', [
    { type: 'bold', start_index: 0, end_index: 4 },
  ]);
  expect(document.blocks[1]).toMatchObject({
    type: 'unsupported',
    sourceType: 'future-node',
    fallbackText: '额外原文',
  });

  const span = reactionMark(0, 3);
  span.seg_like.is_span = true;
  const ambiguous = [
    content([paragraph('甲乙丙', [span])]),
    content([paragraph('甲乙丙', [reactionMark(0, 2), reactionMark(1, 3)])]),
    content([
      paragraph('甲乙丙', [reactionMark(0, 3)], 'duplicate-one'),
      paragraph('丁戊己', [reactionMark(0, 3)], 'duplicate-two'),
    ]),
    content([paragraph('甲[公式]乙', [formulaMark(), reactionMark(0, 1)])]),
  ];
  for (const source of ambiguous)
    expect(getStructuredContentSegmentInfos(source)).toEqual([]);
  const spanDocument = normalizeZhihuStructuredContent(ambiguous[0]);
  const spanRun = [...walkZhihuDocument(spanDocument)].find(
    (node) => node.type === 'segment',
  );
  expect(spanRun?.segInfo).toMatchObject({ is_span: true });
  expect(
    [...walkZhihuDocument(normalizeZhihuStructuredContent(ambiguous[1]))].some(
      (node) => node.type === 'segment',
    ),
  ).toBe(false);
  expect(
    normalizeZhihuStructuredContent(ambiguous[2]).blocks.every(
      (block) => !('paragraphId' in block),
    ),
  ).toBe(true);
  const formulaDocument = normalizeZhihuStructuredContent(ambiguous[3]);
  expect(
    [...walkZhihuDocument(formulaDocument)].some(
      (node) => node.type === 'segment',
    ),
  ).toBe(false);
  const formulaFlow = flow(formulaDocument);
  expect(formulaFlow.text).toBe('甲\uFFFC乙');
  expect(formulaFlow.attachments).toEqual([
    expect.objectContaining({
      kind: 'formula',
      start: 1,
      end: 2,
      latex: 'E = mc^2',
      copyText: 'E = mc^2',
      url: FORMULA_URL,
    }),
  ]);
});

test('loads the watermark-free upload of images unless the reader opts out', () => {
  const watermarked = 'v2-00000000000000000000000000000000';
  const token = 'v2-11111111111111111111111111111111';
  const source = content([
    {
      ...imageSegment(),
      image: {
        ...imageSegment().image,
        original_token: token,
        urls: [`https://pic1.zhimg.com/${watermarked}_720w.jpg`],
        original_urls: [`https://pic1.zhimg.com/${watermarked}_r.jpg`],
      },
    },
  ]);
  const imageOf = (removeImageWatermark?: boolean) => {
    const [block] = normalizeZhihuStructuredContent(source, {
      removeImageWatermark,
    }).blocks;
    if (block?.type !== 'image') throw new Error('expected an image block');
    return { url: block.resource.url, originalUrl: block.resource.originalUrl };
  };

  expect(imageOf()).toEqual({
    url: `https://pic1.zhimg.com/${token}_720w.jpg`,
    originalUrl: `https://pic1.zhimg.com/${token}_r.jpg`,
  });
  expect(imageOf(false)).toEqual({
    url: `https://pic1.zhimg.com/${watermarked}_720w.jpg`,
    originalUrl: `https://pic1.zhimg.com/${watermarked}_r.jpg`,
  });
});

test('a watermark-free URL keeps the local resource mapped to its source URL', () => {
  const watermarked = 'v2-00000000000000000000000000000000';
  const token = 'v2-11111111111111111111111111111111';
  const sourceUrl = `https://pic1.zhimg.com/${watermarked}_720w.jpg`;
  const source = content([
    {
      ...imageSegment(),
      image: {
        ...imageSegment().image,
        original_token: token,
        urls: [sourceUrl],
        original_urls: [],
      },
    },
  ]);
  const resources: Readonly<Record<string, ZhihuImageResource>> = {
    [sourceUrl]: {
      mediaType: 'image',
      url: sourceUrl,
      offlineUri: LOCAL_IMAGE,
    },
  };
  const [block] = normalizeZhihuStructuredContent(source, { resources }).blocks;
  if (block?.type !== 'image') throw new Error('expected an image block');
  expect(block.resource).toMatchObject({
    url: `https://pic1.zhimg.com/${token}_720w.jpg`,
    offlineUri: LOCAL_IMAGE,
  });
});
