import {
  compileZhihuDocumentParts,
  mapRichTextSelection,
} from '../compileRichText';
import type { ZhihuDocument, ZhihuParagraphBlock } from '../document';
import {
  prepareNativeParts,
  shouldPrepareNativePartsProgressively,
} from '../nativePartPreparation';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';

const options = { fontSize: 17, lineHeight: 25.5 };

it.each([
  [
    'nested prose',
    '<blockquote><ul><li><p>引文</p></li></ul></blockquote>',
    false,
  ],
  [
    'text-only footnote',
    '<section class="footnotes"><ol><li data-numero="1"><p>脚注</p></li></ol></section>',
    false,
  ],
  [
    'divider inside a quoted list',
    '<blockquote><ul><li>引文<hr>后文</li></ul></blockquote>',
    true,
  ],
  [
    'divider inside a footnote',
    '<section class="footnotes"><ol><li data-numero="1"><p>脚注</p><hr><p>续</p></li></ol></section>',
    true,
  ],
] as const)('uses actual flow boundaries for %s', (_name, tail, expected) => {
  const html = `<p>${'首屏'.repeat(3500)}</p>${tail}`;
  const { document } = normalizeZhihuDocument(html, { documentId: 'mixed' });
  const gradual = shouldPrepareNativePartsProgressively(document, html.length);
  expect(gradual).toBe(expected);
  const parts = [...compileZhihuDocumentParts(document, options)];
  expect(parts.some((part) => part.type === 'block')).toBe(expected);
  const { first } = prepareNativeParts(document, options, gradual, 0, false, {
    width: 320,
    height: 640,
    fontScale: 1,
  });
  // A preloaded neighbor can pause its tail indefinitely. A document with just
  // one selectable flow must already be complete when that flow is measured.
  expect(first.done).toBe(!expected);
});

it('pauses at a nested block and resumes with the same source coordinates', () => {
  const read = jest.fn((text: string) => text);
  const paragraph = (id: string, text: string): ZhihuParagraphBlock => ({
    id,
    type: 'paragraph',
    paragraphId: 'source',
    children: [
      {
        id: `${id}-text`,
        type: 'text',
        get text() {
          return read(text);
        },
      },
    ],
  });
  const divider = { id: 'divider', type: 'divider' } as const;
  const document: ZhihuDocument = {
    id: 'answer',
    blocks: [
      {
        id: 'quote',
        type: 'quote',
        blocks: [paragraph('one', '首🙂'), divider, paragraph('two', '尾')],
      },
    ],
    footnotes: [
      {
        id: 'note',
        label: '1',
        blocks: [
          { id: 'note-divider', type: 'divider' },
          paragraph('definition', '脚注'),
        ],
      },
    ],
  };
  const parts = compileZhihuDocumentParts(document, options);
  expect(read).not.toHaveBeenCalled();
  expect(parts.next().value).toMatchObject({
    type: 'flow',
    flow: { id: 'answer:flow:1', text: '首🙂' },
  });
  expect(parts.next().value).toEqual({ type: 'block', block: divider });
  expect(read.mock.calls).toEqual([['首🙂']]);
  const tail = parts.next();
  if (tail.done || tail.value.type !== 'flow') throw new Error('expected tail');
  expect(tail.value.flow.id).toBe('answer:flow:2');
  expect(mapRichTextSelection(tail.value.flow, 0, 1)).toMatchObject({
    text: '尾',
    start: { paragraphId: 'source', offset: 3 },
    end: { paragraphId: 'source', offset: 4 },
  });
  expect(read.mock.calls).toEqual([['首🙂'], ['尾']]);
  expect([...parts]).toMatchObject([
    { type: 'block', block: { id: 'note-divider' } },
    { type: 'flow', flow: { id: 'answer:flow:3', text: '[1] 脚注' } },
  ]);
  expect(read.mock.calls).toEqual([['首🙂'], ['尾'], ['脚注']]);
});

it.each([
  '<p>末段</p>',
  '<p><span></span></p>',
  '<p><a></a></p>',
  '<section class="footnotes"><ol><li data-numero="1"><blockquote><ul><li><hr></li></ul></blockquote></li></ol></section>',
])('finishes on the frame publishing the last part of %s', (ending) => {
  const html = '<hr>'.repeat(17) + ending;
  const normalized = normalizeZhihuDocument(html, { documentId: 'last' });
  const document: ZhihuDocument = {
    ...normalized.document,
    blocks: [
      ...normalized.document.blocks,
      { id: 'empty-heading', type: 'heading', level: 2, children: [] },
    ],
    footnotes: [
      ...(normalized.document.footnotes ?? []),
      {
        id: 'empty',
        label: '2',
        blocks: [{ id: 'empty-quote', type: 'quote', blocks: [] }],
      },
    ],
  };
  // A full viewport on each read makes the initial batch stop after one block.
  // Force the tail budget to expire after one part too, including the final one.
  const clock = jest.spyOn(performance, 'now');
  let ms = 0;
  clock.mockImplementation(() => (ms += 20));
  try {
    const compiled = prepareNativeParts(document, options, true, 0, false, {
      width: 320,
      height: 1,
      fontScale: 1,
    });
    let batch = compiled.first;
    while (!batch.done) {
      const next = compiled.next(batch);
      expect(next.count).toBeGreaterThan(batch.count);
      batch = next;
    }
    expect(batch.groups.flat()).toEqual([
      ...compileZhihuDocumentParts(document, options),
    ]);
  } finally {
    clock.mockRestore();
  }
});

it('preserves an empty heading alongside prose and the marker of an empty footnote paragraph', () => {
  const divider = { id: 'divider', type: 'divider' } as const;
  const { document } = normalizeZhihuDocument('<hr><p data-pid="p">正文</p>', {
    documentId: 'empty-rows',
  });
  const parts = [
    ...compileZhihuDocumentParts(
      {
        ...document,
        blocks: [
          document.blocks[0],
          { id: 'empty-heading', type: 'heading', level: 3, children: [] },
          document.blocks[1],
          divider,
        ],
        footnotes: [
          {
            id: 'note',
            label: '2',
            blocks: [{ id: 'empty-note', type: 'paragraph', children: [] }],
          },
        ],
      },
      options,
    ),
  ];
  expect(parts).toMatchObject([
    { type: 'block' },
    {
      type: 'flow',
      flow: {
        text: '正文',
        paragraphs: [
          { nodeId: 'empty-heading', kind: 'heading', start: 0, end: 0 },
          { paragraphId: 'p', start: 0, end: 2 },
        ],
      },
    },
    { type: 'block', block: divider },
    {
      type: 'flow',
      flow: { text: '[2] ', paragraphs: [{ nodeId: 'empty-note' }] },
    },
  ]);
});

it('reuses a prepared batch when two frames resume the same committed prefix', () => {
  const { document } = normalizeZhihuDocument('<hr>'.repeat(24), {
    documentId: 'retried-frames',
  });
  const compiled = prepareNativeParts(document, options, true, 0, false, {
    width: 320,
    height: 640,
    fontScale: 1,
  });
  let batch = compiled.first;
  expect(batch.done).toBe(false);
  while (!batch.done) {
    const next = compiled.next(batch);
    expect(next).not.toBe(batch);
    expect(compiled.next(batch)).toBe(next);
    batch = next;
  }
  expect(batch.groups.flat()).toEqual([
    ...compileZhihuDocumentParts(document, options),
  ]);
});

it('keeps a long sequence of paragraphs selectable across the whole flow', () => {
  const paragraphs = Array.from({ length: 300 }, (_, index) => `段落${index}`);
  const html = paragraphs
    .map((text, index) => `<p data-pid="p${index}">${text}</p>`)
    .join('');
  const { document } = normalizeZhihuDocument(html, { documentId: 'long' });
  const parts = [...compileZhihuDocumentParts(document, options)];
  expect(parts).toHaveLength(1);
  const [part] = parts;
  if (part.type !== 'flow') throw new Error('expected a selectable flow');
  expect(
    mapRichTextSelection(part.flow, 0, part.flow.text.length),
  ).toMatchObject({
    text: paragraphs.join('\n'),
    start: { paragraphId: 'p0', offset: 0 },
    end: { paragraphId: 'p299', offset: '段落299'.length },
  });
});
