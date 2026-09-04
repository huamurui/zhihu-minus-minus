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

  const selectedContent = getFixtureValue(document, contentPath ?? 'content');
  if (typeof selectedContent !== 'string') {
    throw new Error(
      `JSON fixture ${filePath} must contain string content at ${contentPath ?? 'content'}`,
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
  const stats = analyzeHtml(content);
  return {
    ...fixtureCase,
    filePath,
    stats,
    errors: [
      ...compareExpected(stats, fixtureCase.expected),
      ...(document
        ? compareExpectedMetadata(document, fixtureCase.expectedMetadata)
        : []),
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
    const { content } = await loadFixtureSource(filePath);
    const relativePath = path.relative(directoryPath, filePath);
    results.push({
      id: `inbox:${relativePath}`,
      filePath,
      sourceType: 'unregistered',
      traits: [],
      stats: analyzeHtml(content),
      errors: [],
    });
  }

  return results;
}
