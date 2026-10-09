import { AxiosHeaders, type AxiosResponse } from 'axios';
import apiClient from '../api/client';
import {
  getContentRelationship,
  normalizeContentRelationship,
} from '../api/zhihu/relationship';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const get = jest.mocked(apiClient.get);

function response(data: unknown): AxiosResponse<unknown> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

beforeEach(() => get.mockReset());

test.each([
  'answers',
  'pins',
] as const)('fetches the %s relationship using the existing authenticated client', async (contentType) => {
  get.mockResolvedValue(response({ text: '34 人赞同了该内容' }));
  const signal = new AbortController().signal;
  expect(await getContentRelationship(contentType, '42', { signal })).toEqual({
    text: '34 人赞同了该内容',
  });
  expect(get).toHaveBeenCalledWith(
    `/${contentType}/42/relationship?desktop=true`,
    { signal },
  );
});

test('normalizes the tip and projects only recognized response fields', () => {
  const actionUrl =
    'zhihu://hybrid?zh_url=https://www.zhihu.com/appview/answer/42/voters&zh_hide_nav_bar=true';
  expect(
    normalizeContentRelationship({
      type: 'reaction_endorse',
      text: '110 人赞同了该回答',
      action_url: actionUrl,
      Member: null,
      unrelated: { discarded: true },
    }),
  ).toEqual({
    type: 'reaction_endorse',
    text: '110 人赞同了该回答',
    action_url: actionUrl,
  });
});

test('keeps a readable tip when optional metadata is malformed', () => {
  expect(
    normalizeContentRelationship({
      text: '关注的人赞同了该想法',
      action_url: {},
      text_size: Number.NaN,
    }),
  ).toEqual({ text: '关注的人赞同了该想法' });
  expect(normalizeContentRelationship({ text: ' ' })).toBeNull();
  expect(normalizeContentRelationship(null)).toBeNull();
});

test('propagates request failure for the query layer to handle', async () => {
  const error = new Error('request failed');
  get.mockRejectedValue(error);
  await expect(getContentRelationship('pins', '42')).rejects.toBe(error);
});
