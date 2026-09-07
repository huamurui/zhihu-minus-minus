import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const OPEN_TAG_PATTERN = /<([a-z][a-z0-9-]*)(?:\s|\/?>)/gi;
const JSON_FIXTURE_EXTENSION = '.json';
const MISSING_VALUE = Symbol('missing-fixture-value');

function countMatches(value, pattern) {
  return Array.from(value.matchAll(pattern)).length;
}

function getOpeningTags(html) {
  const tags = {};
  for (const match of html.matchAll(OPEN_TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    tags[tag] = (tags[tag] ?? 0) + 1;
  }
  return tags;
}

export function normalizeFixtureHtml(rawBlock) {
  const trimmed = rawBlock.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Some captured API values only escape attribute quotes and are not a
      // complete JSON string. Fall through to the conservative normalization.
    }
  }
  return trimmed.replaceAll('\\"', '"').replaceAll('\\/', '/');
}

function getFixtureValue(value, selector) {
  if (!selector) return value;

  return selector.split('.').reduce((current, segment) => {
    if (
      current === null ||
      current === undefined ||
      !(segment in Object(current))
    ) {
      return MISSING_VALUE;
    }
    return current[segment];
  }, value);
}

function formatFixtureValue(value) {
  if (value === MISSING_VALUE) return '<missing>';
  if (value === undefined) return '<undefined>';
  return JSON.stringify(value);
}

function fixtureValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) && fixtureValuesEqual(left[key], right[key]),
  );
}

export function compareExpectedMetadata(document, expected = {}) {
  return Object.entries(expected).flatMap(([selector, expectedValue]) => {
    const actualValue = getFixtureValue(document, selector);
    return fixtureValuesEqual(actualValue, expectedValue)
      ? []
      : [
          `metadata.${selector}: expected ${formatFixtureValue(expectedValue)}, received ${formatFixtureValue(actualValue)}`,
        ];
  });
}

async function loadFixtureSource(filePath, contentPath) {
  const raw = await readFile(filePath, 'utf8');
  if (path.extname(filePath).toLowerCase() !== JSON_FIXTURE_EXTENSION) {
    throw new Error(`Fixture must be a JSON API envelope: ${filePath}`);
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON fixture ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const selectedContentPath =
    contentPath ??
    (getFixtureValue(document, 'type') === 'question_feed_card'
      ? 'target.content'
      : 'content');
  const selectedContent = getFixtureValue(document, selectedContentPath);
  if (typeof selectedContent !== 'string') {
    throw new Error(
      `JSON fixture ${filePath} must contain string content at ${selectedContentPath}`,
    );
  }

  return { content: normalizeFixtureHtml(selectedContent), document };
}

export function analyzeHtml(html) {
  const tags = getOpeningTags(html);
  const activeHtml = html.replace(
    /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
    '',
  );
  const activeTags = getOpeningTags(activeHtml);
  const formulaImages = Array.from(
    activeHtml.matchAll(/<img\b[^>]*>/gi),
  ).filter(
    ([tag]) =>
      /\beeimg=(?:"|')?[12](?:"|')?/i.test(tag) ||
      /zhihu\.com\/equation\?/i.test(tag),
  ).length;

  return {
    characters: html.length,
    bytes: Buffer.byteLength(html),
    paragraphs: activeTags.p ?? 0,
    headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce(
      (total, tag) => total + (activeTags[tag] ?? 0),
      0,
    ),
    figures: activeTags.figure ?? 0,
    figcaptions: activeTags.figcaption ?? 0,
    lists: (activeTags.ul ?? 0) + (activeTags.ol ?? 0),
    totalImages: tags.img ?? 0,
    activeImages: activeTags.img ?? 0,
    formulaImages,
    noscripts: tags.noscript ?? 0,
    videoBoxes: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bvideo-box\b[^"']*(?:"|')[^>]*>/gi,
    ),
    linkCards: countMatches(
      activeHtml,
      /<a\b[^>]*(?:data-draft-type=(?:"|')link-card(?:"|')|class=(?:"|')[^"']*\bLinkCard\b[^"']*(?:"|'))[^>]*>/gi,
    ),
    memberMentions: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bmember_mention\b[^"']*(?:"|')[^>]*>/gi,
    ),
    topicTags: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bhash_tag\b[^"']*(?:"|')[^>]*>/gi,
    ),
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getFixtureEntity(document, sourceType) {
  if (!isRecord(document)) return null;
  if (sourceType === 'question_feed_card') {
    return isRecord(document.target) ? document.target : null;
  }
  return document;
}

function getParagraphIds(html) {
  return new Set(
    Array.from(
      html.matchAll(/<p\b[^>]*\bdata-pid=(?:"([^"]+)"|'([^']+)')[^>]*>/gi),
      (match) => match[1] ?? match[2],
    ),
  );
}

export function analyzeSegmentInfos(document, sourceType, html) {
  const entity = getFixtureEntity(document, sourceType);
  const segmentInfos = entity?.segment_infos;
  if (segmentInfos === undefined) return { count: 0, errors: [] };
  if (!Array.isArray(segmentInfos)) {
    return { count: 0, errors: ['segment_infos must be an array'] };
  }

  const paragraphIds = getParagraphIds(html);
  const seenPids = new Set();
  const errors = [];

  segmentInfos.forEach((segment, segmentIndex) => {
    const segmentPath = `segment_infos.${segmentIndex}`;
    if (!isRecord(segment)) {
      errors.push(`${segmentPath} must be an object`);
      return;
    }

    if (typeof segment.pid !== 'string' || !segment.pid) {
      errors.push(`${segmentPath}.pid must be a non-empty string`);
    } else {
      if (seenPids.has(segment.pid)) {
        errors.push(`${segmentPath}.pid duplicates ${segment.pid}`);
      }
      seenPids.add(segment.pid);
      if (!paragraphIds.has(segment.pid)) {
        errors.push(`${segmentPath}.pid ${segment.pid} is absent from content`);
      }
    }

    if (typeof segment.text !== 'string') {
      errors.push(`${segmentPath}.text must be a string`);
      return;
    }
    if (!Array.isArray(segment.marks)) {
      errors.push(`${segmentPath}.marks must be an array`);
      return;
    }

    segment.marks.forEach((mark, markIndex) => {
      const markPath = `${segmentPath}.marks.${markIndex}`;
      if (!isRecord(mark)) {
        errors.push(`${markPath} must be an object`);
        return;
      }

      if (
        !Number.isInteger(mark.start_index) ||
        !Number.isInteger(mark.end_index) ||
        mark.start_index < 0 ||
        mark.end_index < mark.start_index ||
        mark.end_index > segment.text.length
      ) {
        errors.push(
          `${markPath} range ${mark.start_index}:${mark.end_index} is invalid for text length ${segment.text.length}`,
        );
      }

      const interaction = mark.seg_info ?? mark.master_seg_info;
      if (!isRecord(interaction)) {
        errors.push(`${markPath} must contain seg_info or master_seg_info`);
        return;
      }
      if (
        typeof interaction.like_count !== 'number' ||
        typeof interaction.comment_count !== 'number' ||
        typeof interaction.is_like !== 'boolean'
      ) {
        errors.push(`${markPath} contains invalid interaction counters`);
      }
      if (
        interaction.seg_ids !== undefined &&
        (!Array.isArray(interaction.seg_ids) ||
          !interaction.seg_ids.every(
            (segmentId) => typeof segmentId === 'string' && segmentId,
          ))
      ) {
        errors.push(`${markPath}.seg_ids must contain non-empty strings`);
      }
    });
  });

  return { count: segmentInfos.length, errors };
}

export function compareExpected(actual, expected = {}) {
  return Object.entries(expected).flatMap(([key, expectedValue]) => {
    const actualValue = actual[key];
    return actualValue === expectedValue
      ? []
      : [`${key}: expected ${expectedValue}, received ${actualValue}`];
  });
}

export async function loadManifest(manifestPath) {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 2 || !Array.isArray(manifest.cases)) {
    throw new Error(`Unsupported fixture manifest: ${manifestPath}`);
  }
  return manifest;
}

export async function analyzeFixtureCase(fixtureCase, manifestPath) {
  const filePath = path.resolve(path.dirname(manifestPath), fixtureCase.file);
  const { content, document } = await loadFixtureSource(
    filePath,
    fixtureCase.contentPath,
  );
  const segmentAnalysis = analyzeSegmentInfos(
    document,
    fixtureCase.sourceType,
    content,
  );
  const stats = {
    ...analyzeHtml(content),
    segmentInfos: segmentAnalysis.count,
  };
  return {
    ...fixtureCase,
    filePath,
    stats,
    errors: [
      ...compareExpected(stats, fixtureCase.expected),
      ...(document
        ? compareExpectedMetadata(document, fixtureCase.expectedMetadata)
        : []),
      ...segmentAnalysis.errors,
    ],
  };
}

async function listFixtureFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return listFixtureFiles(entryPath);
      if (entry.name.toLowerCase() === 'readme.md') return [];
      return entry.name.toLowerCase().endsWith(JSON_FIXTURE_EXTENSION)
        ? [entryPath]
        : [];
    }),
  );
  return nestedFiles.flat().sort();
}

export async function analyzeFixtureDirectory(directoryPath) {
  const filePaths = await listFixtureFiles(directoryPath);
  const results = [];

  for (const filePath of filePaths) {
    const { content, document } = await loadFixtureSource(filePath);
    const relativePath = path.relative(directoryPath, filePath);
    const segmentAnalysis = analyzeSegmentInfos(
      document,
      document?.type,
      content,
    );
    results.push({
      id: `inbox:${relativePath}`,
      filePath,
      sourceType: 'unregistered',
      traits: [],
      stats: {
        ...analyzeHtml(content),
        segmentInfos: segmentAnalysis.count,
      },
      errors: segmentAnalysis.errors,
    });
  }

  return results;
}
