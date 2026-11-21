import type { ZhihuBlock, ZhihuDocument, ZhihuInlineRun } from './document';
import {
  createRichContentMetrics,
  RICH_CONTENT_BODY_FONT_SIZE,
  RICH_CONTENT_COMPACT_EMPTY_LINE_SCALE,
  RICH_CONTENT_LIST_ITEM_SPACING,
  RICH_CONTENT_PARAGRAPH_SPACING,
} from './presentation';
import type {
  RichTextAttachment,
  RichTextCompilation,
  RichTextDecoration,
  RichTextFlow,
  RichTextParagraph,
  RichTextPart,
  RichTextSelectionEndpoint,
  RichTextSelectionMapping,
  RichTextSourceRange,
  RichTextSpan,
} from './richText';
import { segmentUnderlineOffset } from './segmentCommentIcon';
import {
  type SegmentDecorationRange,
  segmentCommentMarkers,
} from './segmentHighlight';

export interface RichTextCompilationOptions {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing?: number;
  /** A separately rendered container child can continue its preceding blank. */
  continuesEmptyParagraph?: boolean;
  enableSegmentTap?: boolean;
}

interface FlowBuilder {
  text: string;
  spans: RichTextSpan[];
  paragraphs: RichTextParagraph[];
  decorations: RichTextDecoration[];
  attachments: RichTextAttachment[];
  sourceMap: RichTextSourceRange[];
}

interface ParagraphContext {
  kind?: 'quote' | 'listItem';
  indent?: number;
  prefix?: { text: string; consumed: boolean };
}

const INLINE_SPANS = {
  strong: 'strong',
  emphasis: 'emphasis',
  underline: 'underline',
  strikethrough: 'strikethrough',
  highlight: 'highlight',
  subscript: 'subscript',
  superscript: 'superscript',
  inlineCode: 'code',
  keyboardInput: 'code',
  link: 'link',
} as const;

function newBuilder(): FlowBuilder {
  return {
    text: '',
    spans: [],
    paragraphs: [],
    decorations: [],
    attachments: [],
    sourceMap: [],
  };
}

function contentVersion(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${value.length}:${(hash >>> 0).toString(16)}`;
}

/**
 * Compile semantic content directly to native ranges. Layout spacing is never
 * represented by extra spaces/newlines in the selectable text buffer.
 */
export function compileZhihuDocument(
  document: ZhihuDocument,
  options: RichTextCompilationOptions,
): RichTextCompilation {
  return {
    documentId: document.id,
    parts: [...compileZhihuDocumentParts(document, options)],
    diagnostics: [],
  };
}

/** Yield complete selection buffers and independent blocks in reading order. */
export function* compileZhihuDocumentParts(
  document: ZhihuDocument,
  options: RichTextCompilationOptions,
): Generator<RichTextPart, void> {
  const last = yield* compileZhihuDocumentCursor(document, options);
  if (last) yield last;
}

/** The final part travels with done so a bounded batch can finish on that read. */
export function* compileZhihuDocumentCursor(
  document: ZhihuDocument,
  options: RichTextCompilationOptions,
): Generator<RichTextPart, RichTextPart | undefined> {
  const paragraphOffsets = new Map<string, number>();
  const fontSize =
    Number.isFinite(options.fontSize) && options.fontSize > 0
      ? options.fontSize
      : 17;
  const lineHeight =
    Number.isFinite(options.lineHeight) && options.lineHeight > 0
      ? options.lineHeight
      : fontSize * 1.5;
  const paragraphSpacing =
    options.paragraphSpacing ?? RICH_CONTENT_PARAGRAPH_SPACING;
  const metrics = createRichContentMetrics(
    fontSize / RICH_CONTENT_BODY_FONT_SIZE,
    lineHeight / fontSize,
  );
  let builder = newBuilder();
  let segmentRanges: SegmentDecorationRange[] = [];
  let flowSerial = 0;
  // Keep a standalone block until traversal finds the next paragraph/block, or
  // reaches the end, including through empty containers and footnotes. This
  // identifies a terminal block without compiling the text that follows it.
  let pendingBlock: ZhihuBlock | undefined;

  function takeBlock(block: ZhihuBlock): RichTextPart {
    pendingBlock = undefined;
    return { type: 'block', block };
  }

  function takeFlow(): RichTextPart | undefined {
    let part: RichTextPart | undefined;
    if (builder.text.length) {
      const markers = segmentCommentMarkers(segmentRanges);
      builder.decorations = builder.decorations.map((decoration) =>
        markers.get(decoration.end)?.run.id === decoration.nodeId
          ? { ...decoration, hasComments: true }
          : decoration,
      );
      const identity = JSON.stringify({
        text: builder.text,
        spans: builder.spans,
        paragraphs: builder.paragraphs,
        decorations: builder.decorations,
        attachments: builder.attachments,
      });
      part = {
        type: 'flow',
        flow: {
          id: `${document.id}:flow:${++flowSerial}`,
          textVersion: contentVersion(identity),
          ...builder,
        },
      };
    }
    builder = newBuilder();
    segmentRanges = [];
    return part;
  }

  function append(
    value: string,
    nodeId: string,
    paragraphId: string | undefined,
    sourceOffset: number,
    kind: RichTextSourceRange['kind'],
  ): number {
    const start = builder.text.length;
    builder.text += value;
    const sourceEnd = sourceOffset + (kind === 'text' ? value.length : 0);
    if (value.length)
      builder.sourceMap.push({
        start,
        end: builder.text.length,
        nodeId,
        ...(paragraphId && { paragraphId }),
        sourceStart: sourceOffset,
        sourceEnd,
        kind,
      });
    return sourceEnd;
  }

  function compileInline(
    runs: readonly ZhihuInlineRun[],
    paragraphId: string | undefined,
    initialOffset: number,
  ): number {
    let sourceOffset = initialOffset;
    for (const run of runs) {
      const start = builder.text.length;
      if ('children' in run)
        sourceOffset = compileInline(run.children, paragraphId, sourceOffset);
      else if ('text' in run)
        sourceOffset = append(
          run.text,
          run.id,
          paragraphId,
          sourceOffset,
          'text',
        );
      else if (run.type === 'lineBreak')
        append('\n', run.id, paragraphId, sourceOffset, 'synthetic');
      else if (run.type === 'unsupported')
        sourceOffset = append(
          run.fallbackText,
          run.id,
          paragraphId,
          sourceOffset,
          'text',
        );
      else if (run.type === 'footnoteReference') {
        sourceOffset = append(
          run.label,
          run.id,
          paragraphId,
          sourceOffset,
          'text',
        );
        builder.spans.push({
          start,
          end: builder.text.length,
          nodeId: run.id,
          kind: 'superscript',
        });
        builder.spans.push({
          start,
          end: builder.text.length,
          nodeId: run.id,
          kind: 'link',
          url: `zhihu-rich-footnote:${encodeURIComponent(run.definitionId)}`,
        });
      } else if (run.type === 'inlineImage' || run.type === 'inlineFormula') {
        append('\uFFFC', run.id, paragraphId, sourceOffset, 'attachment');
        const formula = run.type === 'inlineFormula' ? run.formula : undefined;
        const resource =
          run.type === 'inlineImage' ? run.resource : formula?.image;
        const height =
          resource?.height ??
          (run.type === 'inlineImage' ? fontSize * 1.3 : lineHeight * 0.85);
        const latex = formula?.latex;
        const alt = run.type === 'inlineImage' ? run.alt : latex;
        const attachment: RichTextAttachment = {
          id: run.id,
          nodeId: run.id,
          start,
          end: start + 1,
          kind: run.type === 'inlineImage' ? 'image' : 'formula',
          ...(run.type === 'inlineImage' &&
            run.role === 'avatar' && { role: 'avatar' }),
          ...(resource && { url: resource.url }),
          ...(latex && { latex }),
          ...(alt && { alt }),
          ...(resource?.width !== undefined
            ? { width: resource.width }
            : run.type === 'inlineImage' || !resource
              ? {
                  width:
                    run.type === 'inlineImage'
                      ? height
                      : Math.max(
                          fontSize * 1.5,
                          Math.min(
                            fontSize * 12,
                            (latex?.length ?? 5) * fontSize * 0.45,
                          ),
                        ),
                }
              : {}),
          ...(resource?.height !== undefined
            ? { height: resource.height }
            : run.type === 'inlineImage' || !resource
              ? { height }
              : {}),
          // SVG intrinsic vertical-align is resolved by the native attachment
          // loader; leave the baseline unspecified when it is not in the model.
          copyText: latex ?? alt ?? '[图片]',
        };
        builder.attachments.push(attachment);
      }
      const end = builder.text.length;
      if (start === end) continue;
      if (Object.hasOwn(INLINE_SPANS, run.type)) {
        const kind = INLINE_SPANS[run.type as keyof typeof INLINE_SPANS];
        builder.spans.push({
          start,
          end,
          nodeId: run.id,
          kind,
          ...(run.type === 'link' && { url: run.url }),
        });
      }
      if (run.type === 'segment' || run.type === 'segmentHighlight') {
        segmentRanges.push({ start, end, run });
        builder.decorations.push({
          id: `${run.id}:decoration`,
          nodeId: run.id,
          start,
          end,
          kind: 'dashed',
          thickness: 1.2,
          offset: segmentUnderlineOffset,
          ...(options.enableSegmentTap !== false && { actionId: run.id }),
        });
      }
    }
    return sourceOffset;
  }

  function compileParagraph(
    block: Extract<ZhihuBlock, { type: 'paragraph' | 'heading' }>,
    context: ParagraphContext,
    followsEmptyParagraph = false,
  ): void {
    const paragraphId = 'paragraphId' in block ? block.paragraphId : undefined;
    const offsetKey = paragraphId ?? block.id;
    let sourceOffset = paragraphOffsets.get(offsetKey) ?? 0;
    if (builder.text.length) {
      const previous = builder.paragraphs[builder.paragraphs.length - 1];
      append(
        '\n',
        previous?.nodeId ?? block.id,
        previous?.paragraphId,
        previous?.paragraphId
          ? (paragraphOffsets.get(previous.paragraphId) ?? 0)
          : 0,
        'synthetic',
      );
      if (previous)
        builder.paragraphs[builder.paragraphs.length - 1] = {
          ...previous,
          end: builder.text.length,
        };
    }
    const start = builder.text.length;
    if (context.prefix && !context.prefix.consumed) {
      append(
        context.prefix.text,
        block.id,
        paragraphId,
        sourceOffset,
        'synthetic',
      );
      context.prefix.consumed = true;
    }
    // The anchor gives leading/trailing/media-only blank paragraphs a real
    // native range without adding a second newline or a visible character.
    // A pending list marker is visible content and keeps normal typography.
    const emptyLine =
      block.type === 'paragraph' &&
      block.empty === true &&
      builder.text.length === start;
    if (emptyLine)
      append('\u200b', block.id, paragraphId, sourceOffset, 'synthetic');
    else
      sourceOffset = compileInline(block.children, paragraphId, sourceOffset);
    paragraphOffsets.set(offsetKey, sourceOffset);
    const kind =
      block.type === 'heading' ? 'heading' : (context.kind ?? 'paragraph');
    const heading =
      block.type === 'heading'
        ? metrics.headings[`h${block.level}`]
        : undefined;
    builder.paragraphs.push({
      start,
      end: builder.text.length,
      nodeId: block.id,
      ...(paragraphId && { paragraphId }),
      kind,
      ...(block.type === 'heading' && { level: block.level }),
      ...(heading && {
        fontSize: heading.fontSize,
        lineHeight: heading.lineHeight,
      }),
      ...(emptyLine && {
        emptyLine: true,
        lineHeight: followsEmptyParagraph
          ? lineHeight
          : lineHeight * RICH_CONTENT_COMPACT_EMPTY_LINE_SCALE,
      }),
      ...(context.indent && { indent: context.indent }),
      marginTop: heading?.marginTop ?? 0,
      marginBottom:
        emptyLine && !followsEmptyParagraph
          ? 0
          : (heading?.marginBottom ?? paragraphSpacing),
    });
  }

  function* compileBlocks(
    blocks: readonly ZhihuBlock[],
    context: ParagraphContext = {},
    previousEmptyParagraph = false,
  ): Generator<RichTextPart, void> {
    for (const block of blocks) {
      if (block.type === 'paragraph' || block.type === 'heading') {
        if (pendingBlock && block.children.length)
          yield takeBlock(pendingBlock);
        compileParagraph(block, context, previousEmptyParagraph);
        // A childless paragraph can be metadata only, or carry a blank-line
        // anchor or list/footnote marker. Only that second case starts a flow.
        if (pendingBlock && builder.text.length) yield takeBlock(pendingBlock);
      } else if (block.type === 'quote')
        yield* compileBlocks(block.blocks, {
          kind: 'quote',
          indent: (context.indent ?? 0) + fontSize,
          prefix: context.prefix,
        });
      else if (block.type === 'list') {
        // A nested list can precede its parent's own prose. Give the pending
        // parent/footnote marker a semantic row instead of moving it after the
        // nested items or letting their markers overwrite it.
        if (context.prefix && !context.prefix.consumed) {
          if (pendingBlock) yield takeBlock(pendingBlock);
          compileParagraph(
            {
              id: `${block.id}:parent-marker`,
              type: 'paragraph',
              children: [],
            },
            context,
          );
        }
        for (const [index, item] of block.items.entries()) {
          const precedingParagraph = builder.paragraphs.at(-1);
          yield* compileBlocks(item.blocks, {
            kind: 'listItem',
            indent: (context.indent ?? 0) + fontSize * 1.2,
            // Containers share this marker; media does not consume it, and
            // only the first text paragraph in this item displays it.
            prefix: {
              text: block.ordered ? `${(block.start ?? 1) + index}. ` : '• ',
              consumed: false,
            },
          });
          const lastParagraph = builder.paragraphs.at(-1);
          if (
            index < block.items.length - 1 &&
            lastParagraph &&
            lastParagraph !== precedingParagraph
          )
            builder.paragraphs[builder.paragraphs.length - 1] = {
              ...lastParagraph,
              // Compact text-ending items before the next item, retaining
              // normal paragraph spacing within an item and after the list.
              // A trailing media block flushes the builder; its independent
              // geometry must not rewrite the preceding text's paragraph gap.
              marginBottom: RICH_CONTENT_LIST_ITEM_SPACING,
            };
        }
      } else {
        if (pendingBlock) yield takeBlock(pendingBlock);
        const flow = takeFlow();
        if (flow) yield flow;
        pendingBlock = block;
      }
      // Runs are local to sibling paragraphs: media, containers and prose
      // start a new run, including when they split the native text flow.
      previousEmptyParagraph =
        block.type === 'paragraph' && block.empty === true;
    }
  }

  yield* compileBlocks(document.blocks, {}, options.continuesEmptyParagraph);
  if (document.footnotes?.length) {
    for (const definition of document.footnotes)
      yield* compileBlocks(definition.blocks, {
        prefix: { text: `[${definition.label}] `, consumed: false },
      });
  }
  return pendingBlock ? takeBlock(pendingBlock) : takeFlow();
}

function validSelection(
  flow: RichTextFlow,
  start: number,
  end: number,
): boolean {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= end ||
    end > flow.text.length
  )
    return false;
  const splitsSurrogate = (offset: number) =>
    offset > 0 &&
    offset < flow.text.length &&
    /[\uD800-\uDBFF]/.test(flow.text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(flow.text[offset]);
  return !splitsSurrogate(start) && !splitsSurrogate(end);
}

/** Native slots copy semantically; blank-line anchors never enter copied text. */
export function getRichTextSelectionText(
  flow: RichTextFlow,
  start: number,
  end: number,
): string {
  if (!validSelection(flow, start, end)) return '';
  let result = '';
  let cursor = start;
  const replacements = [
    ...flow.attachments,
    ...flow.paragraphs.flatMap((paragraph) =>
      paragraph.emptyLine === true &&
      flow.text[paragraph.start] === '\u200b' &&
      (paragraph.start === 0 || flow.text[paragraph.start - 1] === '\n') &&
      (paragraph.end === flow.text.length ||
        flow.text[paragraph.end - 1] === '\n') &&
      /^\u200b\n?$/.test(flow.text.slice(paragraph.start, paragraph.end))
        ? [{ start: paragraph.start, end: paragraph.start + 1, copyText: '' }]
        : [],
    ),
  ].sort((left, right) => left.start - right.start);
  for (const attachment of replacements) {
    if (attachment.start < start || attachment.end > end) continue;
    if (attachment.start < cursor) continue;
    result += flow.text.slice(cursor, attachment.start) + attachment.copyText;
    cursor = attachment.end;
  }
  return result + flow.text.slice(cursor, end);
}

/** Map a native selection back to source paragraph UTF-16 coordinates. */
export function mapRichTextSelection(
  flow: RichTextFlow,
  start: number,
  end: number,
): RichTextSelectionMapping | null {
  if (!validSelection(flow, start, end)) return null;
  const selectedSource = flow.sourceMap.filter(
    (range) =>
      range.kind !== 'synthetic' && range.start < end && range.end > start,
  );
  if (!selectedSource.length) return null;
  const endpoint = (
    position: number,
    ending: boolean,
  ): RichTextSelectionEndpoint | null => {
    // At boundaries, the start belongs to the next source run and the end to
    // the previous run. Generated paragraph/list separators have no source text.
    const entries = ending ? [...selectedSource].reverse() : selectedSource;
    const entry =
      entries.find(
        (range) =>
          range.kind !== 'synthetic' &&
          (ending
            ? position > range.start && position <= range.end
            : position >= range.start && position < range.end),
      ) ??
      entries.find(
        (range) =>
          range.kind !== 'synthetic' &&
          (ending ? range.end <= position : range.start >= position),
      );
    if (!entry) return null;
    const displacement = Math.min(
      Math.max(position - entry.start, 0),
      entry.sourceEnd - entry.sourceStart,
    );
    return {
      nodeId: entry.nodeId,
      ...(entry.paragraphId && { paragraphId: entry.paragraphId }),
      offset: entry.sourceStart + displacement,
    };
  };
  const mappedStart = endpoint(start, false);
  const mappedEnd = endpoint(end, true);
  if (!mappedStart || !mappedEnd) return null;
  return {
    text: getRichTextSelectionText(flow, start, end),
    start: mappedStart,
    end: mappedEnd,
  };
}
