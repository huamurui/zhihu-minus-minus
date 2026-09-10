import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildZhihuAppMomentOriginUrl,
  buildZhihuAppMomentsUrl,
  buildZhihuAppQuestionFeedsUrl,
  buildZhihuAppRecommendUrl,
  getZhihuAppEndpointHeaders,
  ZHIHU_APP_QUESTION_FEEDS_INCLUDE,
} from '../api/zhihu/appApi.ts';
import { normalizeZhihuAppQuestionFeeds } from '../api/zhihu/questionFeed.ts';

test('builds the initial app recommendation request', () => {
  const url = new URL(buildZhihuAppRecommendUrl());

  assert.equal(url.origin, 'https://api.zhihu.com');
  assert.equal(url.pathname, '/topstory/recommend');
  assert.equal(url.searchParams.get('action'), 'down');
  assert.equal(url.searchParams.get('page_number'), '1');
  assert.equal(url.searchParams.get('device'), 'pad');
  assert.equal(url.searchParams.get('is_feed_first_request'), '1');
});

test('serializes app recommendation pagination state without hardcoded tokens', () => {
  const url = new URL(
    buildZhihuAppRecommendUrl({
      after_id: 30,
      page_number: 7,
      session_token: 'runtime-session',
      component_frequency_state: {
        top_reason: {
          last_shown_position: -18,
          last_shown_dedup_key: '603',
        },
      },
    }),
  );

  assert.equal(url.searchParams.get('after_id'), '30');
  assert.equal(url.searchParams.get('session_token'), 'runtime-session');
  assert.deepEqual(
    JSON.parse(url.searchParams.get('component_frequency_state')),
    {
      top_reason: {
        last_shown_position: -18,
        last_shown_dedup_key: '603',
      },
    },
  );
});

test('maps question answer sort and paging parameters to native feeds', () => {
  const url = new URL(
    buildZhihuAppQuestionFeedsUrl('1912527989587056177', {
      order: 'updated',
      limit: 20,
      offset: 40,
    }),
  );

  assert.equal(url.pathname, '/questions/1912527989587056177/feeds');
  assert.equal(
    url.searchParams.get('include'),
    ZHIHU_APP_QUESTION_FEEDS_INCLUDE,
  );
  assert.equal(url.searchParams.get('order'), 'updated');
  assert.equal(url.searchParams.get('show_detail'), '1');
  assert.equal(url.searchParams.get('offset'), '40');
});

test('builds moments and origin requests', () => {
  const momentsUrl = new URL(buildZhihuAppMomentsUrl('timeline'));
  const originUrl = new URL(buildZhihuAppMomentOriginUrl('moment-id'));

  assert.equal(momentsUrl.pathname, '/moments_v3');
  assert.equal(momentsUrl.searchParams.get('feed_type'), 'timeline');
  assert.equal(momentsUrl.searchParams.get('session_id'), '');
  assert.equal(originUrl.pathname, '/moments/moment-id/origin');
  assert.equal(originUrl.searchParams.get('limit'), '20');
});

test('endpoint metadata never contains captured credentials or fingerprints', () => {
  const headers = getZhihuAppEndpointHeaders(buildZhihuAppRecommendUrl());
  const names = Object.keys(headers).map((name) => name.toLowerCase());
  const forbidden = [
    'authorization',
    'cookie',
    'x-udid',
    'x-zst-81',
    'x-zst-82',
    'x-ms-id',
    'x-suger',
    'x-at-df-if',
    'x-zse-93',
    'x-zse-96',
    'x-b3-traceid',
  ];

  for (const name of forbidden) assert.equal(names.includes(name), false);
  assert.equal(headers['x-api-version'], '3.1.8');
  assert.equal(headers['x-page-id'], '44');
});

test('normalizes question feed cards into renderable answer details', () => {
  const normalized = normalizeZhihuAppQuestionFeeds({
    data: [
      {
        type: 'question_feed_card',
        target_type: 'answer',
        target: {
          id: '2023793155875586793',
          author: {
            id: 'author-id',
            name: '作者',
            avatar_url: '',
            type: 'people',
          },
          big_card_summary: '第一行\n第二行',
          excerpt: '第一行 第二行',
          comment_count: 1168,
          reactions: { VOTE: { options: { UP: { count: 10969 } } } },
        },
      },
    ],
    paging: { is_end: true, next: '', page: 1, need_force_login: true },
  });

  assert.equal(normalized.data.length, 1);
  assert.equal(normalized.data[0].type, 'answer');
  assert.equal(normalized.data[0].voteup_count, 10969);
  assert.match(normalized.data[0].content, /第一行<br \/>第二行/);
  assert.equal(normalized.data[0].content_need_truncated, true);
  assert.equal(normalized.paging.need_force_login, true);
});
