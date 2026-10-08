import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import type { ZhihuInlineRun } from '../document';
import { walkZhihuDocument } from '../documentTraversal';
import slicingFixture from '../fixtures/cases/segment-slicing-boundaries-001.json';
import { createInlineRunSlicer } from '../normalization/inlineRunSlicer';
import {
  normalizeZhihuContentSegments,
  normalizeZhihuDocument,
} from '../normalization/normalizeZhihuDocument';
import { legacyInlineText, legacySliceRuns } from './inline-slicing-reference';

const normalize = (html: string) =>
  normalizeZhihuDocument(html, { documentId: 'test' });
const image = 'https://example.com/image.png';

describe('prototype HTML to ZhihuDocument normalization', () => {
  it('passes structured pin fields through attribute escaping and the existing resource allowlist', () => {
    const { document, diagnostics } = normalizeZhihuContentSegments(
      [
        { type: 'text', content: '<p>想法正文</p><script>secret()</script>' },
        { type: 'image', url: 'javascript:alert(1)', width: 20, height: 20 },
        {
          type: 'link_card',
          url: 'https://example.com/article',
          data_draft_title: '<b>原样标题</b>" onmouseover="secret()',
        },
      ],
      { documentId: 'test' },
    );
    expect(document.blocks.at(-1)).toMatchObject({
      type: 'linkCard',
      url: 'https://example.com/article',
      title: '原样标题" onmouseover="secret()',
    });
    expect(diagnostics.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['removed-node', 'unsafe-url']),
    );
    const nodes = [...walkZhihuDocument(document)];
    expect(nodes.filter((node) => node.type === 'image')).toHaveLength(0);
    expect(
      nodes.filter((node) => node.type === 'text').map((node) => node.text),
    ).not.toContain('secret()');
  });

  it('keeps synthetic pin video page identity separate from its media resource and preserves unknown segment content', () => {
    const { document, diagnostics } = normalizeZhihuContentSegments(
      [
        {
          type: 'video',
          video_id: '42',
          title: '示例视频',
          url: 'https://example.com/video.mp4',
          thumbnail: 'https://example.com/poster.png',
          width: 1920,
          height: 1080,
        },
        { type: 'video', url: 'https://www.zhihu.com/zvideo/43' },
        {
          type: 'unknown-format',
          content: '<p>仍可读取的想法文本</p>',
          title: '未支持的媒体',
        },
      ],
      { documentId: 'test' },
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'video',
      videoId: '42',
      lensId: '42',
      url: 'https://www.zhihu.com/zvideo/42',
      title: '示例视频',
      resource: {
        mediaType: 'video',
        url: 'https://example.com/video.mp4',
        width: 1920,
        height: 1080,
      },
      poster: { url: 'https://example.com/poster.png' },
    });
    expect(document.blocks[1]).toMatchObject({
      type: 'video',
      videoId: '43',
      url: 'https://www.zhihu.com/zvideo/43',
    });
    expect(document.blocks[1]).not.toHaveProperty('resource');
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(JSON.stringify(compiled.parts)).toContain('仍可读取的想法文本');
    expect(JSON.stringify(compiled.parts)).toContain('未支持的媒体');
    expect(diagnostics).toContainEqual({
      kind: 'unsupported-node',
      sourceType: 'pin-content-segment',
    });
  });

  it('supports synthetic lazy image sources and token-only resources documented by the local Zhihu parser', () => {
    const token = 'v2-11111111111111111111111111111111';
    const { document } = normalize(
      `<img data-default-watermark-src="https://example.com/watermark.png"><img data-thumbnail="//example.com/thumbnail.png"><img data-original-token="${token}" data-rawwidth="1024" data-rawheight="768"><img data-actualsrc="https://example.com/v2-00000000000000000000000000000000_720w.jpg" data-original="https://example.com/v2-00000000000000000000000000000000.jpg" data-original-token="${token}">`,
    );
    const images = document.blocks.filter((node) => node.type === 'image');
    expect(images.map((node) => node.resource.url)).toEqual([
      'https://example.com/watermark.png',
      'https://example.com/thumbnail.png',
      `https://pic1.zhimg.com/${token}`,
      `https://example.com/${token}_720w.jpg`,
    ]);
    expect(images[2].resource).toMatchObject({ width: 1024, height: 768 });
    expect(images[3].resource.originalUrl).toBe(
      `https://example.com/${token}.jpg`,
    );
  });

  it('recovers raw formula tex from a lazy image URL when alt is absent without promoting it to a block', () => {
    const latex = '  \\frac{a}{b} + c % keep comment\n';
    const { document } = normalize(
      `<p>前<img data-actualsrc="https://www.zhihu.com/equation?tex=${encodeURIComponent(latex)}">后</p>`,
    );
    expect(document.blocks).toHaveLength(1);
    const formula = [...walkZhihuDocument(document)].find(
      (node) => node.type === 'inlineFormula',
    );
    expect(formula).toMatchObject({ formula: { latex } });
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(
      compiled.parts[0].type === 'flow' &&
        compiled.parts[0].flow.attachments[0].copyText,
    ).toBe(latex);
  });

  it.each([
    '/equation?tex=x',
    '//www.zhihu.com/equation?tex=x',
  ])('normalizes a relative equation image URL without losing surrounding text (%s)', (url) => {
    const { document, diagnostics } = normalize(
      `<p>前<img src="${url}">后</p>`,
    );
    expect(document.blocks).toHaveLength(1);
    expect([...walkZhihuDocument(document)]).toContainEqual(
      expect.objectContaining({
        type: 'inlineFormula',
        formula: {
          latex: 'x',
          image: {
            mediaType: 'image',
            url: 'https://www.zhihu.com/equation?tex=x',
          },
        },
      }),
    );
    const part = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts[0];
    expect(part.type === 'flow' && part.flow.text).toBe('前\uFFFC后');
    expect(diagnostics).toEqual([]);
  });

  it.each([
    'https://[broken/equation?tex=x',
    'https://%zz/equation?tex=x',
    'equation?tex=x',
    'javascript:equation?tex=x',
  ])('keeps visible formula fallbacks for invalid resource URLs (%s)', (url) => {
    const { document, diagnostics } = normalize(
      `<p>前<img eeimg="1" src="${url}" alt="x">后</p><img eeimg="2" src="${url}">`,
    );
    const nodes = [...walkZhihuDocument(document)];
    expect(nodes.filter((node) => node.type === 'unsupported')).toEqual([
      expect.objectContaining({ fallbackText: '[图片：x]' }),
      expect.objectContaining({ fallbackText: '[图片不可用]' }),
    ]);
    const parts = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts;
    expect(parts[0].type === 'flow' && parts[0].flow.text).toBe(
      '前[图片：x]后',
    );
    expect(parts[1]).toMatchObject({
      type: 'block',
      block: { type: 'unsupported', fallbackText: '[图片不可用]' },
    });
    expect(diagnostics).toEqual([
      { kind: 'unsafe-url', sourceType: 'img' },
      { kind: 'unsafe-url', sourceType: 'img' },
    ]);
  });

  it('promotes only synthetic MathJax display constructs while preserving matrix, grouped and commented row separators', () => {
    const display = [
      'a \\\\ b',
      'x \\tag{1}',
      ' \\begin % environment\n {align*}a&=b\\\\c&=d\\end{align*} ',
    ];
    const inline = [
      '\\begin{matrix}a\\\\b\\end{matrix}',
      '{a\\\\b}',
      'x % \\tag{1} and \\\\ ignored\n + y',
      '\\text{\\{x\\}} + y',
    ];
    for (const latex of [...display, ...inline]) {
      const { document } = normalize(
        `<p>前<img eeimg="1" src="https://www.zhihu.com/equation?tex=${encodeURIComponent(latex)}">后</p>`,
      );
      if (display.includes(latex)) {
        expect(document.blocks.map((block) => block.type)).toEqual([
          'paragraph',
          'blockFormula',
          'paragraph',
        ]);
        expect(document.blocks[1]).toMatchObject({ formula: { latex } });
      } else {
        expect(document.blocks).toHaveLength(1);
        expect(
          [...walkZhihuDocument(document)].find(
            (node) => node.type === 'inlineFormula',
          ),
        ).toMatchObject({ formula: { latex } });
      }
    }
  });

  it.each([
    '',
    'eeimg="1"',
    'emimg="2"',
  ])('keeps a short formula inline in its own paragraph or at the document root (%s)', (attributes) => {
    for (const html of [
      `<p><strong><span><img ${attributes} src="/equation?tex=x"></span></strong></p>`,
      `<img ${attributes} src="/equation?tex=x">`,
    ]) {
      const { document } = normalize(html);
      expect(document.blocks.map((block) => block.type)).toEqual(['paragraph']);
      expect(
        [...walkZhihuDocument(document)].filter(
          (node) => node.type === 'inlineFormula',
        ),
      ).toHaveLength(1);
    }
  });

  it.each([
    ['<ul><li>', '</li></ul>'],
    ['<blockquote>', '</blockquote>'],
    ['<div>', '</div>'],
    ['', ''],
  ])('keeps bare-container short formulas in the surrounding sentence (%s)', (opening, closing) => {
    const { document } = normalize(
      `${opening}矩阵 <img eeimg="1" src="/equation?tex=A"> 的幂 <img src="/equation?tex=A%5En"> 仍在原句${closing}`,
    );
    const paragraphs = [...walkZhihuDocument(document)].filter(
      (node) => node.type === 'paragraph',
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].children.map((node) => node.type)).toEqual([
      'text',
      'inlineFormula',
      'text',
      'inlineFormula',
      'text',
    ]);
    const parts = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].type === 'flow' && parts[0].flow.text).toBe(
      `${opening.includes('<li>') ? '• ' : ''}矩阵 \uFFFC 的幂 \uFFFC 仍在原句`,
    );
  });

  it('still lifts actual display formulas and ordinary block pictures from bare list items', () => {
    const { document } = normalize(
      '<ul><li>前<img eeimg="2" src="/equation?tex=x">中<img src="https://example.com/picture.png">后</li></ul>',
    );
    const list = document.blocks[0];
    if (list.type !== 'list') throw new Error('Expected a list');
    expect(list.items[0].blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'blockFormula',
      'paragraph',
      'image',
      'paragraph',
    ]);
    expect(list.items[0].blocks[1]).toMatchObject({ formula: { latex: 'x' } });
  });

  it('lifts LaTeX display math through nested formatting and retains surrounding styles and source offsets', () => {
    const latex = ' \\begin{align*}a&=b\\\\c&=d\\end{align*} ';
    const { document } = normalize(
      `<p data-pid="one">前<strong>粗前<span><img eeimg="1" src="/equation?tex=${encodeURIComponent(latex)}">粗后</span></strong>后</p>`,
    );
    expect(document.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'blockFormula',
      'paragraph',
    ]);
    expect(document.blocks[1]).toMatchObject({ formula: { latex } });
    const ids = [...walkZhihuDocument(document)].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const parts = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts;
    if (parts[0].type !== 'flow' || parts[2].type !== 'flow')
      throw new Error('Expected text flows surrounding display math');
    expect(parts[0].flow.text).toBe('前粗前');
    expect(parts[2].flow.text).toBe('粗后后');
    expect(parts[0].flow.spans).toContainEqual(
      expect.objectContaining({ kind: 'strong', start: 1, end: 3 }),
    );
    expect(parts[2].flow.spans).toContainEqual(
      expect.objectContaining({ kind: 'strong', start: 0, end: 2 }),
    );
    expect(mapRichTextSelection(parts[2].flow, 0, 3)).toMatchObject({
      start: { paragraphId: 'one', offset: 3 },
      end: { paragraphId: 'one', offset: 6 },
    });
    expect(
      normalize(
        `<p data-pid="one">前<strong>粗前<span><img eeimg="1" src="/equation?tex=${encodeURIComponent(latex)}">粗后</span></strong>后</p>`,
      ).document,
    ).toEqual(document);
  });

  it('honors explicit eeimg=2 inside a sentence and absorbs only br adjacent to extracted display boundaries', () => {
    const { document } = normalize(
      '<p>甲<br><strong><span><img eeimg="2" src="/equation?tex=x"></span></strong><br>乙<br>丙</p>',
    );
    const parts = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts;
    expect(parts.map((part) => part.type)).toEqual(['flow', 'block', 'flow']);
    expect(parts[0].type === 'flow' && parts[0].flow.text).toBe('甲');
    expect(parts[1]).toMatchObject({
      type: 'block',
      block: { type: 'blockFormula', formula: { latex: 'x' } },
    });
    expect(parts[2].type === 'flow' && parts[2].flow.text).toBe('乙\n丙');
    const inline = normalize(
      '<p>甲<br><strong><img eeimg="1" src="/equation?tex=x"></strong><br>乙</p>',
    ).document;
    const inlinePart = compileZhihuDocument(inline, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts[0];
    expect(inlinePart.type === 'flow' && inlinePart.flow.text).toBe(
      '甲\n\uFFFC\n乙',
    );
  });

  it('keeps width and very long matrix source out of mathematical display classification', () => {
    const latex = `\\begin{matrix}${'x&'.repeat(2200)}y\\end{matrix}`;
    const { document } = normalize(
      `<p>前<img eeimg="1" src="/equation?tex=${encodeURIComponent(latex)}" width="900" height="240">后</p>`,
    );
    expect(document.blocks.map((block) => block.type)).toEqual(['paragraph']);
    const part = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts[0];
    if (part.type !== 'flow') throw new Error('Expected inline matrix flow');
    expect(part.flow.attachments[0]).toMatchObject({
      kind: 'formula',
      width: 900,
      height: 240,
      latex,
      copyText: latex,
    });
  });

  it('projects synthetic video-box thumbnails and nested code language while preserving code whitespace', () => {
    const { document } = normalize(
      '<a class="video-box" href="https://www.zhihu.com/video/44"><img data-actualsrc="https://example.com/poster.png"></a><pre lang="python"><code class="language-typescript">  one\n    two</code></pre>',
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'video',
      videoId: '44',
      lensId: '44',
      url: 'https://www.zhihu.com/video/44',
      poster: { url: 'https://example.com/poster.png' },
    });
    expect(document.blocks[1]).toMatchObject({
      type: 'code',
      language: 'typescript',
      text: '  one\n    two',
    });
  });

  it('keeps Lens identity separate when the video-box href has a different zvideo ID', () => {
    const { document } = normalize(
      '<a class="video-box" data-lens-id="101" href="https://www.zhihu.com/zvideo/202">视频</a>',
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'video',
      videoId: '202',
      lensId: '101',
      url: 'https://www.zhihu.com/zvideo/202',
    });
  });

  it.each([
    '<span><img data-original-src="https://example.com/nested-cover.png"></span>',
    '<span><img data-actualsrc="javascript:alert(1)" src="https://example.com/nested-cover.png"></span>',
  ])('keeps nested lazy video covers and skips unsafe candidates: %s', (image) => {
    const { document } = normalize(
      `<a class="video-box" data-lens-id="101">${image}</a>`,
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'video',
      lensId: '101',
      poster: { url: 'https://example.com/nested-cover.png' },
    });
  });

  it('uses a video-box thumbnail before its child placeholder', () => {
    const { document } = normalize(
      '<a class="video-box" data-lens-id="101" data-thumbnail="https://example.com/thumbnail.png"><span><img src="https://example.com/placeholder.png"></span></a>',
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'video',
      poster: { url: 'https://example.com/thumbnail.png' },
    });
  });

  it('drops executable nodes and unsafe nested redirect URLs while keeping their visible labels', () => {
    const { document, diagnostics } = normalize(
      '<script>secret()</script><p>正文<a href="javascript:alert(1)">危险链接</a><a href="https://link.zhihu.com/?target=javascript%3Aalert(1)">包装链接</a><img src="javascript:alert(1)" alt="缺图"></p>',
    );
    expect(
      [...walkZhihuDocument(document)].filter((node) => node.type === 'link'),
    ).toHaveLength(0);
    expect(diagnostics.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['removed-node', 'unsafe-url']),
    );
    const compilation = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(JSON.stringify(compilation.parts)).not.toContain('secret()');
    expect(JSON.stringify(compilation.parts)).toContain('危险链接');
    expect(JSON.stringify(compilation.parts)).toContain('[图片：缺图]');
  });

  it('preserves whitespace across inline format boundaries and stable unique identities', () => {
    const html =
      '<p data-pid="one">  hello <strong>bold <em>word</em></strong> world  </p>';
    const first = normalize(html).document;
    expect(normalize(html).document).toEqual(first);
    const ids = [...walkZhihuDocument(first)].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const compiled = compileZhihuDocument(first, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(
      compiled.parts[0].type === 'flow' && compiled.parts[0].flow.text,
    ).toBe('hello bold word world');
  });

  it('keeps code whitespace and raw LaTeX, without promoting a matrix to a display formula', () => {
    const { document } = normalize(
      `<pre>  one\n    two</pre><p>A<img eeimg="1" src="https://example.com/equation?tex=x" alt=" \\begin{matrix}a\\\\b\\end{matrix} ">B</p>`,
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'code',
      text: '  one\n    two',
    });
    expect(
      [...walkZhihuDocument(document)].find(
        (node) => node.type === 'inlineFormula',
      ),
    ).toMatchObject({
      formula: { latex: ' \\begin{matrix}a\\\\b\\end{matrix} ' },
    });
    expect(document.blocks.some((node) => node.type === 'blockFormula')).toBe(
      false,
    );
  });

  it('extracts display formulas and wide pictures from paragraphs while preserving small inline pictures', () => {
    const { document } = normalize(
      `<p data-pid="one">前<img eeimg="1" src="${image}" alt="x">中<img eeimg="2" src="${image}" alt="y">后<img src="${image}" width="900" height="400">尾<img src="${image}" width="20" height="20">终</p>`,
    );
    expect(document.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'blockFormula',
      'paragraph',
      'image',
      'paragraph',
    ]);
    expect(
      [...walkZhihuDocument(document)].filter(
        (node) => node.type === 'inlineFormula',
      ),
    ).toHaveLength(1);
    expect(
      [...walkZhihuDocument(document)].filter(
        (node) => node.type === 'inlineImage',
      ),
    ).toHaveLength(1);
  });

  it('retains figure captions, table sections and spans, and nested list content', () => {
    const { document } = normalize(
      `<figure><img src="${image}" width="400" height="200"><figcaption>图 <b>说明</b></figcaption></figure><table><caption>数据</caption><thead><tr><th colspan="2">标题</th></tr></thead><tbody><tr><td align="right"><p>值</p><ul><li>A<ul><li>B</li></ul></li></ul></td><td rowspan="2">二</td></tr></tbody><tfoot><tr><td>合计</td></tr></tfoot></table>`,
    );
    expect(document.blocks[0]).toMatchObject({
      type: 'image',
      caption: [{ type: 'text', text: '图 ' }, { type: 'strong' }],
    });
    expect(document.blocks[1]).toMatchObject({
      type: 'table',
      head: [{ cells: [{ isHeader: true, colSpan: 2 }] }],
      body: [{ cells: [{ alignment: 'right' }, { rowSpan: 2 }] }],
      foot: [{ cells: [{ isHeader: false }] }],
    });
    expect(
      [...walkZhihuDocument(document)].filter((node) => node.type === 'list'),
    ).toHaveLength(2);
  });

  it('resolves repeated footnote references and preserves missing definitions visibly', () => {
    const { document, diagnostics } = normalize(
      '<p>前<a class="footnote-ref" data-numero="1">[1]</a>后<a class="footnote-ref" data-numero="1">[1]</a><sup data-numero="2">2</sup></p><section class="footnotes"><ol><li data-numero="1"><p>说明 <em>内容</em></p></li></ol></section>',
    );
    const references = [...walkZhihuDocument(document)].filter(
      (node) => node.type === 'footnoteReference',
    );
    expect(references).toHaveLength(3);
    expect(references[0]).toMatchObject({
      definitionId:
        references[1].type === 'footnoteReference'
          ? references[1].definitionId
          : '',
    });
    expect(document.footnotes).toHaveLength(2);
    expect(diagnostics).toContainEqual({
      kind: 'missing-footnote',
      sourceType: 'footnote-reference',
    });
    expect(
      [...walkZhihuDocument(document)].find(
        (node) => node.type === 'unsupported',
      ),
    ).toMatchObject({ fallbackText: '[脚注 2 暂无定义]' });
  });

  it('keeps embedded Zhihu reference text when its source URL is unsafe', () => {
    const { document, diagnostics } = normalize(
      '<p><sup data-numero="1" data-text="引用说明" data-url="javascript:alert(1)">[1]</sup></p>',
    );
    expect(document.footnotes?.[0].blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', text: '引用说明' }],
    });
    expect(diagnostics).toContainEqual({
      kind: 'unsafe-url',
      sourceType: 'footnote-source',
    });
    expect(
      [...walkZhihuDocument(document)].filter((node) => node.type === 'link'),
    ).toHaveLength(0);
  });

  it('projects knowledge ranges without destroying nested format runs or bisecting emoji', () => {
    const { document, diagnostics } = normalizeZhihuDocument(
      '<p data-pid="one">前😀<b>知识</b>点后</p>',
      {
        documentId: 'test',
        segmentInfos: [
          {
            pid: 'one',
            text: '前😀知识点后',
            marks: [
              {
                start_index: 1,
                end_index: 3,
                seg_info: { like_count: 2, comment_count: 0, is_like: false },
              },
              { start_index: 3, end_index: 6 },
              { start_index: 4, end_index: 7 },
              { start_index: 2, end_index: 3 },
            ],
          },
        ],
      },
    );
    const nodes = [...walkZhihuDocument(document)];
    expect(nodes.filter((node) => node.type === 'segment')).toHaveLength(2);
    expect(nodes.filter((node) => node.type === 'strong')).toHaveLength(1);
    expect(
      diagnostics.filter((item) => item.kind === 'invalid-range'),
    ).toHaveLength(2);
  });

  it('retains highlight-wrap appearance when interaction metadata is incomplete or invalid', () => {
    const { document, diagnostics } = normalize(
      '<p data-pid="one"><span class="highlight-wrap" data-highlight-pid="one" data-highlight-start-offset="0" data-highlight-end-offset="999"><b>知识点</b></span></p>',
    );
    const run = [...walkZhihuDocument(document)].find(
      (node) => node.type === 'segmentHighlight',
    );
    expect(run).toMatchObject({
      type: 'segmentHighlight',
      children: [{ type: 'strong' }],
    });
    expect(
      run?.type === 'segmentHighlight' && run.highlight?.location,
    ).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ kind: 'invalid-range' });
  });

  it('preserves exact sliced IDs, source maps and zero-length nodes in the boundary fixture', () => {
    const options = { documentId: 'test' };
    const original = normalizeZhihuDocument(
      slicingFixture.content,
      options,
    ).document;
    const paragraph = original.blocks[0];
    if (paragraph.type !== 'paragraph') throw new Error('Expected paragraph');
    const { document, diagnostics } = normalizeZhihuDocument(
      slicingFixture.content,
      {
        ...options,
        segmentInfos: slicingFixture.segment_infos,
      },
    );
    expect(diagnostics).toEqual([]);
    const annotated = document.blocks[0];
    if (annotated.type !== 'paragraph') throw new Error('Expected paragraph');
    expect(
      annotated.children
        .filter((run) => run.type === 'segment')
        .map((run) => run.range),
    ).toEqual(
      slicingFixture.segment_infos[0].marks.map((mark) => ({
        start: mark.start_index,
        end: mark.end_index,
      })),
    );
    const total = slicingFixture.segment_infos[0].text.length;
    let previousEnd = 0;
    const expected: ZhihuInlineRun[] = [];
    for (const run of annotated.children) {
      if (run.type !== 'segment') continue;
      expected.push(
        ...legacySliceRuns(
          paragraph.children,
          previousEnd,
          run.range.start,
          total,
        ),
      );
      expected.push({
        ...run,
        children: legacySliceRuns(
          paragraph.children,
          run.range.start,
          run.range.end,
          total,
        ),
      });
      previousEnd = run.range.end;
    }
    expected.push(
      ...legacySliceRuns(paragraph.children, previousEnd, total, total),
    );
    expect(annotated.children).toEqual(expected);
    const compileOptions = { fontSize: 17, lineHeight: 25.5 };
    const compiled = compileZhihuDocument(document, compileOptions);
    expect(compiled).toEqual(
      compileZhihuDocument(
        { ...document, blocks: [{ ...annotated, children: expected }] },
        compileOptions,
      ),
    );
    const nodes = [...walkZhihuDocument(document)];
    expect(nodes.filter((node) => node.type === 'inlineFormula')).toHaveLength(
      1,
    );
    expect(nodes.filter((node) => node.type === 'inlineImage')).toHaveLength(1);
    expect(nodes.filter((node) => node.type === 'lineBreak')).toHaveLength(2);
  });

  it('matches the previous slicer across deterministic nested partitions', () => {
    let seed = 42;
    const random = (maximum: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % maximum;
    };
    let serial = 0;
    const runs = (depth: number): ZhihuInlineRun[] =>
      Array.from({ length: random(7) + 1 }, (): ZhihuInlineRun => {
        const id = `node:${serial++}`;
        const choice = random(depth < 3 ? 9 : 7);
        if (choice === 0) return { id, type: 'lineBreak' };
        if (choice === 1)
          return { id, type: 'inlineFormula', formula: { latex: 'x' } };
        if (choice === 2)
          return {
            id,
            type: 'unsupported',
            sourceType: 'test',
            fallbackText: '替代',
          };
        if (choice === 3)
          return {
            id,
            type: 'footnoteReference',
            definitionId: 'footnote',
            label: '[1]',
          };
        if (choice === 4) return { id, type: 'inlineCode', text: 'code  ' };
        if (choice === 5) return { id, type: 'text', text: '' };
        if (choice === 6) return { id, type: 'text', text: '甲😀乙' };
        return {
          id,
          type: choice === 7 ? 'strong' : 'emphasis',
          children: runs(depth + 1),
        };
      });
    for (let sample = 0; sample < 200; sample += 1) {
      const input = runs(0);
      const text = legacyInlineText(input);
      const boundaries = [0];
      for (const character of text)
        boundaries.push(boundaries[boundaries.length - 1] + character.length);
      const slice = createInlineRunSlicer(input);
      let index = 0;
      while (index < boundaries.length - 1) {
        const next = Math.min(boundaries.length - 1, index + random(6) + 1);
        const start = boundaries[index];
        const end = boundaries[next];
        expect(slice(start, start)).toEqual([]);
        expect(slice(start, end)).toEqual(
          legacySliceRuns(input, start, end, text.length),
        );
        index = next;
      }
      expect(slice(text.length, text.length)).toEqual([]);
    }
  });

  it('reads dense paragraph text a linear number of times while preserving every slice', () => {
    let textReads = 0;
    const count = 2000;
    const children: ZhihuInlineRun[] = Array.from(
      { length: count },
      (_, index) => ({
        id: `strong:${index}`,
        type: 'strong',
        children: [
          {
            id: `text:${index}`,
            type: 'text',
            get text() {
              textReads += 1;
              return '甲乙';
            },
          },
        ],
      }),
    );
    const slice = createInlineRunSlicer(children);
    const output: ZhihuInlineRun[] = [];
    for (let offset = 0; offset < count * 2; offset += 1)
      output.push(...slice(offset, offset + 1));
    // Bound work independently of wall-clock speed; rescanning every source
    // child for each knowledge boundary would exceed this by orders of magnitude.
    expect(textReads).toBeLessThan(count * 6);
    expect(legacyInlineText(output)).toBe('甲乙'.repeat(count));
  });

  it('accepts only native image data URL media types for self-contained demos', () => {
    const { document, diagnostics } = normalize(
      '<p>A<img src="data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E" width="20" height="20">B<img src="data:text/html,%3Cscript%3E">C</p>',
    );
    expect(
      [...walkZhihuDocument(document)].filter(
        (node) => node.type === 'inlineImage',
      ),
    ).toHaveLength(1);
    expect(diagnostics.some((item) => item.kind === 'unsafe-url')).toBe(true);
  });
});
