import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  compileZhihuDocument,
  getRichTextSelectionText,
  mapRichTextSelection,
} from '../compileRichText';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import type { RichTextFlow } from '../richText';

const compile = (html: string) =>
  compileZhihuDocument(
    normalizeZhihuDocument(html, { documentId: 'test' }).document,
    { fontSize: 17, lineHeight: 25.5, paragraphSpacing: 14 },
  );
const firstFlow = (html: string): RichTextFlow => {
  const part = compile(html).parts[0];
  if (part.type !== 'flow') throw new Error('expected first flow');
  return part.flow;
};

describe('Text Flow Island compilation and source ranges', () => {
  it('preserves blank paragraph counts and compacts only the first in each run', () => {
    const flow = firstFlow(
      '<p data-pid="before">前</p><p class="ztext-empty-paragraph"><br></p><p><br></p><p data-pid="after">后</p><p><br></p>',
    );
    expect(flow.paragraphs).toHaveLength(5);
    expect(flow.paragraphs.map((paragraph) => !!paragraph.emptyLine)).toEqual([
      false,
      true,
      true,
      false,
      true,
    ]);
    const [, first, following, , restarted] = flow.paragraphs;
    expect(first.lineHeight).toBeLessThan(following.lineHeight ?? 0);
    expect(first.marginTop).toBe(0);
    expect(first.marginBottom).toBe(0);
    expect(following.marginBottom).toBe(flow.paragraphs[0].marginBottom);
    expect(restarted.lineHeight).toBe(first.lineHeight);
    expect(restarted.marginBottom).toBe(0);
    expect(getRichTextSelectionText(flow, 0, flow.text.length)).toBe(
      '前\n\n\n后\n',
    );
    expect(mapRichTextSelection(flow, 0, flow.text.length)).toMatchObject({
      text: '前\n\n\n后\n',
      start: { paragraphId: 'before', offset: 0 },
      end: { paragraphId: 'after', offset: 1 },
    });
  });

  it('keeps leading, trailing and media-separated blanks as nonempty native ranges', () => {
    const result = compile(
      '<p><br></p><p><br></p><figure><img src="https://example.com/image.png"></figure><p><br></p><p><br></p>',
    );
    expect(result.parts.map((part) => part.type)).toEqual([
      'flow',
      'block',
      'flow',
    ]);
    const flows = result.parts.flatMap((part) =>
      part.type === 'flow' ? [part.flow] : [],
    );
    for (const flow of flows) {
      expect(flow.paragraphs).toHaveLength(2);
      expect(flow.paragraphs.every((paragraph) => paragraph.emptyLine)).toBe(
        true,
      );
      expect(
        flow.paragraphs.every((paragraph) => paragraph.end > paragraph.start),
      ).toBe(true);
      expect(flow.paragraphs[0].lineHeight).toBeLessThan(
        flow.paragraphs[1].lineHeight ?? 0,
      );
      expect(getRichTextSelectionText(flow, 0, flow.text.length)).toBe('\n');
      expect(mapRichTextSelection(flow, 0, flow.text.length)).toBeNull();
    }
  });

  it('keeps visible list markers and real zero-width source characters', () => {
    const flow = firstFlow(
      '<ol><li><p><br></p></li><li>正文</li></ol><p>前\u200b后</p><p><br></p>',
    );
    expect(flow.paragraphs[0].emptyLine).toBeUndefined();
    expect(getRichTextSelectionText(flow, 0, flow.text.length)).toBe(
      '1. \n2. 正文\n前\u200b后\n',
    );
    const blank = flow.paragraphs.at(-1);
    expect(blank?.emptyLine).toBe(true);
    expect(
      blank && getRichTextSelectionText(flow, blank.start, blank.start + 1),
    ).toBe('');
  });

  it('does not strip an untrusted or non-blank range marked as empty', () => {
    const flow = firstFlow('<p>前\u200b后</p>');
    const malformed = {
      ...flow,
      paragraphs: flow.paragraphs.map((paragraph) => ({
        ...paragraph,
        emptyLine: true as const,
      })),
    };
    expect(getRichTextSelectionText(malformed, 0, flow.text.length)).toBe(
      '前\u200b后',
    );
  });

  it('starts independent blank runs inside and outside quotes and list items', () => {
    const flow = firstFlow(
      '<p><br></p><blockquote><p><br></p><p><br></p></blockquote><p><br></p><ul><li><p><br></p></li><li><p><br></p></li></ul><p><br></p>',
    );
    const [
      outside,
      quoteFirst,
      quoteNext,
      afterQuote,
      itemOne,
      itemTwo,
      afterList,
    ] = flow.paragraphs;
    expect(quoteFirst.kind).toBe('quote');
    expect(quoteFirst.lineHeight).toBe(outside.lineHeight);
    expect(quoteNext.lineHeight).toBeGreaterThan(quoteFirst.lineHeight ?? 0);
    expect(afterQuote.lineHeight).toBe(outside.lineHeight);
    expect(itemOne.emptyLine).toBeUndefined();
    expect(itemTwo.emptyLine).toBeUndefined();
    expect(afterList.lineHeight).toBe(outside.lineHeight);
  });

  it('continues a blank run when container children render in separate views', () => {
    const { document } = normalizeZhihuDocument('<p><br></p>', {
      documentId: 'cell',
    });
    const first = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts[0];
    const continued = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
      continuesEmptyParagraph: true,
    }).parts[0];
    if (first.type !== 'flow' || continued.type !== 'flow')
      throw new Error('Expected empty flows');
    expect(continued.flow.paragraphs[0].lineHeight).toBeGreaterThan(
      first.flow.paragraphs[0].lineHeight ?? 0,
    );
    expect(continued.flow.paragraphs[0].marginBottom).toBeGreaterThan(0);
  });

  it('combines headings, paragraphs, lists and quotes while keeping block code independent', () => {
    const compilation = compile(
      '<h2>标题</h2><p>第一段</p><ul><li>列表一</li><li>列表二</li></ul><blockquote><p>引用</p></blockquote><pre>one\n  two</pre>',
    );
    expect(compilation.parts).toHaveLength(2);
    const part = compilation.parts[0];
    expect(part.type === 'flow' && part.flow.text).toBe(
      '标题\n第一段\n• 列表一\n• 列表二\n引用',
    );
    expect(
      part.type === 'flow' &&
        part.flow.paragraphs.map((paragraph) => paragraph.kind),
    ).toEqual(['heading', 'paragraph', 'listItem', 'listItem', 'quote']);
    expect(compilation.parts[1]).toMatchObject({
      type: 'block',
      block: { type: 'code', text: 'one\n  two' },
    });
  });

  it('preserves inline code formatting alongside headings', () => {
    const { document } = normalizeZhihuDocument(
      '<h1>标题一</h1><h6>标题六</h6><p>正文 <code>inline</code></p>',
      { documentId: 'test' },
    );
    const part = compileZhihuDocument(document, {
      fontSize: 25.5,
      lineHeight: 38.25,
    }).parts[0];
    if (part.type !== 'flow') throw new Error('expected flow');
    expect(part.flow.spans.find((span) => span.kind === 'code')).toBeDefined();
  });

  it('splits at independent media while leaving inline attachments in their original flow', () => {
    const compilation = compile(
      '<p>A<img eeimg="1" src="https://example.com/equation" alt="x">B</p><figure><img src="https://example.com/image.png"></figure><p>C</p><table><tr><td>D</td></tr></table><p>E</p>',
    );
    expect(compilation.parts.map((part) => part.type)).toEqual([
      'flow',
      'block',
      'flow',
      'block',
      'flow',
    ]);
    expect(
      compilation.parts[0].type === 'flow' && compilation.parts[0].flow.text,
    ).toBe('A\uFFFCB');
  });

  it('keeps UTF-16 offsets stable around emoji, nested formats and attachment replacement slots', () => {
    const flow = firstFlow(
      '<p data-pid="one"><b>中文😀</b><img eeimg="1" src="https://example.com/equation" alt="x"> 继续</p><p data-pid="two">下一段</p>',
    );
    expect(flow.text).toBe('中文😀\uFFFC 继续\n下一段');
    expect(flow.spans.find((span) => span.kind === 'strong')).toMatchObject({
      start: 0,
      end: 4,
    });
    expect(flow.attachments[0]).toMatchObject({
      start: 4,
      end: 5,
      copyText: 'x',
    });
    expect(
      flow.sourceMap.find((range) => range.kind === 'attachment'),
    ).toMatchObject({
      start: 4,
      end: 5,
      sourceStart: 4,
      sourceEnd: 4,
      paragraphId: 'one',
    });
    expect(mapRichTextSelection(flow, 0, flow.text.length)).toMatchObject({
      text: '中文😀x 继续\n下一段',
      start: { paragraphId: 'one', offset: 0 },
      end: { paragraphId: 'two', offset: 3 },
    });
    expect(mapRichTextSelection(flow, 5, 8)).toMatchObject({
      start: { paragraphId: 'one', offset: 4 },
      end: { paragraphId: 'one', offset: 7 },
    });
    expect(mapRichTextSelection(flow, 3, 4)).toBeNull();
  });

  it('counts explicit br as a displayed line break but not as DOM source text', () => {
    const { document } = normalizeZhihuDocument(
      '<p data-pid="one">前<br>后<b>半句</b></p>',
      {
        documentId: 'test',
        segmentInfos: [
          {
            pid: 'one',
            text: '前后半句',
            marks: [{ start_index: 2, end_index: 4 }],
          },
        ],
      },
    );
    const part = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts[0];
    if (part.type !== 'flow') throw new Error('expected flow');
    expect(part.flow.text).toBe('前\n后半句');
    expect(part.flow.decorations[0]).toMatchObject({
      start: 3,
      end: 5,
      kind: 'dashed',
    });
    expect(mapRichTextSelection(part.flow, 3, 5)).toMatchObject({
      start: { offset: 2 },
      end: { offset: 4 },
    });
    expect(
      part.flow.sourceMap.find((range) => range.kind === 'synthetic'),
    ).toMatchObject({ start: 1, end: 2, sourceStart: 1, sourceEnd: 1 });
  });

  it('keeps visual decorations independent from nested text spans and exposes source action identities', () => {
    const flow = firstFlow(
      '<p><span class="highlight-wrap"><a href="https://example.com">知识<b>重点</b></a></span></p>',
    );
    expect(flow.decorations[0]).toMatchObject({
      start: 0,
      end: 4,
      kind: 'dashed',
      actionId: flow.decorations[0].nodeId,
    });
    expect(flow.spans.map((span) => span.kind)).toEqual(
      expect.arrayContaining(['link', 'strong']),
    );
    expect(flow.decorations[0].nodeId).not.toBe(
      flow.spans.find((span) => span.kind === 'link')?.nodeId,
    );
  });

  it('marks only positive comment counts and disables segment taps without changing selectable text or link hits', () => {
    const { document } = normalizeZhihuDocument(
      '<p data-pid="one"><a href="https://example.com">甲😀</a><span class="highlight-wrap" data-highlight-comment-count="8">乙</span><span class="highlight-wrap" data-highlight-comment-count="2">丙</span><span class="highlight-wrap">丁</span></p>',
      {
        documentId: 'answer:42',
        segmentInfos: [
          {
            pid: 'one',
            text: '甲😀乙丙丁',
            marks: [
              {
                start_index: 0,
                end_index: 3,
                seg_info: { is_like: false, like_count: 1, comment_count: 1 },
              },
              {
                start_index: 3,
                end_index: 4,
                seg_info: { is_like: true, like_count: 1, comment_count: 0 },
              },
            ],
          },
        ],
      },
    );
    for (const enableSegmentTap of [false, true]) {
      const first = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 26,
        enableSegmentTap,
      }).parts[0];
      if (first.type !== 'flow') throw new Error('expected flow');
      const { flow } = first;
      expect(
        flow.decorations
          .filter((d) => d.hasComments)
          .map(({ start, end }) => [start, end]),
      ).toEqual([
        [0, 3],
        [4, 5],
      ]);
      expect(
        flow.decorations.every((d) => Boolean(d.actionId) === enableSegmentTap),
      ).toBe(true);
      expect(flow.spans).toContainEqual(
        expect.objectContaining({ kind: 'link', start: 0, end: 3 }),
      );
      expect(getRichTextSelectionText(flow, 0, flow.text.length)).toBe(
        '甲😀乙丙丁',
      );
      expect(mapRichTextSelection(flow, 1, 4)).toMatchObject({
        text: '😀乙',
        start: { offset: 1 },
        end: { offset: 4 },
      });
    }
  });

  it('maps generated list markers away from business paragraph coordinates', () => {
    const flow = firstFlow(
      '<ol start="3"><li><p data-pid="one">列表</p></li></ol>',
    );
    expect(flow.text).toBe('3. 列表');
    expect(mapRichTextSelection(flow, 0, flow.text.length)).toMatchObject({
      start: { paragraphId: 'one', offset: 0 },
      end: { paragraphId: 'one', offset: 2 },
    });
  });

  it('keeps one item marker through containers and media with stable source offsets', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(
        path.join(
          __dirname,
          '../fixtures/cases/paragraph-list-layout-001.json',
        ),
        'utf8',
      ),
    );
    if (
      fixture === null ||
      typeof fixture !== 'object' ||
      !('content' in fixture) ||
      typeof fixture.content !== 'string'
    )
      throw new Error('Expected the stored list content');
    const parts = compile(fixture.content).parts;
    expect(parts.map((part) => part.type)).toEqual(['flow', 'block', 'flow']);
    const flows = parts
      .filter((part) => part.type === 'flow')
      .map((part) => part.flow);
    expect(flows.map((flow) => flow.text)).toEqual([
      '列表之前\n3. 引用第一段\n引用第二段',
      '4. 图片说明\n5. 最后一项\n同一项的补充段落\n• 嵌套第一项\n• 嵌套第二项\n列表之后',
    ]);
    const quotedStart = flows[0].text.indexOf('引用第二段');
    expect(
      mapRichTextSelection(flows[0], quotedStart, quotedStart + 5),
    ).toMatchObject({
      text: '引用第二段',
      start: { paragraphId: 'quoted-two', offset: 0 },
      end: { paragraphId: 'quoted-two', offset: 5 },
    });
    expect(mapRichTextSelection(flows[1], 0, 7)).toMatchObject({
      text: '4. 图片说明',
      start: { paragraphId: 'image-description', offset: 0 },
      end: { paragraphId: 'image-description', offset: 4 },
    });

    const mediaTail = compile(
      '<ul><li><p>首项</p><img src="https://example.com/item-tail.png"></li><li>次项</li></ul>',
    ).parts;
    expect(mediaTail.map((part) => part.type)).toEqual([
      'flow',
      'block',
      'flow',
    ]);
    expect(mediaTail[0]).toMatchObject({
      flow: { text: '• 首项' },
    });
    const nestedFirst = firstFlow(
      '<ol start="3"><li><ul><li>嵌套首项</li></ul><p data-pid="parent-tail">父项补充</p></li><li>下一项</li></ol>',
    );
    expect(nestedFirst.text).toBe('3. \n• 嵌套首项\n父项补充\n4. 下一项');
    const tailStart = nestedFirst.text.indexOf('父项补充');
    expect(
      mapRichTextSelection(nestedFirst, tailStart, tailStart + 4),
    ).toMatchObject({
      start: { paragraphId: 'parent-tail', offset: 0 },
      end: { paragraphId: 'parent-tail', offset: 4 },
    });
  });

  it('keeps quote paragraph ranges through generated separators and explicit line breaks', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(
        path.join(
          __dirname,
          '../fixtures/cases/quote-paragraph-spacing-001.json',
        ),
        'utf8',
      ),
    );
    if (
      fixture === null ||
      typeof fixture !== 'object' ||
      !('content' in fixture) ||
      typeof fixture.content !== 'string'
    )
      throw new Error('Expected the stored quote content');
    const flow = firstFlow(fixture.content);
    expect(
      flow.paragraphs.map(({ paragraphId, kind, start, end }) => ({
        paragraphId,
        kind,
        start,
        end,
      })),
    ).toEqual([
      {
        paragraphId: 'single-quote',
        kind: 'quote',
        start: 0,
        end: 6,
      },
      {
        paragraphId: 'after-single-quote',
        kind: 'paragraph',
        start: 6,
        end: 17,
      },
      {
        paragraphId: 'long-quote',
        kind: 'quote',
        start: 17,
        end: 78,
      },
      {
        paragraphId: 'trailing-space-quote',
        kind: 'quote',
        start: 78,
        end: 94,
      },
      {
        paragraphId: 'line-break-quote',
        kind: 'quote',
        start: 94,
        end: 107,
      },
      {
        paragraphId: 'after-multiple-quotes',
        kind: 'paragraph',
        start: 107,
        end: 119,
      },
    ]);
    for (const paragraph of flow.paragraphs.filter(
      ({ kind }) => kind === 'quote',
    )) {
      // Native paragraph spans include the generated paragraph separator.
      expect(flow.text[paragraph.end - 1]).toBe('\n');
      expect(
        flow.sourceMap.find(
          ({ start, end, kind }) =>
            start === paragraph.end - 1 &&
            end === paragraph.end &&
            kind === 'synthetic',
        ),
      ).toBeDefined();
    }
    expect(flow.text.slice(78, 94)).toBe('多段引用第二段，末尾留有空白。\n');
    expect(flow.text.slice(94, 107)).toBe('显式换行前\n显式换行后。\n');
    expect(mapRichTextSelection(flow, 94, 106)).toMatchObject({
      text: '显式换行前\n显式换行后。',
      start: { paragraphId: 'line-break-quote', offset: 0 },
      end: { paragraphId: 'line-break-quote', offset: 11 },
    });
  });

  it('keeps the stored article short list formulas in their original sentences without generated paragraph breaks', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(
        path.join(__dirname, '../fixtures/cases/article-formula-heavy.json'),
        'utf8',
      ),
    );
    if (
      fixture === null ||
      typeof fixture !== 'object' ||
      !('content' in fixture) ||
      typeof fixture.content !== 'string'
    )
      throw new Error('Expected the stored article content');
    const parts = compile(fixture.content).parts;
    const flows = parts
      .filter((part) => part.type === 'flow')
      .map((part) => part.flow);
    const text = flows.map((flow) => flow.text).join('\n');
    expect(text).toContain('• 单位矩阵 \uFFFC');
    expect(text).toContain(
      '这个对 \uFFFC 来说“好”的方向对 \uFFFC 也是“好”方向。',
    );
    expect(text).toContain('Cayley-Hamilton定理：\uFFFC 为 \uFFFC 矩阵。');
    expect(
      flows.flatMap((flow) =>
        flow.paragraphs.map((paragraph) =>
          flow.text.slice(paragraph.start, paragraph.end).trim(),
        ),
      ),
    ).not.toContain('\uFFFC');
    expect(flows.flatMap((flow) => flow.attachments)).toHaveLength(345);
    expect(
      parts.filter(
        (part) => part.type === 'block' && part.block.type === 'blockFormula',
      ),
    ).toHaveLength(0);
  });

  it('compiles footnotes with an internal link and one appended definition', () => {
    const flow = firstFlow(
      '<p>前<a class="footnote-ref" data-numero="1">[1]</a>后</p><section class="footnotes"><ol><li data-numero="1"><p>说明</p></li></ol></section>',
    );
    expect(flow.spans.find((span) => span.kind === 'link')?.url).toBe(
      'zhihu-rich-footnote:test%3Afootnote%3A1',
    );
    expect(flow.text).toBe('前[1]后\n[1] 说明');
  });

  it('adds a footnote label once through multiple definition paragraphs or a leading nested list', () => {
    const flow = firstFlow(
      '<p>前<a class="footnote-ref" data-numero="1">[1]</a>后</p><section class="footnotes"><ol><li data-numero="1"><p>说明</p><p>补充说明</p></li></ol></section>',
    );
    expect(flow.text).toBe('前[1]后\n[1] 说明\n补充说明');
    const list = firstFlow(
      '<p>前<a class="footnote-ref" data-numero="1">[1]</a>后</p><section class="footnotes"><ol><li data-numero="1"><ul><li>说明</li></ul><p>补充说明</p></li></ol></section>',
    );
    expect(list.text).toBe('前[1]后\n[1] \n• 说明\n补充说明');
  });

  it('produces stable content versions, changes them with content and rejects invalid selections', () => {
    const flow = firstFlow('<p>正文</p>');
    expect(firstFlow('<p>正文</p>').textVersion).toBe(flow.textVersion);
    expect(firstFlow('<p>更改</p>').textVersion).not.toBe(flow.textVersion);
    expect(getRichTextSelectionText(flow, 0, 2)).toBe('正文');
    expect(getRichTextSelectionText(flow, 0, 20)).toBe('');
    expect(mapRichTextSelection(flow, 1, 1)).toBeNull();
    expect(mapRichTextSelection(flow, -1, 2)).toBeNull();
  });

  it('does not map selections consisting only of a generated paragraph separator', () => {
    const flow = firstFlow('<p data-pid="one">前</p><p data-pid="two">后</p>');
    expect(mapRichTextSelection(flow, 1, 2)).toBeNull();
  });
});
