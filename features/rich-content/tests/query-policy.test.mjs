import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const policySource = await readFile(
  new URL('../queryPolicy.ts', import.meta.url),
  'utf8',
);
const { outputText: policyJavaScript } = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  getNeighborAnswerIds,
  getRichContentQueryKey,
  hasInlineRichContent,
  hasReusableAnswerDetail,
} = await import(
  `data:text/javascript;base64,${Buffer.from(policyJavaScript).toString('base64')}`
);

test('recognizes reusable inline rich content', () => {
  assert.equal(hasInlineRichContent('<p>完整正文</p>'), true);
  assert.equal(hasInlineRichContent([{ type: 'text', content: '想法' }]), true);
  assert.equal(hasInlineRichContent('   '), false);
  assert.equal(hasInlineRichContent([]), false);
});

test('only seeds complete free answers into the canonical detail cache', () => {
  const completeAnswer = {
    type: 'answer',
    content: '<p>完整正文</p>',
    author: { id: 'author' },
    question: { id: 'question' },
  };

  assert.equal(hasReusableAnswerDetail(completeAnswer), true);
  assert.equal(
    hasReusableAnswerDetail({
      ...completeAnswer,
      content_need_truncated: true,
    }),
    false,
  );
  assert.equal(
    hasReusableAnswerDetail({ ...completeAnswer, answer_type: 'paid' }),
    false,
  );
  assert.equal(
    hasReusableAnswerDetail({ ...completeAnswer, question: undefined }),
    false,
  );
});

test('uses the same canonical cache keys as detail screens', () => {
  assert.deepEqual(getRichContentQueryKey('answers', '1'), [
    'answer-detail',
    '1',
  ]);
  assert.deepEqual(getRichContentQueryKey('articles', '2'), [
    'zhihu-article',
    '2',
  ]);
  assert.deepEqual(getRichContentQueryKey('pins', '3'), ['pin-detail', '3']);
  assert.deepEqual(getRichContentQueryKey('questions', '4'), ['question', '4']);
  assert.deepEqual(getRichContentQueryKey('questions', '4', true), [
    'question',
    '4',
    true,
  ]);
});

test('prefetches at most the immediate pager neighbors', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(getNeighborAnswerIds(ids, 0), ['b']);
  assert.deepEqual(getNeighborAnswerIds(ids, 2), ['b', 'd']);
  assert.deepEqual(getNeighborAnswerIds(ids, 3), ['c']);
});
