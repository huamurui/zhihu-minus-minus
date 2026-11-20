import type {
  ZhihuSegmentInfo,
  ZhihuSegmentMark,
  ZhihuSegmentReaction,
} from '@/types/zhihu';
import type { TextSelectionInfo } from './bridge';
import { mapRichTextSelection } from './compileRichText';
import type {
  ZhihuNativeContentSelection,
  ZhihuNativeSegmentAction,
} from './components/ZhihuNativeContent';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuInlineRun,
  ZhihuParagraphBlock,
} from './document';
import { walkZhihuDocument } from './documentTraversal';
import type { RichTextFlow, RichTextParagraph } from './richText';
import type { SegmentDecorationRange } from './segmentHighlight';
import type { RichContentObjectType } from './types';

export interface NativeAnswerSegmentContext {
  readonly objectId: string;
  readonly type: RichContentObjectType;
  readonly segmentInfos?: readonly ZhihuSegmentInfo[];
  readonly document?: ZhihuDocument;
}

/** Matches the existing paragraph menu's interaction shape. */
export interface NativeAnswerSegmentInteraction {
  readonly pid: string;
  readonly segment: ZhihuSegmentInfo;
  readonly interaction: ZhihuSegmentReaction & {
    readonly mark: ZhihuSegmentMark;
  };
}

function isBusinessId(value: unknown): value is string {
  // Answer and segment IDs in the API fixtures are decimal strings. Reject
  // generated renderer IDs and synthetic demo IDs rather than guessing targets.
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function hasSegmentIds(value: unknown): value is string | readonly string[] {
  return typeof value === 'string'
    ? value.split(',').every((id) => isBusinessId(id.trim()))
    : Array.isArray(value) &&
        value.length > 0 &&
        Array.from(value).every(isBusinessId);
}

function isSingleParagraphReaction(reaction: ZhihuSegmentReaction): boolean {
  if (!('is_span' in reaction)) return true;
  // API metadata can describe one thread spanning several paragraph marks.
  // Our answer mutation adapter has only one start/end PID for a clicked mark.
  return (
    reaction.is_span === undefined ||
    reaction.is_span === false ||
    reaction.is_span === 0 ||
    reaction.is_span === 'false' ||
    reaction.is_span === '0'
  );
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function bisectsSurrogate(text: string, offset: number): boolean {
  return (
    offset > 0 &&
    offset < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[offset])
  );
}

interface SourceLeaf {
  readonly nodeId: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface SourceParagraph {
  readonly block: ZhihuParagraphBlock;
  readonly pid: string;
  readonly text: string;
  readonly leaves: readonly SourceLeaf[];
  readonly annotations: readonly SegmentDecorationRange[];
}

/** Keep barriers in document order so two flows cannot jump over a media block. */
function sourceParagraphs(document: ZhihuDocument): (SourceParagraph | null)[] {
  const pidCounts = new Map<string, number>();
  for (const node of walkZhihuDocument(document)) {
    if (
      (node.type === 'paragraph' || node.type === 'heading') &&
      node.paragraphId
    )
      pidCounts.set(
        node.paragraphId,
        (pidCounts.get(node.paragraphId) ?? 0) + 1,
      );
  }

  function paragraph(block: ZhihuParagraphBlock): SourceParagraph | null {
    const pid = block.paragraphId;
    if (!pid?.trim() || pid !== pid.trim() || pidCounts.get(pid) !== 1)
      return null;
    let text = '';
    const leaves: SourceLeaf[] = [];
    const annotations: SegmentDecorationRange[] = [];
    const nodeIds = new Set<string>();
    function append(runs: readonly ZhihuInlineRun[]): boolean {
      for (const run of runs) {
        if (!run.id || nodeIds.has(run.id)) return false;
        nodeIds.add(run.id);
        const start = text.length;
        if ('children' in run) {
          if (!append(run.children)) return false;
          if (run.type === 'segment' || run.type === 'segmentHighlight')
            annotations.push({ run, start, end: text.length });
        } else if (run.type === 'text' || run.type === 'inlineCode') {
          text += run.text;
          if (run.text.length)
            leaves.push({
              nodeId: run.id,
              start,
              end: text.length,
              text: run.text,
            });
        } else {
          // DOM attachments, explicit br, footnotes and fallback text do not
          // provide the paragraph source contract required by answer APIs.
          return false;
        }
      }
      return true;
    }
    return append(block.children)
      ? { block, pid, text, leaves, annotations }
      : null;
  }

  const result: (SourceParagraph | null)[] = [];
  function visit(blocks: readonly ZhihuBlock[]): void {
    for (const block of blocks) {
      if (block.type === 'paragraph') result.push(paragraph(block));
      else if (block.type === 'quote') visit(block.blocks);
      else result.push(null);
    }
  }
  visit(document.blocks);
  return result;
}

function matchesApiSource(
  paragraph: SourceParagraph,
  segmentInfos: readonly ZhihuSegmentInfo[] | undefined,
): boolean {
  const matches =
    segmentInfos?.filter((info) => info.pid === paragraph.pid) ?? [];
  return (
    matches.length === 0 ||
    (matches.length === 1 && matches[0].text === paragraph.text)
  );
}

/** Plain, unambiguous source paragraphs for exact WebView hit targets. */
export function getWebViewSegmentParagraphs(document: ZhihuDocument) {
  const paragraphs = new Map<
    string,
    Pick<SourceParagraph, 'text' | 'annotations'>
  >();
  for (const paragraph of sourceParagraphs(document)) {
    if (paragraph?.annotations.length) paragraphs.set(paragraph.pid, paragraph);
  }
  return paragraphs;
}

function resolveHtmlHighlight(
  action: ZhihuNativeSegmentAction,
  context: NativeAnswerSegmentContext,
): NativeAnswerSegmentInteraction | null {
  if (!context.document) return null;
  const paragraph = sourceParagraphs(context.document).find(
    (item) => item?.pid === action.paragraphId,
  );
  if (!paragraph || !matchesApiSource(paragraph, context.segmentInfos))
    return null;
  const annotations = paragraph.annotations.filter(
    (item) =>
      item.run.id === action.nodeId && item.run.type === 'segmentHighlight',
  );
  if (annotations.length !== 1) return null;
  const annotation = annotations[0];
  if (annotation.run.type !== 'segmentHighlight') return null;
  const metadata = annotation.run.highlight;
  const location = metadata?.location;
  const reaction = metadata?.reaction;
  if (
    metadata?.isSpan === true ||
    (metadata?.target &&
      (metadata.target.contentType !== 'answer' ||
        metadata.target.contentId !== context.objectId)) ||
    (location &&
      (location.paragraphId !== paragraph.pid ||
        location.range.start !== action.start ||
        location.range.end !== action.end)) ||
    annotation.start !== action.start ||
    annotation.end !== action.end ||
    paragraph.text.slice(action.start, action.end) !== action.text ||
    bisectsSurrogate(paragraph.text, action.start) ||
    bisectsSurrogate(paragraph.text, action.end)
  )
    return null;

  // HTML can nest a visual highlight inside the API mark. iOS may hit that
  // inner decoration first; its missing HTML attributes must not hide the
  // current API reaction. Only reuse the exact verified source range, never a
  // neighboring mark or the HTML display text/IDs.
  const apiParagraphs = context.segmentInfos?.filter(
    (item) => item.pid === paragraph.pid,
  );
  if (
    apiParagraphs?.some((item) =>
      item.marks.some(
        (mark) =>
          mark.start_index === action.start && mark.end_index === action.end,
      ),
    )
  )
    return resolveApiAnswerSegment(action, context);

  if (
    metadata?.target?.contentType !== 'answer' ||
    metadata.target.contentId !== context.objectId ||
    !hasSegmentIds(metadata.segmentIds) ||
    !location ||
    !reaction ||
    typeof reaction.isLiked !== 'boolean' ||
    !isCount(reaction.likeCount) ||
    !isCount(reaction.commentCount)
  )
    return null;

  const info: ZhihuSegmentReaction = {
    seg_ids: [...metadata.segmentIds],
    is_like: reaction.isLiked,
    like_count: reaction.likeCount,
    comment_count: reaction.commentCount,
  };
  const mark: ZhihuSegmentMark = {
    start_index: action.start,
    end_index: action.end,
    seg_info: info,
  };
  return {
    pid: paragraph.pid,
    segment: { pid: paragraph.pid, text: paragraph.text, marks: [mark] },
    interaction: { ...info, mark },
  };
}

/**
 * Resolve only the clicked API mark. A visual highlight, a neighboring liked
 * mark, or a renderer node ID cannot supply an answer-reaction target.
 *
 * An HTML highlight may reuse an exact current API mark, or use its own complete
 * IDs and verified source location. Unresolved/cross-paragraph highlights retain
 * only local actions.
 */
export function resolveNativeAnswerSegment(
  action: ZhihuNativeSegmentAction,
  context: NativeAnswerSegmentContext,
): NativeAnswerSegmentInteraction | null {
  if (context.type !== 'answer' || !isBusinessId(context.objectId)) return null;
  const run = action.segment;
  if (
    !run ||
    !action.nodeId ||
    run.id !== action.nodeId ||
    !action.paragraphId?.trim() ||
    !Number.isSafeInteger(action.start) ||
    !Number.isSafeInteger(action.end) ||
    action.start < 0 ||
    action.end <= action.start ||
    !action.text.trim()
  )
    return null;
  if (run.type === 'segmentHighlight')
    return resolveHtmlHighlight(action, context);
  if (
    run.paragraphId !== action.paragraphId ||
    run.range.start !== action.start ||
    run.range.end !== action.end
  )
    return null;

  return resolveApiAnswerSegment(action, context);
}

/** Resolve the exact current API mark regardless of the clicked visual wrapper. */
function resolveApiAnswerSegment(
  action: ZhihuNativeSegmentAction,
  context: NativeAnswerSegmentContext,
): NativeAnswerSegmentInteraction | null {
  const paragraphs =
    context.segmentInfos?.filter(
      (segment) => segment.pid === action.paragraphId,
    ) ?? [];
  if (paragraphs.length !== 1) return null;
  const segment = paragraphs[0];
  if (
    action.end > segment.text.length ||
    bisectsSurrogate(segment.text, action.start) ||
    bisectsSurrogate(segment.text, action.end) ||
    !action.text.trim() ||
    segment.text.slice(action.start, action.end) !== action.text
  )
    return null;

  const marks = segment.marks.filter(
    (mark) =>
      mark.start_index === action.start && mark.end_index === action.end,
  );
  if (marks.length !== 1) return null;
  const mark = marks[0];
  const reaction =
    mark.seg_info?.is_like === true
      ? mark.seg_info
      : mark.master_seg_info?.is_like === true
        ? mark.master_seg_info
        : (mark.master_seg_info ?? mark.seg_info);
  if (
    !reaction ||
    !isSingleParagraphReaction(reaction) ||
    typeof reaction.is_like !== 'boolean' ||
    !isCount(reaction.like_count) ||
    !isCount(reaction.comment_count) ||
    !hasSegmentIds(reaction.seg_ids)
  )
    return null;

  return {
    pid: segment.pid,
    segment,
    interaction: {
      like_count: reaction.like_count,
      comment_count: reaction.comment_count,
      is_like: reaction.is_like,
      seg_ids: Array.isArray(reaction.seg_ids)
        ? [...reaction.seg_ids]
        : reaction.seg_ids,
      mark,
    },
  };
}

/** Share an explicit cross-paragraph copy label only within the same real thread. */
export function getNativeHighlightDisplayText(
  action: ZhihuNativeSegmentAction,
  document: ZhihuDocument,
): string | null {
  if (action.segment?.type !== 'segmentHighlight') return null;
  const nodes = [...walkZhihuDocument(document)].filter(
    (node) => node.type === 'segmentHighlight',
  );
  const clicked = nodes.filter((node) => node.id === action.nodeId);
  if (clicked.length !== 1) return null;
  const metadata = clicked[0].highlight;
  if (metadata?.displayText?.trim()) return metadata.displayText;
  const target = metadata?.target;
  const ids = metadata?.segmentIds;
  if (
    target &&
    isBusinessId(target.contentId) &&
    hasSegmentIds(ids) &&
    Array.isArray(ids)
  ) {
    const groupKey = [...new Set(ids)].sort().join(',');
    const labels = new Set<string>();
    for (const node of nodes) {
      const other = node.highlight;
      if (
        other?.target?.contentId === target.contentId &&
        other.target.contentType === target.contentType &&
        hasSegmentIds(other.segmentIds) &&
        Array.isArray(other.segmentIds) &&
        [...new Set(other.segmentIds)].sort().join(',') === groupKey &&
        other.displayText?.trim()
      )
        labels.add(other.displayText);
    }
    if (labels.size === 1) return [...labels][0];
  }
  return action.text.trim() ? action.text : null;
}

export interface NativeAnswerSelectionContext
  extends NativeAnswerSegmentContext {
  readonly document: ZhihuDocument;
}

function flowParagraph(
  flow: RichTextFlow,
  paragraph: SourceParagraph,
): RichTextParagraph | null {
  const matches = flow.paragraphs.filter(
    (item) => item.paragraphId === paragraph.pid,
  );
  if (matches.length !== 1) return null;
  const item = matches[0];
  return item.nodeId === paragraph.block.id &&
    (item.kind === 'paragraph' || item.kind === 'quote') &&
    Number.isSafeInteger(item.start) &&
    Number.isSafeInteger(item.end) &&
    item.start >= 0 &&
    item.end >= item.start + paragraph.text.length &&
    item.end <= flow.text.length &&
    flow.text.slice(item.start, item.start + paragraph.text.length) ===
      paragraph.text
    ? item
    : null;
}

/**
 * Bridge only a verified source-text selection to the existing answer API.
 * Native copy remains available when this conservative business adapter rejects
 * media, generated markers, missing/duplicate PIDs, or unsupported structures.
 */
export function resolveNativeAnswerSelection(
  selection: ZhihuNativeContentSelection,
  flow: RichTextFlow,
  context: NativeAnswerSelectionContext,
): TextSelectionInfo | null {
  if (
    context.type !== 'answer' ||
    !isBusinessId(context.objectId) ||
    selection.flowId !== flow.id ||
    selection.textVersion !== flow.textVersion ||
    !flow.id.startsWith(`${context.document.id}:flow:`) ||
    !selection.mapping
  )
    return null;
  const mapped = mapRichTextSelection(flow, selection.start, selection.end);
  if (
    !mapped?.text.trim() ||
    !mapped.start.paragraphId ||
    !mapped.end.paragraphId ||
    mapped.text !== selection.mapping.text ||
    mapped.start.nodeId !== selection.mapping.start.nodeId ||
    mapped.start.paragraphId !== selection.mapping.start.paragraphId ||
    mapped.start.offset !== selection.mapping.start.offset ||
    mapped.end.nodeId !== selection.mapping.end.nodeId ||
    mapped.end.paragraphId !== selection.mapping.end.paragraphId ||
    mapped.end.offset !== selection.mapping.end.offset ||
    flow.attachments.some(
      (item) => item.start < selection.end && item.end > selection.start,
    )
  )
    return null;

  const paragraphs = sourceParagraphs(context.document);
  let paragraphIndex = paragraphs.findIndex(
    (item) => item?.pid === mapped.start.paragraphId,
  );
  let paragraph = paragraphs[paragraphIndex];
  if (!paragraph || !matchesApiSource(paragraph, context.segmentInfos))
    return null;
  let sourceOffset = mapped.start.offset;
  let nativeOffset = selection.start;
  let text = '';
  const ranges = flow.sourceMap.filter(
    (item) => item.start < selection.end && item.end > selection.start,
  );
  if (
    !ranges.length ||
    ranges[0].kind !== 'text' ||
    ranges[ranges.length - 1].kind !== 'text'
  )
    return null;

  for (const range of ranges) {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      !Number.isSafeInteger(range.sourceStart) ||
      !Number.isSafeInteger(range.sourceEnd) ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > flow.text.length ||
      range.sourceStart < 0 ||
      range.sourceEnd < range.sourceStart ||
      range.paragraphId !== paragraph.pid
    )
      return null;
    const start = Math.max(range.start, selection.start);
    const end = Math.min(range.end, selection.end);
    if (start !== nativeOffset) return null;
    const nativeParagraph = flowParagraph(flow, paragraph);
    if (!nativeParagraph) return null;

    if (range.kind === 'text') {
      const leaves = paragraph.leaves.filter(
        (item) => item.nodeId === range.nodeId,
      );
      if (leaves.length !== 1) return null;
      const leaf = leaves[0];
      const fragmentStart = range.sourceStart + start - range.start;
      const fragmentEnd = range.sourceStart + end - range.start;
      if (
        range.sourceStart !== leaf.start ||
        range.sourceEnd !== leaf.end ||
        range.end - range.start !== leaf.text.length ||
        range.start !== nativeParagraph.start + leaf.start ||
        flow.text.slice(range.start, range.end) !== leaf.text ||
        fragmentStart !== sourceOffset
      )
        return null;
      text += paragraph.text.slice(fragmentStart, fragmentEnd);
      sourceOffset = fragmentEnd;
    } else if (range.kind === 'synthetic') {
      const next = paragraphs[paragraphIndex + 1];
      const nextNative = next && flowParagraph(flow, next);
      if (
        !next ||
        !nextNative ||
        !matchesApiSource(next, context.segmentInfos) ||
        sourceOffset !== paragraph.text.length ||
        range.nodeId !== paragraph.block.id ||
        range.sourceStart !== sourceOffset ||
        range.sourceEnd !== sourceOffset ||
        range.start !== nativeParagraph.start + paragraph.text.length ||
        range.end !== range.start + 1 ||
        start !== range.start ||
        end !== range.end ||
        nativeParagraph.end !== range.end ||
        nextNative.start !== range.end ||
        flow.text.slice(range.start, range.end) !== '\n'
      )
        return null;
      text += '\n';
      paragraphIndex += 1;
      paragraph = next;
      sourceOffset = 0;
    } else return null;
    nativeOffset = end;
  }

  if (
    nativeOffset !== selection.end ||
    paragraph.pid !== mapped.end.paragraphId ||
    sourceOffset !== mapped.end.offset ||
    text !== mapped.text
  )
    return null;
  return {
    text,
    startParagraphId: mapped.start.paragraphId,
    endParagraphId: mapped.end.paragraphId,
    startOffset: mapped.start.offset,
    endOffset: mapped.end.offset,
  };
}
