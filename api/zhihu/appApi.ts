/**
 * Zhihu App API routes observed from Android traffic. Authentication state is
 * a caller policy; these routes are not tied to one account mode. Captured
 * credentials and device fingerprints deliberately do not belong here.
 */

export const ZHIHU_APP_API_BASE_URL = 'https://api.zhihu.com';

export type ZhihuAppFeedAction = 'up' | 'down';
export type ZhihuAppQuestionFeedOrder = 'default' | 'updated';
export type ZhihuAppMomentsFeedType = 'timeline' | 'recommend';

export interface ZhihuAppComponentFrequencyEntry {
  last_shown_position: number;
  last_shown_dedup_key: string;
}

export type ZhihuAppComponentFrequencyState = Record<
  string,
  ZhihuAppComponentFrequencyEntry
>;

/** Query accepted by `GET /topstory/recommend`. */
export interface ZhihuAppRecommendParams {
  action?: ZhihuAppFeedAction;
  ad_interval?: number;
  after_id?: number;
  component_frequency_state?: ZhihuAppComponentFrequencyState;
  end_offset?: number;
  page_number?: number;
  session_token?: string;
  start_type?: 'cold' | 'warm';
  refresh_scene?: number;
  device?: 'phone' | 'pad';
  short_container_setting_value?: number;
  include_guide_relation?: boolean;
  is_feed_first_request?: 0 | 1;
}

/** Query accepted by `GET /questions/{id}/related-objects`. */
export interface ZhihuAppRelatedObjectsParams {
  is_search?: boolean;
}

/** Query accepted by `GET /questions/{id}/feeds`. */
export interface ZhihuAppQuestionFeedsParams {
  include?: string;
  order?: ZhihuAppQuestionFeedOrder;
  show_detail?: 0 | 1;
  limit?: number;
  offset?: number;
  cursor?: string;
  session_id?: string;
}

/** Query accepted by `GET /moments_v3`. */
export interface ZhihuAppMomentsParams {
  action?: ZhihuAppFeedAction;
  ad_index?: number;
  ad_slot_position?: number;
  feed_type: ZhihuAppMomentsFeedType;
  moment_start_offset?: number;
  offset?: number;
  page_num?: number;
  session_id?: string;
}

export interface ZhihuAppMomentOriginParams {
  limit?: number;
}

export const ZHIHU_APP_QUESTION_INCLUDE =
  'read_count,query_info,voteup_count,voting,can_vote';

export const ZHIHU_APP_QUESTION_FEEDS_INCLUDE =
  'big_card_summary,media_detail,reaction_instruction,is_author,is_thanked,voting,is_favorited,label_info,content_text_length,reactions';

type QueryValue = string | number | boolean | object | undefined;

function buildApiUrl(path: string, params: Record<string, QueryValue>): string {
  const url = new URL(path, ZHIHU_APP_API_BASE_URL);
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(
      name,
      typeof value === 'object' ? JSON.stringify(value) : String(value),
    );
  }
  return url.toString();
}

export function buildZhihuAppRecommendUrl(
  params: ZhihuAppRecommendParams = {},
): string {
  return buildApiUrl('/topstory/recommend', {
    action: 'down',
    ad_interval: -10,
    after_id: 0,
    end_offset: 0,
    page_number: 1,
    start_type: 'cold',
    refresh_scene: 0,
    device: 'pad',
    short_container_setting_value: 0,
    include_guide_relation: false,
    is_feed_first_request: 1,
    ...params,
  });
}

export function buildZhihuAppQuestionUrl(
  questionId: string | number,
  include = ZHIHU_APP_QUESTION_INCLUDE,
): string {
  return buildApiUrl(`/questions/${encodeURIComponent(String(questionId))}`, {
    include,
  });
}

export function buildZhihuAppRelatedObjectsUrl(
  questionId: string | number,
  params: ZhihuAppRelatedObjectsParams = {},
): string {
  return buildApiUrl(
    `/questions/${encodeURIComponent(String(questionId))}/related-objects`,
    { is_search: false, ...params },
  );
}

export function buildZhihuAppQuestionFeedsUrl(
  questionId: string | number,
  params: ZhihuAppQuestionFeedsParams = {},
): string {
  return buildApiUrl(
    `/questions/${encodeURIComponent(String(questionId))}/feeds`,
    {
      include: ZHIHU_APP_QUESTION_FEEDS_INCLUDE,
      order: 'default',
      show_detail: 1,
      ...params,
    },
  );
}

export function buildZhihuAppMomentsUrl(
  feedType: ZhihuAppMomentsFeedType,
  params: Omit<ZhihuAppMomentsParams, 'feed_type'> = {},
): string {
  return buildApiUrl('/moments_v3', {
    action: 'down',
    ad_index: 7,
    ad_slot_position: 7,
    feed_type: feedType,
    moment_start_offset: 0,
    offset: 0,
    page_num: 1,
    session_id: '',
    ...params,
  });
}

export function buildZhihuAppMomentOriginUrl(
  momentId: string,
  params: ZhihuAppMomentOriginParams = {},
): string {
  return buildApiUrl(`/moments/${encodeURIComponent(momentId)}/origin`, {
    limit: 20,
    ...params,
  });
}

/**
 * Only stable endpoint metadata is copied from the capture. Volatile tracing,
 * credential and device-fingerprint headers must come from runtime state.
 */
export function getZhihuAppEndpointHeaders(
  url: string,
): Record<string, string> {
  let pathname: string;
  try {
    pathname = new URL(url, ZHIHU_APP_API_BASE_URL).pathname;
  } catch {
    return {};
  }

  if (pathname === '/topstory/recommend') {
    return {
      'x-api-version': '3.1.8',
      'x-page-id': '44',
      'x-close-recommend': '0',
      'x-feed-prefetch': '0',
    };
  }
  if (pathname === '/moments_v3') {
    return {
      'x-api-version': '3.0.93',
      'x-page-id': '43',
      'x-moments-ab-param': 'follow_tab=1',
    };
  }
  if (/^\/questions\/[^/]+\/feeds$/.test(pathname)) {
    return { 'x-api-version': '3.0.89', 'x-page-id': '172' };
  }
  if (
    /^\/questions\/[^/]+(?:\/related-objects)?$/.test(pathname) ||
    /^\/moments\/[^/]+\/origin$/.test(pathname)
  ) {
    return { 'x-api-version': '3.0.93', 'x-page-id': '172' };
  }
  return {};
}
