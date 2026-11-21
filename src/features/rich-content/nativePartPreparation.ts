import {
  compileZhihuDocumentCursor,
  type RichTextCompilationOptions,
} from './compileRichText';
import type { ZhihuBlock, ZhihuDocument } from './document';
import { walkZhihuDocument } from './documentTraversal';
import { RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT } from './presentation';
import type { RichTextPart } from './richText';

const FIRST_BATCH_SIZE = 3;
const NEXT_BATCH_SIZE = 6;
const IDLE_BATCH_SIZE = 12;
const FRAME_WORK_MS = 4;

export interface NativePartBatch {
  readonly groups: readonly (readonly RichTextPart[])[];
  readonly count: number;
  readonly done: boolean;
}

const EMPTY_BATCH: NativePartBatch = { groups: [], count: 0, done: false };
// Fixed boundaries preserve mounted views when a metadata refresh recompiles the prefix.
const GROUP_SIZE = 12;

// The compiler folds list and quote prose, including text-only footnotes,
// into the surrounding selectable flow. Only a standalone block ends it.
function hasStandaloneBlock(block: ZhihuBlock): boolean {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return false;
    case 'quote':
      return block.blocks.some(hasStandaloneBlock);
    case 'list':
      return block.items.some((item) => item.blocks.some(hasStandaloneBlock));
    default:
      return true;
  }
}

export function shouldPrepareNativePartsProgressively(
  document: ZhihuDocument,
  sourceLength: number,
): boolean {
  if (document.blocks.length < 12 && sourceLength < 6000) return false;
  return (
    document.blocks.some(hasStandaloneBlock) ||
    !!document.footnotes?.some((note) => note.blocks.some(hasStandaloneBlock))
  );
}

function append(
  previous: NativePartBatch,
  added: RichTextPart[],
  done: boolean,
): NativePartBatch {
  if (!added.length) return { ...previous, done };
  const groups = [...previous.groups];
  const last = groups.at(-1);
  let offset = 0;
  if (last && last.length < GROUP_SIZE) {
    offset = Math.min(added.length, GROUP_SIZE - last.length);
    groups[groups.length - 1] = [...last, ...added.slice(0, offset)];
  }
  for (; offset < added.length; offset += GROUP_SIZE) {
    groups.push(added.slice(offset, offset + GROUP_SIZE));
  }
  return { groups, count: previous.count + added.length, done };
}

interface ViewportEstimate {
  width: number;
  height: number;
  fontScale: number;
}

function estimatedHeight(
  part: RichTextPart,
  options: RichTextCompilationOptions,
  viewport: ViewportEstimate,
) {
  const line = options.lineHeight * viewport.fontScale;
  if (part.type === 'flow') {
    const columns = Math.max(
      1,
      viewport.width / (options.fontSize * viewport.fontScale),
    );
    return (
      Math.max(
        part.flow.paragraphs.length,
        Math.ceil(part.flow.text.length / columns),
      ) * line
    );
  }
  const block = part.block;
  if (block.type === 'image' && block.role !== 'avatar') {
    const { width, height } = block.resource;
    if (!width || !height) return RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT;
    const displayWidth =
      block.layout === 'small'
        ? Math.min(width, viewport.width)
        : viewport.width;
    return (displayWidth * height) / width;
  }
  return block.type === 'video' ? (viewport.width * 9) / 16 : line;
}

/** Local attachments keep their public identity in the document and gallery. */
function offlineAttachmentUris(document: ZhihuDocument) {
  const uris = new Map<string, string>();
  for (const node of walkZhihuDocument(document)) {
    const resource =
      node.type === 'inlineImage'
        ? node.resource
        : node.type === 'inlineFormula'
          ? node.formula.image
          : undefined;
    if (resource?.offlineUri) uris.set(node.id, resource.offlineUri);
  }
  return uris;
}

function resolveLocalPart(
  part: RichTextPart,
  localUris: ReadonlyMap<string, string> | undefined,
): RichTextPart {
  if (part.type !== 'flow' || !localUris?.size || !part.flow.attachments.length)
    return part;
  return {
    type: 'flow',
    flow: {
      ...part.flow,
      attachments: part.flow.attachments.map((attachment) => {
        const uri = localUris.get(attachment.nodeId);
        return uri ? { ...attachment, url: uri } : attachment;
      }),
    },
  };
}

export function prepareNativeParts(
  document: ZhihuDocument,
  options: RichTextCompilationOptions,
  gradual: boolean,
  previouslyMounted: number,
  resolveLocalUris: boolean,
  viewport: ViewportEstimate,
) {
  const iterator = compileZhihuDocumentCursor(document, options);
  const localUris = resolveLocalUris
    ? offlineAttachmentUris(document)
    : undefined;

  function read(
    previous: NativePartBatch,
    maxNewParts: number,
    budget?: { until: number } | { viewport: ViewportEstimate },
  ): NativePartBatch {
    const added: RichTextPart[] = [];
    let estimated = 0;
    while (added.length < maxNewParts) {
      const item = iterator.next();
      if (item.value) added.push(resolveLocalPart(item.value, localUris));
      if (item.done) return append(previous, added, true);
      if (budget && 'until' in budget && performance.now() >= budget.until)
        break;
      if (budget && 'viewport' in budget) {
        estimated += estimatedHeight(item.value, options, budget.viewport);
        if (estimated >= budget.viewport.height) break;
      }
    }
    return append(previous, added, false);
  }

  const first = read(
    EMPTY_BATCH,
    gradual ? previouslyMounted || FIRST_BATCH_SIZE : Infinity,
    gradual && !previouslyMounted ? { viewport } : undefined,
  );
  let prepared = first;
  return {
    first,
    next(previous: NativePartBatch, allowLargerBatch = false) {
      // A frame can retry the same committed prefix before React publishes its tail.
      if (previous === prepared && !prepared.done) {
        prepared = read(
          previous,
          allowLargerBatch ? IDLE_BATCH_SIZE : NEXT_BATCH_SIZE,
          {
            until: performance.now() + FRAME_WORK_MS,
          },
        );
      }
      return prepared;
    },
  };
}
