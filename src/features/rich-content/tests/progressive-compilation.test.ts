import {
  compileZhihuDocumentParts,
  mapRichTextSelection,
} from '../compileRichText';
import type { ZhihuDocument, ZhihuParagraphBlock } from '../document';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';

const options = { fontSize: 17, lineHeight: 25.5 };

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
