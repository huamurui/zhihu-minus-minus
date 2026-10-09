import { AxiosHeaders, type AxiosResponse } from 'axios';
import apiClient from '../api/client';
import { getAnswer } from '../api/zhihu/answer';
import {
  type AnswerEndorsement,
  normalizeAnswerEndorsements,
} from '../api/zhihu/endorsements';
import pigFixture from '../features/rich-content/fixtures/cases/pig.json';
import columnFixture from '../features/rich-content/fixtures/cases/question-feed-card-formula-table-001.json';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const get = jest.mocked(apiClient.get);
const invitation = {
  action_url: 'https://www.zhihu.com/people/redacted-person-token-003',
  elements: [
    { type: 'IMAGE', image_key: 'zhicon_icon_24_crab_fill' },
    { type: 'TEXT', content: '谢邀 @脱敏用户003' },
  ],
  za: { block_text: 'ThanksForInvitingLabel' },
};

function response(data: unknown): AxiosResponse<unknown> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

function labelTexts(endorsement: AnswerEndorsement): string[] {
  return endorsement.elements.flatMap((element) =>
    element.type === 'TEXT' ? [element.content] : [],
  );
}

beforeEach(() => get.mockReset());

test('normalizes invitation label text, symbolic icon metadata and the safe member route', () => {
  const [label] = normalizeAnswerEndorsements([invitation]);
  expect(label).toMatchObject({
    actionPath: '/user/redacted-person-token-003',
    elements: [
      { type: 'IMAGE', image_key: 'zhicon_icon_24_crab_fill' },
      { type: 'TEXT', content: '谢邀 @脱敏用户003' },
    ],
  });
  expect(label).not.toHaveProperty('za');
});

test('reads only the existing daily and column endorsement fixture metadata', () => {
  const labels = normalizeAnswerEndorsements(pigFixture.target.endorsements);
  expect(labels).toHaveLength(2);
  expect(labelTexts(labels[0])).toEqual(['知乎日报收录']);
  expect(labels[0].actionPath).toBeUndefined();
  expect(labels[1].actionPath).toMatch(/^\/column\/c_\d+$/);
  const columnLabels = normalizeAnswerEndorsements(
    columnFixture.target.endorsements,
  );
  expect(columnLabels).toHaveLength(1);
  expect(labelTexts(columnLabels[0])).toEqual([
    expect.stringContaining('收录于 · '),
  ]);
  expect(columnLabels[0].actionPath).toMatch(/^\/column\/c_\d+$/);
});

test('preserves repeated text and image elements with distinct semantic occurrence keys', () => {
  const image = { type: 'IMAGE', image_key: 'zhicon_icon_16_arrow_right' };
  const text = { type: 'TEXT', content: '重复内容' };
  const [label] = normalizeAnswerEndorsements([
    { elements: [text, image, text, image] },
  ]);
  expect(labelTexts(label)).toEqual(['重复内容', '重复内容']);
  expect(label.elements.map((element) => element.type)).toEqual([
    'TEXT',
    'IMAGE',
    'TEXT',
    'IMAGE',
  ]);
  expect(new Set(label.elements.map((element) => element.key)).size).toBe(4);
});

test('leaves unsafe or unsupported actions as readable noninteractive labels', () => {
  const labels = normalizeAnswerEndorsements([
    { elements: [] },
    { ...invitation, action_url: 'javascript:alert(1)' },
  ]);
  expect(labels).toHaveLength(1);
  expect(labelTexts(labels[0])).toEqual(['谢邀 @脱敏用户003']);
  expect(labels[0].actionPath).toBeUndefined();
});

test('requests endorsements by default and keeps the raw answer label payload compatible', async () => {
  const answer = { id: '42', endorsements: [invitation] };
  get.mockResolvedValue(response(answer));
  expect(await getAnswer('42')).toBe(answer);
  const path = get.mock.calls[0]?.[0];
  const url = new URL(String(path), 'https://www.zhihu.com');
  expect(url.searchParams.get('include')?.split(',')).toContain('endorsements');
});
