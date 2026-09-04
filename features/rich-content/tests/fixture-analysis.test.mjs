import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeFixtureCase,
  analyzeFixtureDirectory,
  analyzeHtml,
  loadManifest,
  normalizeFixtureHtml,
} from '../tools/fixture-lib.mjs';

const manifestPath = fileURLToPath(
  new URL('../fixtures/manifest.json', import.meta.url),
);

test('normalizes captured escaped HTML values', () => {
  assert.equal(
    normalizeFixtureHtml('<p data-pid=\\"one\\">x</p>'),
    '<p data-pid="one">x</p>',
  );
  assert.equal(
    normalizeFixtureHtml('"<p>JSON value</p>"'),
    '<p>JSON value</p>',
  );
});

test('normalizes escaped closing tags from captured API values', () => {
  assert.deepEqual(normalizeFixtureHtml('<p>A<\\/p>'), '<p>A</p>');
});

test('discovers every unregistered inbox sample without manifest work', async () => {
  const directoryPath = await mkdtemp(
    path.join(tmpdir(), 'rich-content-fixtures-'),
  );
  try {
    await writeFile(
      path.join(directoryPath, 'new-answer.json'),
      JSON.stringify({ content: '<p>JSON answer</p>', type: 'answer' }),
    );
    await writeFile(path.join(directoryPath, 'README.md'), '# ignored');

    const results = await analyzeFixtureDirectory(directoryPath);
    assert.deepEqual(
      results.map(({ id }) => id),
      ['inbox:new-answer.json'],
    );
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test('excludes noscript fallback images from active image counts', () => {
  const stats = analyzeHtml(
    '<figure><noscript><img src="fallback.jpg"></noscript><img src="active.jpg"></figure>',
  );
  assert.equal(stats.totalImages, 2);
  assert.equal(stats.activeImages, 1);
  assert.equal(stats.noscripts, 1);
});

test('counts member mentions and topic tags in pin HTML', () => {
  const stats = analyzeHtml(
    '<a class="member_mention" href="/people/example">@example</a><a class="hash_tag" href="/topic/example">#example</a>',
  );
  assert.equal(stats.memberMentions, 1);
  assert.equal(stats.topicTags, 1);
});

test('analyzes JSON API envelopes and asserts metadata beside content', async () => {
  const directoryPath = await mkdtemp(
    path.join(tmpdir(), 'rich-content-json-fixture-'),
  );
  try {
    await writeFile(
      path.join(directoryPath, 'answer.json'),
      JSON.stringify({
        type: 'answer',
        content: '<p>正文</p><figure><img src="image.jpg" /></figure>',
        content_need_truncated: true,
        author: { vip_info: { is_vip: true } },
        endorsements: [{}, {}],
      }),
    );
    const manifestFilePath = path.join(directoryPath, 'manifest.json');
    await writeFile(
      manifestFilePath,
      JSON.stringify({
        version: 2,
        cases: [
          {
            id: 'json-answer',
            file: './answer.json',
            contentPath: 'content',
            expected: { paragraphs: 1, figures: 1, activeImages: 1 },
            expectedMetadata: {
              type: 'answer',
              content_need_truncated: true,
              'author.vip_info.is_vip': true,
              'endorsements.length': 2,
            },
          },
        ],
      }),
    );

    const [fixture] = (await loadManifest(manifestFilePath)).cases;
    const result = await analyzeFixtureCase(fixture, manifestFilePath);
    assert.deepEqual(result.errors, []);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test('all registered real-world fixtures retain their expected structure', async (t) => {
  const manifest = await loadManifest(manifestPath);
  for (const fixtureCase of manifest.cases) {
    await t.test(fixtureCase.id, async () => {
      const result = await analyzeFixtureCase(fixtureCase, manifestPath);
      assert.deepEqual(result.errors, []);
    });
  }
});
