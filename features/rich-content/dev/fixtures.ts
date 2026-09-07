import type { ZhihuSegmentInfo } from '@/types/zhihu';
import manifestJson from '../fixtures/manifest.json';

type RichContentRendererType = 'answer' | 'article' | 'pin' | 'question';
type JsonRecord = Record<string, unknown>;

interface FixtureManifestCase {
  id: string;
  file: string;
  sourceType: string;
  contentPath: string;
  collectedAt?: string;
  traits: string[];
  expected: Record<string, number>;
}

export type RichContentFixtureSummary = FixtureManifestCase;

export interface RichContentDevFixture extends RichContentFixtureSummary {
  content: string;
  contentArray?: JsonRecord[];
  linkCardInfo?: JsonRecord;
  objectId: string;
  rendererType: RichContentRendererType;
  segmentInfos?: ZhihuSegmentInfo[];
  title?: string;
}

const fixtureContext = __DEV__
  ? require.context('../fixtures/cases', true, /\.json$/)
  : null;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requireString(record: JsonRecord, key: string, context: string) {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value ? value : undefined;
}

function parseExpected(value: unknown, context: string) {
  if (value === undefined) return {};
  const expected = asRecord(value);
  if (!expected) throw new Error(`${context}.expected must be an object`);

  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(expected)) {
    if (typeof count !== 'number') {
      throw new Error(`${context}.expected.${key} must be a number`);
    }
    counts[key] = count;
  }
  return counts;
}

function parseManifest(value: unknown): FixtureManifestCase[] {
  const manifest = asRecord(value);
  if (!manifest || !Array.isArray(manifest.cases)) {
    throw new Error('rich-content fixture manifest must contain cases[]');
  }

  const parsedCases = manifest.cases.map((rawCase, index) => {
    const context = `manifest.cases.${index}`;
    const entry = asRecord(rawCase);
    if (!entry) throw new Error(`${context} must be an object`);

    const traits = entry.traits;
    if (
      !Array.isArray(traits) ||
      !traits.every((item) => typeof item === 'string')
    ) {
      throw new Error(`${context}.traits must be a string array`);
    }

    return {
      id: requireString(entry, 'id', context),
      file: requireString(entry, 'file', context),
      sourceType: requireString(entry, 'sourceType', context),
      contentPath: requireString(entry, 'contentPath', context),
      collectedAt: optionalString(entry, 'collectedAt'),
      traits,
      expected: parseExpected(entry.expected, context),
    };
  });

  const ids = new Set<string>();
  for (const fixtureCase of parsedCases) {
    if (ids.has(fixtureCase.id)) {
      throw new Error(`duplicate rich-content fixture id: ${fixtureCase.id}`);
    }
    ids.add(fixtureCase.id);
  }
  return parsedCases;
}

const fixtureSummaries = parseManifest(manifestJson);

export function getRichContentFixtureSummaries(): RichContentFixtureSummary[] {
  return fixtureSummaries;
}

function getPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

function unwrapModule(value: unknown): unknown {
  const moduleRecord = asRecord(value);
  return moduleRecord && 'default' in moduleRecord
    ? moduleRecord.default
    : value;
}

function getFixtureModuleKey(file: string): string {
  const prefix = './cases/';
  if (!file.startsWith(prefix)) {
    throw new Error(`fixture file must be inside cases/: ${file}`);
  }
  return `./${file.slice(prefix.length)}`;
}

function getRendererType(
  sourceType: string,
  entity: JsonRecord,
): RichContentRendererType {
  const entityType = entity.type;
  if (
    entityType === 'answer' ||
    entityType === 'article' ||
    entityType === 'pin' ||
    entityType === 'question'
  ) {
    return entityType;
  }
  if (sourceType === 'question_feed_card') return 'answer';
  throw new Error(`unsupported rich-content fixture type: ${sourceType}`);
}

function isSegmentReactionInfo(
  value: unknown,
): value is NonNullable<ZhihuSegmentInfo['marks'][number]['seg_info']> {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.like_count === 'number' &&
    typeof record.comment_count === 'number' &&
    typeof record.is_like === 'boolean' &&
    (record.seg_ids === undefined ||
      (Array.isArray(record.seg_ids) &&
        record.seg_ids.every((id) => typeof id === 'string' && id.length > 0)))
  );
}

function isSegmentInfo(value: unknown): value is ZhihuSegmentInfo {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.pid !== 'string' ||
    typeof record.text !== 'string' ||
    !Array.isArray(record.marks)
  ) {
    return false;
  }
  const textLength = record.text.length;

  return record.marks.every((mark) => {
    const markRecord = asRecord(mark);
    if (!markRecord) return false;
    const startIndex = markRecord.start_index;
    const endIndex = markRecord.end_index;
    const hasInteraction =
      isSegmentReactionInfo(markRecord.seg_info) ||
      isSegmentReactionInfo(markRecord.master_seg_info);
    return (
      typeof startIndex === 'number' &&
      Number.isInteger(startIndex) &&
      typeof endIndex === 'number' &&
      Number.isInteger(endIndex) &&
      startIndex >= 0 &&
      endIndex >= startIndex &&
      endIndex <= textLength &&
      hasInteraction &&
      (markRecord.seg_info === undefined ||
        isSegmentReactionInfo(markRecord.seg_info)) &&
      (markRecord.master_seg_info === undefined ||
        isSegmentReactionInfo(markRecord.master_seg_info))
    );
  });
}

function getParagraphIds(content: string) {
  return new Set(
    Array.from(
      content.matchAll(/<p\b[^>]*\bdata-pid=(?:"([^"]+)"|'([^']+)')[^>]*>/gi),
      (match) => match[1] ?? match[2],
    ),
  );
}

function getSegmentInfos(
  entity: JsonRecord,
  content: string,
): ZhihuSegmentInfo[] | undefined {
  const value = entity.segment_infos;
  if (!Array.isArray(value)) return undefined;
  if (!value.every(isSegmentInfo)) {
    throw new Error('fixture segment_infos contains an invalid segment');
  }

  const paragraphIds = getParagraphIds(content);
  const segmentPids = new Set<string>();
  for (const segment of value) {
    if (segmentPids.has(segment.pid)) {
      throw new Error(
        `fixture segment_infos contains duplicate pid: ${segment.pid}`,
      );
    }
    if (!paragraphIds.has(segment.pid)) {
      throw new Error(
        `fixture segment pid is absent from content: ${segment.pid}`,
      );
    }
    segmentPids.add(segment.pid);
  }
  return value;
}

function getObjectId(entity: JsonRecord, fixtureId: string): string {
  const id = entity.id;
  return typeof id === 'string' || typeof id === 'number'
    ? String(id)
    : `fixture-${fixtureId}`;
}

function getFixtureTitle(root: JsonRecord, entity: JsonRecord) {
  const rootTitle = optionalString(root, 'title');
  if (rootTitle) return rootTitle;

  const question = asRecord(entity.question);
  return question ? optionalString(question, 'title') : undefined;
}

export function getRichContentDevFixture(
  fixtureId: string,
): RichContentDevFixture | null {
  if (!__DEV__ || !fixtureContext) return null;

  const summary = fixtureSummaries.find((item) => item.id === fixtureId);
  if (!summary) return null;

  const moduleKey = getFixtureModuleKey(summary.file);
  if (!fixtureContext.keys().includes(moduleKey)) {
    throw new Error(`fixture module not found: ${summary.file}`);
  }

  const rawFixture = unwrapModule(fixtureContext(moduleKey));
  const root = asRecord(rawFixture);
  if (!root) throw new Error(`fixture must be a JSON object: ${summary.file}`);

  const content = getPath(root, summary.contentPath);
  if (typeof content !== 'string') {
    throw new Error(
      `fixture contentPath must resolve to a string: ${summary.contentPath}`,
    );
  }

  const entity =
    summary.sourceType === 'question_feed_card' ? asRecord(root.target) : root;
  if (!entity) throw new Error(`fixture entity not found: ${summary.id}`);

  const contentArray =
    summary.sourceType === 'pin' && Array.isArray(root.content)
      ? root.content.filter(
          (item): item is JsonRecord => asRecord(item) !== null,
        )
      : undefined;

  return {
    ...summary,
    content,
    contentArray,
    linkCardInfo: asRecord(entity.link_card_info) ?? undefined,
    objectId: getObjectId(entity, summary.id),
    rendererType: getRendererType(summary.sourceType, entity),
    segmentInfos: getSegmentInfos(entity, content),
    title: getFixtureTitle(root, entity),
  };
}
