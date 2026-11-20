import { AxiosHeaders, type AxiosResponse } from 'axios';
import apiClient from '../src/api/client';
import {
  createAnswerComment,
  createAnswerSegmentComment,
  createAnswerSelectionComment,
  createCommentV5,
  isValidAnswerCommentSelection,
  parseAnswerSegmentCommentContext,
  parseAnswerSegmentCommentTarget,
} from '../src/api/zhihu/comment';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const post = jest.mocked(apiClient.post);
const route = {
  id: '42',
  type: 'answer',
  segmentId: '200,300',
  text: ' 乙😀 ',
  pid: 'p-one',
  startOffset: '2',
  endOffset: '7',
};

beforeEach(() => {
  jest.clearAllMocks();
  const response: AxiosResponse = {
    data: { id: '500' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  post.mockResolvedValue(response);
});

describe('answer segment-comment route context', () => {
  it('preserves an exact UTF-16 slice with whitespace and all thread IDs', () => {
    expect(parseAnswerSegmentCommentContext(route)).toEqual({
      answerId: '42',
      segmentIds: ['200', '300'],
      segmentText: ' 乙😀 ',
      paragraphId: 'p-one',
      startOffset: 2,
      endOffset: 7,
    });
  });

  it('keeps old links readable while refusing to invent posting coordinates', () => {
    const oldLink = { id: '42', type: 'answer', segmentId: '200' };
    expect(parseAnswerSegmentCommentTarget(oldLink)).toEqual({
      answerId: '42',
      segmentIds: ['200'],
    });
    expect(parseAnswerSegmentCommentContext(oldLink)).toBeNull();
    expect(
      parseAnswerSegmentCommentTarget({ ...oldLink, type: undefined }),
    ).not.toBeNull();
    expect(
      parseAnswerSegmentCommentContext({ ...route, type: undefined }),
    ).toBeNull();
  });

  it.each([
    { type: 'article' },
    { type: 'question' },
    { id: 'prototype-answer' },
    { segmentId: 'prototype-segment' },
    { segmentId: ['200', '300'] },
    { segmentId: '200,' },
  ])(
    'keeps unsupported or untrusted targets out of answer endpoints (%j)',
    (changes) => {
      expect(
        parseAnswerSegmentCommentTarget({ ...route, ...changes }),
      ).toBeNull();
      expect(
        parseAnswerSegmentCommentContext({ ...route, ...changes }),
      ).toBeNull();
    },
  );

  it.each([
    { text: '乙😀' },
    { text: ' ' },
    { text: '\uD83D' },
    { text: '甲\uFFFC' },
    { pid: '' },
    { pid: ' p-one' },
    { startOffset: '-1' },
    { startOffset: '2.0' },
    { endOffset: '2' },
    { endOffset: '9007199254740992' },
  ])(
    'requires complete, consistent source text and coordinates (%j)',
    (changes) => {
      expect(
        parseAnswerSegmentCommentContext({ ...route, ...changes }),
      ).toBeNull();
    },
  );
});

describe('comments on a fresh answer selection', () => {
  const selection = {
    text: ' 乙😀 ',
    startParagraphId: 'p-one',
    endParagraphId: 'p-one',
    startOffset: 2,
    endOffset: 7,
  };

  it('creates a new same-paragraph discussion without a thread ID', async () => {
    await expect(
      createAnswerSelectionComment('42', selection, '<p>留言</p>'),
    ).resolves.toEqual({ id: '500' });
    expect(post.mock.calls).toEqual([
      [
        '/comment_v5/answers/42/segment/comment',
        {
          content: '<p>留言</p>',
          segment: {
            content: ' 乙😀 ',
            position: {
              start: { paragraph_id: 'p-one', offset: 2 },
              end: { paragraph_id: 'p-one', offset: 7 },
            },
          },
        },
      ],
    ]);
  });

  it('keeps the original text and paragraph-relative UTF-16 endpoints across paragraphs', async () => {
    const acrossParagraphs = {
      ...selection,
      text: ' 前\n中间一段\n😀 ',
      endParagraphId: 'p-three',
      startOffset: 15,
      endOffset: 3,
    };
    await createAnswerSelectionComment('42', acrossParagraphs, '<p>留言</p>');
    expect(post.mock.calls[0]?.[1]).toEqual({
      content: '<p>留言</p>',
      segment: {
        content: acrossParagraphs.text,
        position: {
          start: { paragraph_id: 'p-one', offset: 15 },
          end: { paragraph_id: 'p-three', offset: 3 },
        },
      },
    });
  });

  it.each([
    { endOffset: 6 },
    { startOffset: -1 },
    { endOffset: Number.MAX_SAFE_INTEGER + 1 },
    { startOffset: 0.5 },
    { text: '  \n  ' },
    { text: ' 乙\uD83D  ' },
    { text: ' 乙\uFFFC  ' },
    { startParagraphId: ' p-one' },
    { endParagraphId: '' },
    { endParagraphId: 'p-two', endOffset: 100 },
    { text: '甲\n😀', endParagraphId: 'p-two', endOffset: 1 },
  ])('rejects invalid source positions before sending (%j)', async (change) => {
    const invalid = { ...selection, ...change };
    expect(isValidAnswerCommentSelection('42', invalid)).toBe(false);
    await expect(
      createAnswerSelectionComment('42', invalid, '<p>留言</p>'),
    ).rejects.toThrow('有效的原文位置');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects a missing target and empty comments', async () => {
    await expect(
      createAnswerSelectionComment('0', selection, '<p>留言</p>'),
    ).rejects.toThrow('有效的原文位置');
    await expect(
      createAnswerSelectionComment('42', selection, ' '),
    ).rejects.toThrow('请输入评论内容');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('answer segment-comment posting adapter', () => {
  it('posts a root comment to the segment endpoint with the exact source position', async () => {
    const context = parseAnswerSegmentCommentContext(route);
    if (!context) throw new Error('Missing test context');
    await createAnswerSegmentComment(context, '<p>评论内容</p>');
    expect(post).toHaveBeenCalledWith(
      '/comment_v5/answers/42/segment/comment',
      {
        content: '<p>评论内容</p>',
        segment: {
          content: ' 乙😀 ',
          position: {
            start: { paragraph_id: 'p-one', offset: 2 },
            end: { paragraph_id: 'p-one', offset: 7 },
          },
        },
      },
    );
  });

  it('keeps source context and uses reply_comment_id for a reply within the segment thread', async () => {
    const context = parseAnswerSegmentCommentContext(route);
    if (!context) throw new Error('Missing test context');
    await createAnswerSegmentComment(context, '<p>回复内容</p>', '500');
    expect(post.mock.calls[0]?.[0]).toBe(
      '/comment_v5/answers/42/segment/comment',
    );
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      reply_comment_id: '500',
      segment: { content: route.text },
    });
  });

  it('revalidates a typed context before sending so incomplete old links cannot post to ordinary answers', async () => {
    const context = parseAnswerSegmentCommentContext(route);
    if (!context) throw new Error('Missing test context');
    await expect(
      createAnswerSegmentComment({ ...context, endOffset: 6 }, '<p>内容</p>'),
    ).rejects.toThrow('知识点缺少有效的原文位置');
    await expect(
      createAnswerSegmentComment(context, '<p>内容</p>', 'invalid-target'),
    ).rejects.toThrow('回复目标无效');
    expect(post).not.toHaveBeenCalled();
  });

  it('preserves the ordinary root and reply endpoint payloads', async () => {
    await createAnswerComment('42', '<p>普通根评</p>');
    expect(post.mock.calls[0]).toEqual([
      '/answers/42/comments',
      { content: '<p>普通根评</p>', type: 'comment' },
    ]);
    await createCommentV5('articles', '43', '<p>普通回复</p>', '500');
    expect(post.mock.calls[1]).toEqual([
      '/comment_v5/articles/43/comment',
      { content: '<p>普通回复</p>', type: 'comment', reply_comment_id: '500' },
    ]);
  });
});
