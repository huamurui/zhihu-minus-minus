import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import apiClient from '../client';
import {
  buildZhihuAppMomentsUrl,
  buildZhihuAppRecommendUrl,
  getZhihuAppEndpointHeaders,
} from './appApi';

export interface FeedAuthor {
  id: string;
  url_token?: string;
  name: string;
  avatar: string;
  headline?: string;
}

export interface FeedTopic {
  id: string;
  name: string;
}

export interface FeedContentSegment {
  type: string;
  content?: string;
  own_text?: string;
  fold_type?: string;
  text_link_type?: string;
  title?: string;
  data_content_id?: string;
  data_content_type?: string;
  url?: string;
  data_draft_title?: string;
  data_draft_cover?: string;
  duration?: number;
  height?: number;
  width?: number;
  is_custom_thumbnail?: boolean;
  is_long?: boolean;
  playlist?: RawFeedVideoPlaylistItem[];
  status?: string;
  thumbnail?: string;
  video_bo_id?: string;
  video_id?: string;
  video_info?: RawFeedVideoInfo;
}

export interface RawFeedVideoPlaylistItem {
  bitrate?: number;
  duration?: number;
  format?: string;
  fps?: number;
  height?: number;
  quality?: string;
  size?: number;
  url?: string;
  width?: number;
}

export interface RawFeedVideoInfo {
  begin_frame?: Record<string, string>;
  duration?: number;
  height?: number;
  play_count?: number;
  playlist?: Record<string, RawFeedVideoPlaylistItem>;
  status?: string;
  thumbnail?: string;
  type?: string;
  video_id?: string;
  width?: number;
}

export interface RawFeedBadge {
  type?: string;
  description?: string;
  topic_names?: string[];
  topics?: unknown[];
}

export interface RawFeedBadgeDetail {
  badge_status?: string;
  description?: string;
  detail_type?: string;
  icon?: string;
  night_icon?: string;
  sources?: unknown[];
  title?: string;
  type?: string;
  url?: string;
}

export interface RawFeedBadgeV2 {
  detail_badges?: RawFeedBadgeDetail[];
  icon?: string;
  merged_badges?: RawFeedBadgeDetail[];
  night_icon?: string;
  title?: string;
}

export interface RawFeedMedal {
  avatar_url?: string;
  description?: string;
  medal_avatar_frame?: string;
  medal_id?: string;
  medal_name?: string;
  mini_avatar_url?: string;
}

export interface RawFeedVipIcon {
  id?: number;
  night_mode_url?: string;
  url?: string;
}

export interface RawFeedVipInfo {
  is_vip?: boolean;
  target_url?: string;
  vip_icon?: RawFeedVipIcon;
  widget?: RawFeedVipIcon;
}

export interface RawFeedAuthor {
  id?: string;
  name?: string;
  avatar_url?: string;
  headline?: string;
  url?: string;
  url_token?: string;
  type?: string;
  user_type?: string;
  gender?: number;
  follower_count?: number;
  reaction_count?: number;
  is_advertiser?: boolean;
  is_blocked?: boolean;
  is_blocking?: boolean;
  is_followed?: boolean;
  is_following?: boolean;
  is_org?: boolean;
  is_special_follow?: boolean;
  badge?: RawFeedBadge[];
  badge_v2?: RawFeedBadgeV2;
  exposed_medal?: RawFeedMedal;
  kvip_info?: RawFeedVipInfo;
  vip_info?: RawFeedVipInfo;
}

export interface RawFeedReactionRelation {
  current_user_is_navigator?: boolean;
  faved?: boolean;
  following?: boolean;
  img_liked?: Record<string, boolean>;
  is_author?: boolean;
  is_navigator_vote?: boolean;
  liked?: boolean;
  subcribed?: boolean;
  vote?: string;
  vote_next_step?: string;
}

export interface RawFeedReactionStatistics {
  applaud_count?: number;
  bullet_count?: number;
  comment_count?: number;
  down_vote_count?: number;
  favorites?: number;
  interest_play_count?: number;
  like_count?: number;
  plaincontent_like_count?: number;
  plaincontent_vote_up_count?: number;
  play_count?: number;
  pv_count?: number;
  question_answer_count?: number;
  question_follower_count?: number;
  republishers?: unknown[];
  share_count?: number;
  subscribe_count?: number;
  up_vote_count?: number;
  img_like_count?: Record<string, number>;
}

export interface RawFeedReaction {
  image_reactions?: Record<
    string,
    {
      is_liked?: boolean;
      like_count?: number;
    }
  >;
  relation?: RawFeedReactionRelation;
  special_reaction_style?: {
    is_hit?: boolean;
  };
  statistics?: RawFeedReactionStatistics;
}

export interface RawFeedRelationship {
  is_author?: boolean;
  is_nothelp?: boolean;
  is_thanked?: boolean;
  upvoted_followee_ids?: string[] | null;
  voting?: number;
}

export interface RawFeedQuestion {
  id?: string | number;
  title?: string;
  url?: string;
  type?: string;
  question_type?: string;
  created?: number;
  updated_time?: number;
  answer_count?: number;
  comment_count?: number;
  follower_count?: number;
  detail?: string;
  excerpt?: string;
  bound_topic_ids?: number[];
  relationship?: {
    is_author?: boolean;
  };
  is_following?: boolean;
  author?: RawFeedAuthor;
  reaction_instruction?: Record<string, string> | null;
}

export interface RawFeedEndorsementElement {
  type?: string;
  image_key?: string;
  image_color?: Record<string, unknown>;
  width?: number;
  height?: number;
  content?: string;
  font_size?: number;
  font_color?: Record<string, unknown>;
  is_bold?: boolean;
  max_line?: number;
}

export interface RawFeedEndorsement {
  elements?: RawFeedEndorsementElement[];
  sub_elements?: unknown[];
  sub_elements_type?: string;
  background_color?: {
    alpha?: number;
    group?: string;
  };
  action_url?: string;
  za?: {
    block_text?: string;
    type?: string;
    text?: string;
  };
}

export interface RawFeedAdBrand {
  id?: number;
  action_text?: string;
  logo?: string;
  name?: string;
  type?: string;
}

export interface RawFeedAdCreative {
  action_button?: boolean;
  app_promotion_url?: string;
  brand?: RawFeedAdBrand;
  button?: string;
  click_tracks?: unknown[];
  content_type?: string;
  conversion_tracks?: unknown[];
  cta?: {
    value?: string;
  };
  deep_url?: string;
  description?: string;
  external_click_url?: string;
  footer?: {
    value?: string;
  };
  id?: number;
  image?: string;
  image_2x?: string;
  impression_tracks?: unknown[];
  landing_url?: string;
  name?: string;
  native_url?: string;
  target_token?: string;
  title?: string;
  video_watch_num?: number;
  za_ad_info?: string;
  za_ad_info_json?: string;
}

export interface RawFeedAd {
  ad_verb?: string;
  brand?: RawFeedAdBrand;
  can_interact?: boolean;
  category?: number;
  close_track?: string;
  comment_count?: number;
  count?: number;
  creatives?: RawFeedAdCreative[];
  ctr?: number;
  debug_tracks?: unknown[];
  display_advertising_tag?: boolean;
  download_silent?: boolean;
  experiment_info?: string;
  id?: number;
  is_following?: boolean;
  is_new_webview?: boolean;
  is_speeding?: boolean;
  land_prefetch?: boolean;
  load_tracks?: unknown[];
  native_prefetch?: boolean;
  position?: number;
  revert_close_track?: string;
  template?: string;
  user_id?: number;
  vote_up_count?: number;
}

export interface FeedItem {
  id: string;
  isIdStable?: boolean;
  title: ReactNode;
  questionId?: string;
  actionText?: string;
  author: FeedAuthor;
  excerpt: ReactNode;
  content?: string | FeedContentSegment[];
  image: string | null;
  voteCount: number;
  commentCount: number;
  favlistsCount?: number;
  voted: number;
  type: 'answers' | 'articles' | 'pins' | 'questions' | 'videos';
  topics?: FeedTopic[];
  rank?: number;
  hotValue?: string;
  titleString?: string;
  // —— 本地过滤所需的结构化信号（实测推荐流可用字段，见 utils/feedFilter.ts）——
  /** `answer_type === 'PAID'` 或 `paid_info != null` 即知乎盐选付费内容 */
  answerType?: string;
  /** 推广/利益声明标记，话题流返回、推荐流通常不返回 */
  isLabeled?: boolean;
  /** author.is_org —— 机构号 */
  isOrgAuthor?: boolean;
  /** author.is_advertiser —— 广告主 */
  isAdvertiser?: boolean;
  /** author.is_following —— 当前用户是否关注作者（质量规则的内建豁免依据） */
  isFollowingAuthor?: boolean;
  /** relationship.upvoted_followee_ids 非空 —— 我关注的人赞过 */
  upvotedByFollowee?: boolean;
  /** question.bound_topic_ids，为二期话题屏蔽预留 */
  boundTopicIds?: number[];
  /** question.answer_count，问题类型质量判定用 */
  answerCount?: number;
  /** question.follower_count，问题类型质量判定用 */
  followerCount?: number;
}

export interface RawFeedTarget {
  id: string | number;
  type: string;
  ab_config?: Record<string, string>;
  admin_closed_comment?: boolean;
  author?: RawFeedAuthor;
  can_comment?: {
    status?: boolean;
    reason?: string;
  };
  can_top?: boolean;
  comments?: unknown[];
  comment_permission?: string;
  content_html?: string;
  created?: number;
  created_time?: number;
  creation_disclaimer?: string;
  current_user_is_navigator?: boolean;
  excerpt_title?: string;
  excerpt_new?: string;
  title?: string;
  excerpt?: string;
  content?: string | FeedContentSegment[];
  preview_type?: string;
  preview_text?: string;
  thumbnail?: string;
  content_img?: string[];
  image_url?: string;
  linkbox?: {
    url?: string;
    category?: string;
    pic?: string;
    title?: string;
  };
  updated?: number;
  updated_time?: number;
  url?: string;
  voteup_count?: number;
  thanks_count?: number;
  like_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favorite_count?: number;
  is_admin_close_repin?: boolean;
  is_contain_ai_content?: boolean;
  is_copyable?: boolean;
  is_deleted?: boolean;
  is_guide_app?: boolean;
  is_navigator?: boolean;
  is_navigator_vote?: boolean;
  is_paid_video?: boolean;
  is_top?: boolean;
  navigator_vote?: boolean;
  page_view_count?: number | null;
  pin_type?: string;
  questions?: RawFeedQuestion[] | null;
  reaction_count?: number;
  reaction_instruction?: Record<string, string> | null;
  reaction_relation?: {
    like?: number;
    vote?: number;
  };
  reaction?: RawFeedReaction;
  regulate_info?: {
    is_regulating?: boolean;
  };
  relevant_info?: {
    relevant_type?: string;
    is_relevant?: boolean;
    relevant_text?: string;
  };
  relationship?: RawFeedRelationship;
  repin_count?: number;
  reshipment_settings?: string;
  ring_info?: unknown | null;
  self_create?: boolean;
  source_pin_id?: number;
  state?: string;
  tag_specials?: Record<string, unknown>;
  tags?: unknown[];
  top_reactions?: Record<string, number>;
  topics?: FeedTopic[] | null;
  upvoted_followees?: string[];
  voting?: number;
  view_permission?: string;
  virtuals?: {
    is_favorited?: boolean;
    is_liked?: boolean;
  };
  vote_next_step?: string;
  /** 回答类型：`NORMAL` / `PAID`；`PAID` 即知乎盐选付费内容 */
  answer_type?: string;
  /** 盐选付费信息，与 `answer_type === 'PAID'` 取或作为兜底信号 */
  paid_info?: {
    type?: string;
    content?: string;
    has_purchased?: boolean;
  };
  /** 推荐流正文是否被截断；为 true 时不能作为完整详情复用 */
  content_need_truncated?: boolean;
  force_login_when_click_read_more?: boolean;
  allow_segment_interaction?: number;
  attachment?: unknown | null;
  mark_infos?: unknown[];
  endorsements?: RawFeedEndorsement[];
  /** 推广/利益声明标记（话题流返回，推荐流通常不返回） */
  is_labeled?: boolean;
  /**
   * 以下两项仅在 target 自身即为 question 时出现（推荐流的「推荐问题」卡片）。
   * 回答/文章的问题信息在嵌套的 `question` 字段里，勿混用。
   */
  answer_count?: number;
  follower_count?: number;
  question?: RawFeedQuestion;
  detail_text?: string;
  // Hot List specific fields:
  title_area?: {
    text: string;
  };
  excerpt_area?: {
    text: string;
  };
  image_area?: {
    url: string;
  };
  metrics_area?: {
    text: string;
    font_color?: string;
    background?: string;
    weight?: string;
  };
  label_area?: {
    type: string;
    trend?: number;
    text?: string;
    night_color?: string;
    normal_color?: string;
  };
  link?: {
    url: string;
  };
}

export interface RawFeedItem {
  id?: string | number;
  type?: string;
  offset?: number;
  created_time?: number;
  updated_time?: number;
  brief?: string;
  verb?: string;
  action_text_tpl?: string;
  action_text?: string;
  show_actor_time?: boolean;
  target?: RawFeedTarget;
  actors?: RawFeedAuthor[];
  count?: number;
  attached_info?: string;
  uninterest_reasons?: unknown[];
  children?: Array<{
    thumbnail?: string;
  }>;
  image_url?: string;
  detail_text?: string;
  debut?: boolean;
  ad?: RawFeedAd;
  ad_list?: RawFeedAd[];
  adjson?: string;
  // Hot List specific fields
  card_id?: string;
  card_label?: {
    type: string;
    icon: string;
    night_icon: string;
  };
  feed_specific?: {
    answer_count: number;
  };
}

export interface ZhihuFeedResponse {
  data: RawFeedItem[];
  fresh_test?: string;
  has_new?: boolean;
  paging: {
    is_end: boolean;
    is_start?: boolean;
    next: string;
    previous?: string;
  };
}

/** `/api/v3/moments` 的完整响应结构。 */
export interface ZhihuMomentsResponse extends ZhihuFeedResponse {
  fresh_test: string;
  has_new: boolean;
}

export const FEED_URLS = {
  following: 'https://www.zhihu.com/api/v3/moments?limit=10',
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  local: 'zhihu://local-feed',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
} as const;

export interface RecommendRequestOptions {
  includeDesktop: boolean;
  includeAdInterval: boolean;
  adInterval: number;
}

const RECOMMEND_FEED_PATH = '/api/v3/feed/topstory/recommend';

/**
 * Apply the optional recommendation query parameters to every recommendation
 * page, including URLs returned by paging.next. Existing session_token values
 * are intentionally preserved but are never generated or hardcoded here.
 */
export function buildRecommendRequestUrl(
  url: string,
  options: RecommendRequestOptions,
): string {
  if (!url.includes(RECOMMEND_FEED_PATH)) return url;

  try {
    const parsedUrl = new URL(url);
    if (options.includeDesktop) {
      parsedUrl.searchParams.set('desktop', 'true');
    } else {
      parsedUrl.searchParams.delete('desktop');
    }
    if (options.includeAdInterval) {
      parsedUrl.searchParams.set('ad_interval', String(options.adInterval));
    } else {
      parsedUrl.searchParams.delete('ad_interval');
    }
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

export const getFeed = async (url: string): Promise<ZhihuFeedResponse> => {
  let finalUrl = url;
  const { cookies } = useAuthStore.getState();
  const isRefreshRequest = url.includes('action=up') || url.includes('t=');
  let appRecommendFallbackEligible = false;

  // 未登录时使用官方客户端的设备匿名态接口。翻页 URL 由接口返回，
  // 因而这里只转换 Web 入口 URL，不覆盖服务端下发的 session_token 等状态。
  if (!cookies && finalUrl.includes('/api/v3/feed/topstory/recommend')) {
    appRecommendFallbackEligible = true;
    finalUrl = buildZhihuAppRecommendUrl({
      action: isRefreshRequest ? 'up' : 'down',
      refresh_scene: isRefreshRequest ? 1 : 0,
      is_feed_first_request: isRefreshRequest ? 0 : 1,
    });
  } else if (!cookies && finalUrl.includes('/api/v3/moments')) {
    finalUrl = buildZhihuAppMomentsUrl('timeline', {
      action: isRefreshRequest ? 'up' : 'down',
    });
  }

  if (url === 'zhihu://local-feed') {
    // 1. Fetch sections to find the local section ID
    try {
      const sectionsRes = await apiClient.get<{
        data?: Array<{ section_id?: string; section_name?: string }>;
      }>('https://api.zhihu.com/feed-root/sections/query/v2');
      const sections = sectionsRes.data?.data || [];
      const localSection = sections.find(
        (section) =>
          section.section_name?.includes('同城') || section.section_id,
      );

      if (localSection?.section_id) {
        finalUrl = `https://api.zhihu.com/feed-root/section/${localSection.section_id}?channelStyle=0`;
        if (localSection.section_name) {
          useSettingsStore
            .getState()
            .updateSettings({ localCityName: localSection.section_name });
        }
      } else {
        throw new Error('未找到同城版块');
      }
    } catch {
      console.warn('获取同城版块失败，回退到推荐流');
      finalUrl = FEED_URLS.recommend;
    }
  } else if (url.startsWith('zhihu://local-feed/')) {
    finalUrl = url.replace(
      'zhihu://local-feed/',
      'https://api.zhihu.com/feed-root/section/',
    );
  }

  if (cookies) {
    const {
      recommendRequestIncludeDesktop,
      recommendRequestIncludeAdInterval,
      recommendRequestAdInterval,
    } = useSettingsStore.getState();
    finalUrl = buildRecommendRequestUrl(finalUrl, {
      includeDesktop: recommendRequestIncludeDesktop,
      includeAdInterval: recommendRequestIncludeAdInterval,
      adInterval: recommendRequestAdInterval,
    });
  }

  let res: AxiosResponse<ZhihuFeedResponse>;
  try {
    res = await apiClient.get<ZhihuFeedResponse>(finalUrl, {
      headers: getZhihuAppEndpointHeaders(finalUrl),
    });
  } catch (error) {
    // Some installs may not yet have all device credentials that the App
    // endpoint expects. Keep the previous browser guest feed as a
    // compatibility fallback instead of leaving a first-time user with no feed.
    if (!appRecommendFallbackEligible) throw error;
    let fallbackUrl =
      'https://www.zhihu.com/api/v3/explore/guest/feeds?limit=15&ws_qiangzhisafe=0';
    if (isRefreshRequest) fallbackUrl += `&t=${Date.now()}`;
    res = await apiClient.get<ZhihuFeedResponse>(fallbackUrl);
  }

  if (url.startsWith('zhihu://local-feed')) {
    // Override the next URL to use our custom scheme so we can intercept it again
    if (res.data?.paging?.next) {
      res.data.paging.next = res.data.paging.next.replace(
        'https://api.zhihu.com/feed-root/section/',
        'zhihu://local-feed/',
      );
    }
  }

  return res.data;
};
