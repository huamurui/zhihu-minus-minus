import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Element, isTag } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
} from '../dev/fixtureDecoder';
import {
  getZhihuDocumentPreviewImages,
  walkZhihuDocument,
} from '../documentTraversal';
import {
  normalizeZhihuContentSegments,
  normalizeZhihuDocument,
} from '../normalization/normalizeZhihuDocument';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a fixture object');
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected fixture text');
  return value;
}

function fixture(name: string): Record<string, unknown> {
  return object(
    JSON.parse(
      readFileSync(
        path.join(__dirname, '../fixtures/cases', `${name}.json`),
        'utf8',
      ),
    ),
  );
}

function elements(html: string, tag: string): Element[] {
  const result: Element[] = [];
  const visit = (node: Element) => {
    if (node.name === tag) result.push(node);
    for (const child of node.children) if (isTag(child)) visit(child);
  };
  for (const node of parseDocument(html).children) if (isTag(node)) visit(node);
  return result;
}

describe('stored Zhihu dialect fixtures through Native V2 normalization', () => {
  it('retains dense inline formulas and their surrounding text as selectable flow attachments', () => {
    const { document } = normalizeZhihuDocument(
      string(fixture('ios-dense-inline-formulas-001').content),
      { documentId: 'fixture:ios-dense-inline-formulas' },
    );
    const parts = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    }).parts;
    const part = parts[0];
    if (part.type !== 'flow') throw new Error('Expected a text flow');
    expect(part.flow.text).toContain(
      '这样的时间界不会沿一般多项式的时间归约传递',
    );
    expect(part.flow.attachments).toHaveLength(18);
    expect(part.flow.attachments.every((item) => item.kind === 'formula')).toBe(
      true,
    );
    expect(part.flow.attachments[4].latex).toContain('\\sqrt');
    expect(part.flow.attachments[16].copyText).toBe('2^{n^{o(1)}}');
    const sources = part.flow.sourceMap.filter(
      (item) => item.kind !== 'synthetic',
    );
    const firstSource = sources[0];
    const lastSource = sources.at(-1);
    if (!firstSource || !lastSource) throw new Error('Expected source ranges');
    expect(
      mapRichTextSelection(part.flow, 0, part.flow.text.length),
    ).toMatchObject({
      start: { nodeId: firstSource.nodeId, offset: firstSource.sourceStart },
      end: { nodeId: lastSource.nodeId, offset: lastSource.sourceEnd },
    });
    const selectionStart = part.flow.text.indexOf('每个固定的');
    const selectionEnd =
      part.flow.text.indexOf('给定', part.flow.attachments[0].end) + 2;
    expect(selectionStart).toBeGreaterThanOrEqual(0);
    expect(selectionEnd).toBeGreaterThan(part.flow.attachments[0].end);
    expect(
      mapRichTextSelection(part.flow, selectionStart, selectionEnd),
    ).toMatchObject({
      text: '每个固定的 k≥2 ，给定',
      start: { paragraphId: 'paragraph-1' },
      end: { paragraphId: 'paragraph-1' },
    });
    expect(
      part.flow.attachments.every(
        (item) => item.width === undefined && item.height === undefined,
      ),
    ).toBe(true);
  });

  it('normalizes all three stored pin content arrays in sequence without dropping their separate card or images', () => {
    const manifest = parseRichContentFixtureManifest(
      JSON.parse(
        readFileSync(path.join(__dirname, '../fixtures/manifest.json'), 'utf8'),
      ),
    );
    for (const name of [
      'pin-link-card-001',
      'pin-member-mention-muted',
      'pin-topic-tag-001',
    ]) {
      const summary = manifest.find(
        (item) => item.file === `./cases/${name}.json`,
      );
      if (!summary) throw new Error('Expected a stored pin fixture');
      const source = decodeRichContentDevFixture(summary, fixture(name));
      if (!source.contentArray)
        throw new Error('Expected structured pin content');
      const { document } = normalizeZhihuContentSegments(source.contentArray, {
        documentId: `fixture:${name}`,
      });
      const nodes = [...walkZhihuDocument(document)];
      const images = nodes.filter((node) => node.type === 'image');
      const cards = nodes.filter((node) => node.type === 'linkCard');
      const sourceImages = source.contentArray.filter(
        (item) => item.type === 'image',
      );
      expect(images).toHaveLength(sourceImages.length);
      for (const [index, image] of images.entries())
        expect(image.resource).toMatchObject({
          url: sourceImages[index].url,
          width: sourceImages[index].width,
          height: sourceImages[index].height,
        });
      if (name === 'pin-link-card-001') {
        expect(cards).toHaveLength(1);
        expect(document.blocks.at(-1)).toBe(cards[0]);
        expect(cards[0]).toMatchObject({
          url: source.contentArray[1].url,
          title: source.contentArray[1].data_draft_title,
        });
      } else {
        expect(cards).toHaveLength(0);
        const kind =
          name === 'pin-member-mention-muted' ? 'memberMention' : 'topicTag';
        expect(
          nodes.filter((node) => node.type === 'link' && node.kind === kind),
        ).toHaveLength(1);
        expect(document.blocks.slice(-images.length)).toEqual(images);
      }
      const textOnly = normalizeZhihuContentSegments(
        source.contentArray.filter((item) => item.type === 'text'),
        { documentId: `fixture:${name}:text` },
      ).document;
      const compiled = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 25.5,
      });
      const sourceText = compileZhihuDocument(textOnly, {
        fontSize: 17,
        lineHeight: 25.5,
      });
      expect(
        compiled.parts
          .filter((part) => part.type === 'flow')
          .map((part) => part.flow.text),
      ).toEqual(
        sourceText.parts
          .filter((part) => part.type === 'flow')
          .map((part) => part.flow.text),
      );
    }
  });

  it('preserves the source coordinates of every stored answer knowledge mark', () => {
    const manifest = parseRichContentFixtureManifest(
      JSON.parse(
        readFileSync(path.join(__dirname, '../fixtures/manifest.json'), 'utf8'),
      ),
    );
    for (const name of [
      'pig',
      'question-feed-card-heavy',
      'question-feed-card-formula-table-001',
    ]) {
      const summary = manifest.find(
        (item) => item.file === `./cases/${name}.json`,
      );
      if (!summary) throw new Error('Expected the registered answer fixture');
      const source = decodeRichContentDevFixture(summary, fixture(name));
      const { document, diagnostics } = normalizeZhihuDocument(source.content, {
        documentId: `fixture:${name}`,
        segmentInfos: source.segmentInfos,
      });
      const expected = source.segmentInfos?.reduce(
        (count, segment) => count + segment.marks.length,
        0,
      );
      expect(
        diagnostics.filter((item) => item.kind === 'invalid-range'),
      ).toEqual([]);
      const segments = [...walkZhihuDocument(document)].filter(
        (node) => node.type === 'segment',
      );
      expect(segments).toHaveLength(expected ?? 0);
      const compiled = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 25.5,
      });
      for (const segment of segments) {
        const part = compiled.parts.find(
          (item) =>
            item.type === 'flow' &&
            item.flow.decorations.some(
              (decoration) => decoration.nodeId === segment.id,
            ),
        );
        if (part?.type !== 'flow')
          throw new Error('Expected a knowledge text flow');
        const decoration = part.flow.decorations.find(
          (item) => item.nodeId === segment.id,
        );
        if (!decoration)
          throw new Error('Expected knowledge decoration ranges');
        expect(
          mapRichTextSelection(part.flow, decoration.start, decoration.end),
        ).toMatchObject({
          start: {
            paragraphId: segment.paragraphId,
            offset: segment.range.start,
          },
          end: { paragraphId: segment.paragraphId, offset: segment.range.end },
        });
      }
    }
  });

  it('materializes the formula/table fixture reference attributes into nine linked definitions for ten references', () => {
    const envelope = object(
      fixture('question-feed-card-formula-table-001').target,
    );
    const html = string(envelope.content);
    const sources = elements(html, 'sup');
    const { document, diagnostics } = normalizeZhihuDocument(html, {
      documentId: 'fixture:formula-table',
    });
    const references = [...walkZhihuDocument(document)].filter(
      (node) => node.type === 'footnoteReference',
    );
    expect(references).toHaveLength(10);
    expect(document.footnotes).toHaveLength(9);
    expect(diagnostics.some((item) => item.kind === 'missing-footnote')).toBe(
      false,
    );

    for (const source of sources) {
      const definition = document.footnotes?.find(
        (item) => item.label === source.attribs['data-numero'],
      );
      expect(definition?.blocks[0]).toMatchObject({
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: source.attribs['data-url'],
            children: [
              { type: 'text', text: source.attribs['data-text'].trim() },
            ],
          },
        ],
      });
      expect(
        references.some(
          (reference) => reference.definitionId === definition?.id,
        ),
      ).toBe(true);
    }
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    const copiedText = compiled.parts
      .filter((part) => part.type === 'flow')
      .map((part) => part.flow.text)
      .join('\n');
    expect(copiedText).toContain(sources[0].attribs['data-text']);
    expect(copiedText).not.toContain('暂无定义');
  });

  it('recognizes the heavy fixture editor-only card and projects its canonical link, description and nested image metadata', () => {
    const envelope = object(fixture('question-feed-card-heavy').target);
    const html = string(envelope.content);
    const source = elements(html, 'a').find(
      (node) => node.attribs['data-draft-type'] === 'link-card',
    );
    if (!source) throw new Error('Expected the stored editor-only card');
    expect(source.attribs['data-draft-title']).toBeUndefined();
    const metadata = object(envelope.link_card_info);
    const rawCard = metadata[source.attribs.href];
    const cardInfo = object(
      typeof rawCard === 'string' ? JSON.parse(rawCard) : rawCard,
    );
    const display = object(cardInfo.display);
    const { document } = normalizeZhihuDocument(html, {
      documentId: 'fixture:heavy',
      linkCardInfo: metadata,
    });
    const cards = [...walkZhihuDocument(document)].filter(
      (node) => node.type === 'linkCard',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      url: display.card_open_url,
      title: display.title,
      image: { url: object(display.image).image_url },
    });
    expect(cards[0].description).toBe('1998 赞同 · 116 评论 回答');
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(compiled.parts).toContainEqual({ type: 'block', block: cards[0] });
  });

  it('retains all stored inline formula attachments, ordinary images and table/list semantics without duplicating noscript copies', () => {
    for (const [name, expectedFormulas] of [
      ['article-formula-heavy', 345],
      ['question-feed-card-formula-table-001', 78],
    ] as const) {
      const envelope = fixture(name);
      const html = string(
        name === 'article-formula-heavy'
          ? envelope.content
          : object(envelope.target).content,
      );
      const { document } = normalizeZhihuDocument(html, {
        documentId: `fixture:${name}`,
      });
      const nodes = [...walkZhihuDocument(document)];
      expect(
        nodes.filter((node) => node.type === 'inlineFormula'),
      ).toHaveLength(expectedFormulas);
      expect(nodes.filter((node) => node.type === 'blockFormula')).toHaveLength(
        0,
      );
      const compiled = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 25.5,
      });
      const formulas = compiled.parts.flatMap((part) =>
        part.type === 'flow'
          ? part.flow.attachments.filter(
              (attachment) => attachment.kind === 'formula',
            )
          : [],
      );
      expect(formulas).toHaveLength(expectedFormulas);
      expect(
        formulas.every(
          (attachment) => attachment.copyText === attachment.latex,
        ),
      ).toBe(true);
      if (name === 'question-feed-card-formula-table-001') {
        expect(nodes.filter((node) => node.type === 'image')).toHaveLength(14);
        expect(nodes.filter((node) => node.type === 'list')).toHaveLength(11);
        const table = nodes.find((node) => node.type === 'table');
        expect(table?.body).toHaveLength(6);
        expect(table?.body[0].cells.every((cell) => cell.isHeader)).toBe(true);
        expect(table?.body.flatMap((row) => row.cells)).toHaveLength(12);
      }
    }
  });

  it('retains stored member mentions and topics while keeping daily avatars out of the content gallery and hidden source links out of the flow', () => {
    for (const [name, kind] of [
      ['pin-member-mention-muted', 'memberMention'],
      ['pin-topic-tag-001', 'topicTag'],
    ] as const) {
      const { document } = normalizeZhihuDocument(
        string(fixture(name).content_html),
        { documentId: `fixture:${name}` },
      );
      expect(
        [...walkZhihuDocument(document)].filter(
          (node) => node.type === 'link' && node.kind === kind,
        ),
      ).toHaveLength(1);
    }
    const daily = fixture('daily-author-avatar-001');
    const { document } = normalizeZhihuDocument(string(daily.body), {
      documentId: 'fixture:daily',
      variant: 'daily',
    });
    const nodes = [...walkZhihuDocument(document)];
    expect(
      nodes.find((node) => node.type === 'image' && node.role === 'avatar'),
    ).toBeDefined();
    expect(nodes.filter((node) => node.type === 'heading')).toHaveLength(0);
    expect(
      getZhihuDocumentPreviewImages(document).map((image) => image.url),
    ).toEqual(['https://example.com/content.jpg']);
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(JSON.stringify(compiled.parts)).not.toContain('查看原文');
  });
});
