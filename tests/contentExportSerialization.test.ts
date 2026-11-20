import { DomUtils, parseDocument } from 'htmlparser2';
import type {
  ZhihuBlock,
  ZhihuInlineRun,
  ZhihuTableBlock,
} from '@/features/rich-content';
import {
  getSafeExportImageUrl,
  getSafeExportUrl,
} from '../src/features/content-export/safeUrl';
import {
  serializeExportHtml,
  serializeExportMarkdown,
} from '../src/features/content-export/serializers';
import type { ExportSource } from '../src/features/content-export/types';
import { normalizeZhihuDocument } from '../src/features/rich-content/normalization/normalizeZhihuDocument';

jest.mock('../src/features/rich-content', () => ({
  ...jest.requireActual('../src/features/rich-content/presentation'),
  ...jest.requireActual('../src/features/rich-content/exportResources'),
}));

const options = { includeImages: true, allowRemoteImages: false };
const imageUrl = 'https://pic.example.com/content.jpg';
const imageResource = { mediaType: 'image' as const, url: imageUrl };
const text = (value: string): ZhihuInlineRun => ({
  id: `text-${value}`,
  type: 'text',
  text: value,
});
const paragraph = (value: string): ZhihuBlock => ({
  id: `p-${value}`,
  type: 'paragraph',
  children: [text(value)],
});
function source(blocks: readonly ZhihuBlock[]): ExportSource {
  return {
    target: { type: 'answer', id: '42', sessionVersion: 1 },
    title: '导出示例',
    author: '作者示例',
    publishedAt: '2026-10-13',
    sourceUrl:
      'https://www.zhihu.com/question/7/answer/42?utm_source=export#detail',
    completeness: 'complete',
    warnings: [],
    document: { id: 'doc', blocks },
  };
}
function main(html: string): string {
  return html.slice(html.indexOf('<body>'));
}
function table(merged = false): ZhihuTableBlock {
  return {
    id: 'table',
    type: 'table',
    caption: [text('表格示例')],
    head: [
      {
        id: 'head',
        cells: [
          { id: 'h1', isHeader: true, blocks: [paragraph('项目')] },
          { id: 'h2', isHeader: true, blocks: [paragraph('值')] },
        ],
      },
    ],
    body: [
      {
        id: 'row',
        cells: merged
          ? [
              {
                id: 'merged',
                isHeader: false,
                colSpan: 2,
                blocks: [paragraph('合并单元格')],
              },
            ]
          : [
              { id: 'c1', isHeader: false, blocks: [paragraph('a|b')] },
              { id: 'c2', isHeader: false, blocks: [paragraph('数值')] },
            ],
      },
    ],
  };
}

test('both formats retain title, author, timestamps, public source and partial-content warnings', () => {
  const input = {
    ...source([paragraph('正文')]),
    completeness: 'partial' as const,
    warnings: ['正文续页未能获取'],
  };
  for (const render of [serializeExportHtml, serializeExportMarkdown]) {
    const output = render(input, options);
    expect(output).toContain('导出示例');
    expect(output).toContain('作者示例');
    expect(output).toContain('部分内容');
    expect(output).toContain('正文续页未能获取');
    expect(output).toContain('https://www.zhihu.com/question/7/answer/42');
    expect(output).not.toContain('utm_source');
  }
});

test.each([
  'javascript:alert(1)',
  'zhihu--:///video/1',
  'file:///tmp/private',
  'https://user:password@example.com/article',
  'https://api.zhihu.com/answers/42',
  'https://www.zhihu.com/api/v4/answers/42',
  'https://www.zhihu.com/API/v4/answers/42',
  'https://www.zhihu.com/%2561pi/v4/answers/42',
  'https://developer.mozilla.org/API/private',
  'https://www.zhihu.com/signin?next=private',
  'https://example.com/oauth/authorize',
  'https://localhost/article',
  'https://127.0.0.1/article',
  'https://2130706433/article',
  'https://[::1]/article',
  'https://intranet.local/article',
  'https://example.com:8443/article',
])('rejects private, executable and authenticated URL targets: %s', (url) => {
  expect(getSafeExportUrl(url)).toBeUndefined();
  expect(getSafeExportImageUrl(url)).toBeUndefined();
});

test('unwraps public redirects without preserving sensitive or ambiguous queries', () => {
  expect(
    getSafeExportUrl(
      'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2Fread%3Futm_source%3Dshare%23section',
    ),
  ).toBe('https://example.com/read');
  expect(
    getSafeExportUrl('/question/7/answer/42?session=synthetic'),
  ).toBeUndefined();
  expect(
    getSafeExportImageUrl(
      'https://pic.zhimg.com/content.jpg?signature=synthetic#secret',
    ),
  ).toBe('https://pic.zhimg.com/content.jpg');
  expect(
    getSafeExportImageUrl(`${imageUrl}?signature=synthetic#secret`),
  ).toBeUndefined();
  expect(
    getSafeExportImageUrl('http://pic.example.com/image.jpg'),
  ).toBeUndefined();
});

test.each([
  'https://mp.weixin.qq.com/s?__biz=synthetic&mid=42',
  'https://item.taobao.com/item.htm?id=42&utm_source=share',
  'https://example.com/article?p=2',
  'https://example.com/read?token=synthetic',
  'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2Farticle%3Fp%3D2',
])(
  'keeps the label without linking to a changed query destination: %s',
  (url) => {
    expect(getSafeExportUrl(url)).toBeUndefined();
    const input = source([
      {
        id: 'link-paragraph',
        type: 'paragraph',
        children: [
          { id: 'query-link', type: 'link', url, children: [text('目标页面')] },
        ],
      },
    ]);
    const html = main(serializeExportHtml(input, options));
    const markdown = serializeExportMarkdown(input, options);
    expect(html).toContain('目标页面');
    expect(markdown).toContain('目标页面');
    expect(html).not.toMatch(/<a[^>]*>目标页面<\/a>/);
    expect(markdown).not.toContain('[目标页面](');
  },
);

test('keeps known public API documentation without permitting API or auth resources', () => {
  const url = 'https://developer.mozilla.org/en-US/docs/Web/API/fetch';
  expect(getSafeExportUrl(url)).toBe(url);
  expect(getSafeExportUrl(`${url}?utm_source=share#syntax`)).toBe(url);
  expect(getSafeExportImageUrl(url)).toBeUndefined();
  expect(
    getSafeExportUrl('https://developer.mozilla.org/en-US/docs/auth/session'),
  ).toBeUndefined();
});

test('keeps known public query identities and rejects ambiguous image endpoints', () => {
  expect(
    getSafeExportUrl(
      'https://www.youtube.com/watch?v=abcdefghijk&token=synthetic&utm_source=share',
    ),
  ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  expect(
    getSafeExportUrl(
      'https://en.wikipedia.org/w/index.php?title=Example&oldid=42&token=synthetic',
    ),
  ).toBe('https://en.wikipedia.org/w/index.php?title=Example&oldid=42');
  expect(
    getSafeExportImageUrl('https://example.com/image?id=1'),
  ).toBeUndefined();
  expect(
    getSafeExportImageUrl('https://example.com/image?id=2'),
  ).toBeUndefined();
  expect(
    getSafeExportImageUrl('https://example.com/image.png?utm_source=share'),
  ).toBe('https://example.com/image.png');
});

test('embedded image data still requires resource preparation in offline exports', () => {
  const data = 'data:image/png;base64,aW1hZ2U=';
  const input = source([
    { id: 'image', type: 'image', resource: { mediaType: 'image', url: data } },
  ]);
  expect(serializeExportHtml(input, options)).toContain('图片未能导出');
  expect(
    serializeExportMarkdown(input, {
      ...options,
      assets: new Map([[data, 'assets/asset-1.png']]),
    }),
  ).toContain('![](<assets/asset-1.png>)');
});

test('potentially wide formulas include a wrapping source fallback for print', () => {
  const latex = String.raw`\begin{matrix} a & b & c & d \\ e & f & g & h \end{matrix}`;
  const html = serializeExportHtml(
    source([{ id: 'wide', type: 'blockFormula', formula: { latex } }]),
    options,
  );
  expect(main(html)).toContain('class="wide-formula"');
  expect(main(html)).toContain('打印时使用源码避免裁切');
  expect(main(html)).toContain('class="formula-source"');
  expect(main(html)).toContain('a &amp; b &amp; c');
});

test('wide inline formulas retain paragraph flow and print fallback inside quotes, lists and cells', () => {
  const latex = Array.from({ length: 45 }, () => 'x').join('+');
  const mixed = (id: string): ZhihuBlock => ({
    id,
    type: 'paragraph',
    children: [
      text(`${id}前文`),
      { id: `${id}-formula`, type: 'inlineFormula', formula: { latex } },
      text(`${id}后文`),
    ],
  });
  const input = source([
    mixed('root'),
    {
      id: 'quote',
      type: 'quote',
      blocks: [
        {
          id: 'list',
          type: 'list',
          ordered: false,
          items: [
            {
              id: 'item',
              blocks: [
                mixed('list'),
                {
                  id: 'table',
                  type: 'table',
                  body: [
                    {
                      id: 'row',
                      cells: [
                        {
                          id: 'cell',
                          isHeader: false,
                          blocks: [mixed('cell')],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  const html = serializeExportHtml(input, options);
  const parsed = parseDocument(html);
  for (const id of ['root', 'list', 'cell']) {
    const paragraph = DomUtils.findAll(
      (node) =>
        node.name === 'p' && DomUtils.textContent(node).startsWith(`${id}前文`),
      parsed.children,
    );
    expect(paragraph).toHaveLength(1);
    expect(DomUtils.textContent(paragraph[0])).toContain(`${id}后文`);
    expect(DomUtils.textContent(paragraph[0])).toContain(latex);
    expect(
      DomUtils.findAll(
        (node) => ['div', 'pre', 'p'].includes(node.name),
        paragraph[0].children,
      ),
    ).toHaveLength(0);
  }
  expect(html.match(/class="wide-formula inline-wide-formula"/g)).toHaveLength(
    3,
  );
  expect(html).toContain('.wide-formula .formula-rendered{display:none}');
});

test('multiline inline code keeps breaks, indentation and literal HTML in Markdown', () => {
  const input = source([
    {
      id: 'code-paragraph',
      type: 'paragraph',
      children: [
        text('前文'),
        { id: 'code', type: 'inlineCode', text: ' a  b\r\n\t<x>  \nlast' },
        text('后文'),
      ],
    },
  ]);
  const markdown = serializeExportMarkdown(input, options);
  expect(markdown).toContain(
    '前文<code>&nbsp;a&nbsp;&nbsp;b<br>&nbsp;&nbsp;&nbsp;&nbsp;&lt;x&gt;&nbsp;&nbsp;<br>last</code>后文',
  );
  expect(markdown).not.toContain('<x>');
});

test('escapes malicious AST text and metadata without generating executable nodes or app links', () => {
  const input = {
    ...source([
      {
        id: 'p',
        type: 'paragraph',
        children: [
          text('<script>alert(1)</script>'),
          {
            id: 'link',
            type: 'link',
            url: 'javascript:alert(2)',
            children: [text('恶意链接')],
          },
          {
            id: 'app',
            type: 'link',
            url: 'zhihu--:///video/1',
            children: [text('应用链接')],
          },
        ],
      },
      {
        id: 'unsafe',
        type: 'unsupported',
        sourceType: 'script',
        fallbackText: '<img onerror="evil()">',
      },
    ]),
    title: '</title><script>evil()</script>',
    author: '<img src=x onerror=evil()>',
  } satisfies ExportSource;
  const output = serializeExportHtml(input, options);
  const document = parseDocument(output);
  expect(
    DomUtils.findAll(
      (node) => ['script', 'iframe', 'object', 'embed'].includes(node.name),
      document.children,
    ),
  ).toHaveLength(0);
  expect(output).not.toContain('href="javascript:');
  expect(output).not.toContain('href="zhihu--:');
  expect(output).toContain('&lt;script&gt;');
  expect(output).toContain('恶意链接');
  const markdown = serializeExportMarkdown(input, options);
  expect(markdown).toContain('\\<script\\>');
  expect(markdown).not.toContain('](<javascript:');
});

test('static formulas include local fonts and cannot introduce trusted KaTeX links or images', () => {
  const input = source([
    {
      id: 'inline',
      type: 'paragraph',
      children: [
        text('混排'),
        { id: 'formula', type: 'inlineFormula', formula: { latex: 'E=mc^2' } },
        text('后文'),
      ],
    },
    { id: 'block', type: 'blockFormula', formula: { latex: '\\sqrt{x^2+1}' } },
    {
      id: 'untrusted',
      type: 'blockFormula',
      formula: { latex: '\\href{javascript:alert(1)}{click}' },
    },
  ]);
  const html = serializeExportHtml(input, options);
  expect(html).toContain('data:font/woff2;base64,');
  expect(main(html)).toContain('class="katex"');
  expect(main(html)).toContain('<math');
  expect(main(html)).not.toContain('<script');
  expect(main(html)).not.toContain('href="javascript:');
  expect(main(html)).toMatch(
    /混排<span class="inline-formula">[\s\S]+<\/span>后文/,
  );
  const markdown = serializeExportMarkdown(input, options);
  expect(markdown).toContain('混排$E=mc^2$后文');
  expect(markdown).toContain('$$\n\\sqrt{x^2+1}\n$$');
  expect(markdown).toContain('```latex\n\\href');
});

test('keeps image-only formulas when ordinary images are disabled', () => {
  const input = source([
    { id: 'image', type: 'image', resource: imageResource, alt: '正文图' },
    {
      id: 'formula',
      type: 'blockFormula',
      formula: {
        image: {
          mediaType: 'image',
          url: 'https://pic.example.com/formula.png',
        },
      },
    },
  ]);
  const assets = new Map([
    [imageUrl, 'assets/asset-1.jpg'],
    ['https://pic.example.com/formula.png', 'assets/asset-2.png'],
  ]);
  for (const render of [serializeExportHtml, serializeExportMarkdown]) {
    const output = render(input, { ...options, includeImages: false, assets });
    expect(output).not.toContain('assets/asset-1.jpg');
    expect(output).toContain('assets/asset-2.png');
  }
});

test('missing offline images remain visible and unsafe prepared assets cannot inject markup', () => {
  const input = source([
    { id: 'image', type: 'image', resource: imageResource, alt: '示例图' },
  ]);
  for (const render of [serializeExportHtml, serializeExportMarkdown]) {
    expect(render(input, options)).toContain('图片未能导出');
    expect(render(input, options)).not.toContain(imageUrl);
    const output = render(input, {
      ...options,
      assets: new Map([
        [imageUrl, 'data:image/svg+xml,<svg onload="evil()"/>'],
      ]),
    });
    expect(output).toContain('图片未能导出');
    expect(output).not.toContain('onload');
  }
});

test('renders prepared raster assets without remote requests', () => {
  const data = 'data:image/png;base64,aW1hZ2U=';
  const input = source([
    { id: 'image', type: 'image', resource: imageResource },
  ]);
  expect(
    serializeExportHtml(input, {
      ...options,
      assets: new Map([[imageUrl, data]]),
    }),
  ).toContain(`src="${data}"`);
  expect(
    main(
      serializeExportHtml(input, {
        ...options,
        assets: new Map([[imageUrl, data]]),
      }),
    ),
  ).not.toContain(imageUrl);
  expect(
    serializeExportMarkdown(input, {
      ...options,
      assets: new Map([[imageUrl, 'assets/asset-1.jpg']]),
    }),
  ).toContain('![](<assets/asset-1.jpg>)');
});

test('uses pipe tables for simple data and preserves merged-cell structure as safe HTML', () => {
  expect(serializeExportMarkdown(source([table()]), options)).toContain(
    '| 项目 | 值 |\n| --- | --- |\n| a\\|b | 数值 |',
  );
  const merged = serializeExportMarkdown(source([table(true)]), options);
  expect(merged).toContain('<table>');
  expect(merged).toContain('colspan="2"');
  expect(merged).toContain('合并单元格');
  const html = serializeExportHtml(source([table(true)]), options);
  expect(html).toContain('<thead>');
  expect(html).toContain('<caption>表格示例</caption>');
});

test('preserves nested numbered lists, quotation, code fences and literal punctuation', () => {
  const input = source([
    {
      id: 'list',
      type: 'list',
      ordered: true,
      start: 3,
      items: [
        {
          id: 'item',
          blocks: [
            paragraph('首段'),
            {
              id: 'nested',
              type: 'list',
              ordered: false,
              items: [{ id: 'child', blocks: [paragraph('子项')] }],
            },
            paragraph('续段'),
          ],
        },
      ],
    },
    {
      id: 'quote',
      type: 'quote',
      blocks: [paragraph('引用'), paragraph('另一段')],
    },
    {
      id: 'code',
      type: 'code',
      language: 'ts',
      text: 'const a = `x`;\n```\n<script>literal</script>',
    },
    paragraph('# literal [link](target) $value$'),
  ]);
  const markdown = serializeExportMarkdown(input, options);
  expect(markdown).toContain('3. 首段\n   \n   - 子项\n   \n   续段');
  expect(markdown).toContain('> 引用\n> \n> 另一段');
  expect(markdown).toContain(
    '````ts\nconst a = `x`;\n```\n<script>literal</script>\n````',
  );
  expect(markdown).toContain('\\# literal \\[link\\]\\(target\\) \\$value\\$');
  const html = serializeExportHtml(input, options);
  expect(html).toContain('<ol start="3">');
  expect(html).toContain('&lt;script&gt;literal&lt;/script&gt;');
});

test('footnote references and backlinks use generated IDs, including repeated and missing references', () => {
  const input = source([
    {
      id: 'p',
      type: 'paragraph',
      children: [
        text('前文'),
        {
          id: 'ref1',
          type: 'footnoteReference',
          definitionId: 'unsafe"id',
          label: '甲',
        },
        {
          id: 'ref2',
          type: 'footnoteReference',
          definitionId: 'unsafe"id',
          label: '甲',
        },
        {
          id: 'ref3',
          type: 'footnoteReference',
          definitionId: 'missing',
          label: '乙',
        },
      ],
    },
  ]);
  const withNotes = {
    ...input,
    document: {
      ...input.document,
      footnotes: [
        {
          id: 'unsafe"id',
          label: '甲',
          blocks: [paragraph('脚注第一段'), paragraph('脚注第二段')],
        },
      ],
    },
  };
  const html = main(serializeExportHtml(withNotes, options));
  expect(html.match(/href="#note-1"/g)).toHaveLength(2);
  expect(html).toContain('id="note-1"');
  expect(html).toContain('href="#ref-1"');
  expect(html).toContain('href="#ref-2"');
  expect(html).not.toContain('unsafe"id');
  expect(html).toContain('脚注缺失');
  const markdown = serializeExportMarkdown(withNotes, options);
  expect(markdown).toContain('[^note-1][^note-1]');
  expect(markdown).toContain('[^note-1]: 脚注第一段\n    \n    脚注第二段');
});

test('exports URL-only citations and redacts both the link and its generated label', () => {
  const { document } = normalizeZhihuDocument(
    '<p>示例<sup data-numero="1" data-text="" data-url="https://example.org/source?utm_source=tracking">[1]</sup><sup data-numero="2" data-url="https://example.org/other?token=private">[2]</sup></p>',
    { documentId: 'footnote-example' },
  );
  const input = { ...source([]), document };
  const html = main(serializeExportHtml(input, options));
  expect(html).toContain('role="doc-noteref">[1]</a>');
  expect(html).toContain('href="https://example.org/source"');
  expect(html).toContain('>https://example.org/source</a>');
  const markdown = serializeExportMarkdown(input, options);
  expect(markdown).toContain('](<https://example.org/source>)');
  for (const content of [html, markdown]) {
    expect(content).toContain('来源链接未导出');
    expect(content).not.toMatch(/暂无定义|tracking|private/);
  }
});

test('redacts URL labels split across formatting while keeping descriptive link styling', () => {
  const { document } = normalizeZhihuDocument(
    '<p><a href="https://example.org/source#export-demo"><strong>https://example.org/</strong><em>source#export-demo</em></a>' +
      '<a href="https://example.org/private?token=synthetic"><code>https://example.org/private?token=synthetic</code></a>' +
      '<a href="https://example.org/source#export-demo"><strong>资料说明</strong></a></p>',
    { documentId: 'styled-link-labels' },
  );
  const input = { ...source([]), document };
  const html = main(serializeExportHtml(input, options));
  const markdown = serializeExportMarkdown(input, options);
  for (const output of [html, markdown]) {
    expect(output).not.toMatch(/export-demo|synthetic/);
    expect(output).toContain('来源链接未导出');
  }
  expect(html).toContain('>https://example.org/source</a>');
  expect(html).toContain('<strong>资料说明</strong>');
  expect(markdown).toContain(
    '[https://example\\.org/source](<https://example.org/source>)',
  );
  expect(markdown).toContain('[**资料说明**](<https://example.org/source>)');
});

test.each([
  {
    format: 'HTML',
    render: serializeExportHtml,
    publicLabel: '>https://example.org/Read</a>',
    descriptiveLabel: '<strong>阅读说明</strong>',
  },
  {
    format: 'Markdown',
    render: serializeExportMarkdown,
    publicLabel: '[https://example\\.org/Read](<https://example.org/Read>)',
    descriptiveLabel: '[**阅读说明**](<https://example.org/Read>)',
  },
])(
  'redacts normalized mixed-case URL labels in $format',
  ({ render, publicLabel, descriptiveLabel }) => {
    const { document } = normalizeZhihuDocument(
      '<p><a href="https://EXAMPLE.org/private?token=inlineFixture"><strong>https://EXAMPLE.org/</strong><em>private?token=inlineFixture</em></a></p>' +
        '<p><a href="https://Example.ORG/Read?utm_source=trackingFixture">https://Example.ORG/Read?utm_source=trackingFixture</a></p>' +
        '<a data-draft-type="link-card" href="https://EXample.org/card?token=cardFixture" data-draft-title="https://EXample.org/card?token=cardFixture"></a>' +
        '<p><a href="https://Example.ORG/Read?utm_source=trackingFixture"><strong>阅读说明</strong></a></p>',
      { documentId: 'mixed-case-url-labels' },
    );
    const output = render({ ...source([]), document }, options);
    expect(output).not.toMatch(/inlineFixture|trackingFixture|cardFixture/);
    expect(output.match(/来源链接未导出/g)).toHaveLength(2);
    expect(output).toContain(publicLabel);
    expect(output).toContain(descriptiveLabel);
  },
);

test('footnotes referenced only inside an HTML table remain visible in Markdown', () => {
  const complex = table(true);
  const noteReference: ZhihuBlock = {
    id: 'reference',
    type: 'paragraph',
    children: [
      {
        id: 'ref',
        type: 'footnoteReference',
        definitionId: 'note',
        label: '1',
      },
    ],
  };
  const input = source([
    {
      ...complex,
      body: [
        {
          id: 'row',
          cells: [
            {
              id: 'cell',
              colSpan: 2,
              isHeader: false,
              blocks: [noteReference],
            },
          ],
        },
      ],
    },
  ]);
  const withNotes = {
    ...input,
    document: {
      ...input.document,
      footnotes: [{ id: 'note', label: '1', blocks: [paragraph('表格脚注')] }],
    },
  };
  const markdown = serializeExportMarkdown(withNotes, options);
  expect(markdown).toContain('href="#note-1"');
  expect(markdown).toContain('<a id="note-1"></a> **[1]**');
  expect(markdown).toContain('表格脚注');
  expect(markdown).not.toContain('[^note-1]:');
});

test('covers remaining inline semantics and static video/card fallbacks without interactive metadata', () => {
  const children: ZhihuInlineRun[] = [
    { id: 'strong', type: 'strong', children: [text('粗体')] },
    { id: 'em', type: 'emphasis', children: [text('斜体')] },
    { id: 'u', type: 'underline', children: [text('下划线')] },
    { id: 's', type: 'strikethrough', children: [text('删除')] },
    { id: 'highlight', type: 'highlight', children: [text('高亮')] },
    { id: 'sub', type: 'subscript', children: [text('下标')] },
    { id: 'sup', type: 'superscript', children: [text('上标')] },
    { id: 'code', type: 'inlineCode', text: 'a`b' },
    { id: 'kbd', type: 'keyboardInput', text: 'Ctrl+C' },
    {
      id: 'img',
      type: 'inlineImage',
      resource: imageResource,
      alt: '行内图片',
    },
    {
      id: 'segment',
      type: 'segment',
      paragraphId: 'secret-business-id',
      range: { start: 0, end: 1 },
      children: [text('片段')],
    },
    {
      id: 'seg-highlight',
      type: 'segmentHighlight',
      highlight: { sourceUrl: 'https://example.com/api/private' },
      children: [text('知识点')],
    },
    { id: 'break', type: 'lineBreak' },
    {
      id: 'unsupported',
      type: 'unsupported',
      sourceType: 'poll',
      fallbackText: '投票请查看原文',
    },
  ];
  const input = source([
    { id: 'heading', type: 'heading', level: 2, children: [text('小标题')] },
    { id: 'p', type: 'paragraph', children },
    {
      id: 'video',
      type: 'video',
      url: 'https://www.zhihu.com/zvideo/42',
      title: '演示视频',
      poster: imageResource,
    },
    {
      id: 'card',
      type: 'linkCard',
      url: 'https://example.com/read?session=synthetic',
      title: '参考资料',
      description: '说明',
      image: imageResource,
    },
    { id: 'divider', type: 'divider' },
  ]);
  for (const render of [serializeExportHtml, serializeExportMarkdown]) {
    const output = render(input, options);
    for (const value of [
      '小标题',
      '粗体',
      '斜体',
      '下划线',
      '删除',
      '高亮',
      '下标',
      '上标',
      '片段',
      '知识点',
      '投票请查看原文',
      '演示视频',
      '参考资料',
    ])
      expect(output).toContain(value);
    expect(output).not.toContain('secret-business-id');
    expect(output).not.toContain('session=synthetic');
    expect(output).not.toContain('/api/private');
    expect(output).toContain('视频请在原文观看');
  }
});
