import type {
  ZhihuAnswer,
  ZhihuAuthor,
  ZhihuMemberRelation,
  ZhihuPaging,
} from '@/types/zhihu';
import { getRecentActivityTargetId } from '@/utils/userProfile';
import apiClient, { type ApiRequestOptions } from '../client';

export const MEMBER_INCLUDE =
  'url_token,answer_count,articles_count,question_count,pins_count,follower_count,following_count,headline,cover_url,description,voteup_count,thanked_count,favorited_count,is_following,mutual_followees_count';

export const MEMBER_ANSWERS_INCLUDE =
  'data[*].is_normal,admin_closed_comment,reward_info,is_collapsed,annotation_action,annotation_detail,collapse_reason,collapsed_by,suggest_edit,comment_count,can_comment,content,editable_content,attachment,voteup_count,reshipment_settings,comment_permission,created_time,updated_time,review_info,excerpt,endorsements,paid_info,reaction_instruction,is_labeled,label_info,relationship.is_authorized,voting,is_author,is_thanked,is_nothelp,reaction,vessay_info;data[*].author.badge[?(type=best_answerer)].topics;data[*].author.kvip_info;data[*].author.vip_info;data[*].question.has_publishing_draft,relationship';

const MEMBER_FALLBACK_INCLUDE =
  'id,url_token,name,avatar_url,follower_count,following_count,headline,cover_url,description,answer_count,articles_count,question_count,pins_count,voteup_count,is_following,mutual_followees_count';

export interface ZhihuMember extends ZhihuAuthor {
  headline_render?: string;
  answer_count?: number;
  articles_count?: number;
  question_count?: number;
  pins_count?: number;
  project_count?: number;
  follower_count?: number;
  follower_count_text?: string;
  follower_count_num?: string;
  follower_count_unit?: string;
  following_count?: number;
  following_count_num?: string;
  following_count_unit?: string;
  cover_url?: string;
  description?: string;
  voteup_count?: number;
  thanked_count?: number;
  favorited_count?: number;
  mutual_followees_count?: number;
  available_medals_count?: number;
  org_verify_status?: null;
  is_realname?: boolean;
  is_new_rename?: boolean;
  has_applying_column?: boolean;
  has_agent_content?: boolean;
  ai_assistant_info?: null;
}

export interface ZhihuMemberListItem extends ZhihuMember {
  is_followed?: boolean;
}

export interface ZhihuListResponse<T> {
  data: T[];
  paging: ZhihuPaging;
}

export interface ZhihuMemberActivity {
  id?: string | number;
  source?: {
    action_text?: string;
    action_time?: number;
    action_type?: string;
  };
  target?: ZhihuMemberActivityTarget;
  type?: string;
  url?: string;
}

export interface ZhihuMemberActivityTarget {
  id?: string | number;
  type?: string;
  url?: string;
  title?: string;
  excerpt?: string;
  excerpt_title?: string;
  content?: string | ZhihuMemberActivityContentSegment[];
  image_url?: string;
  thumbnail?: string;
  voteup_count?: number;
  reaction_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favorite_count?: number;
  reaction?: {
    statistics?: {
      comments?: number;
      favorites?: number;
    };
  };
  created?: number;
  created_time?: number;
  relationship?: { voting?: number };
  author?: Partial<ZhihuAuthor>;
  question?: {
    id?: string | number;
    title?: string;
  };
  [key: string]: unknown;
}

export interface ZhihuMemberActivityContentSegment {
  type: string;
  content?: string;
  own_text?: string;
  url?: string;
  data_draft_cover?: string;
}

export interface ZhihuRecentActivityCursor {
  offset: number;
  pageNum: number;
}

interface RawZhihuMemberActivity extends Omit<ZhihuMemberActivity, 'target'> {
  source?: {
    action_text?: string;
    action_time?: number;
    action_type?: string;
  };
  target?: {
    id?: string | number;
    type?: string;
    url?: string;
    created?: number;
    created_time?: number;
    reaction_relation?: { vote?: number | string };
    relationship?: {
      voting?: number | string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface ZhihuFollowResponse {
  follower_count?: number;
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }
  const response = error.response;
  if (!response || typeof response !== 'object' || !('status' in response)) {
    return undefined;
  }
  return typeof response.status === 'number' ? response.status : undefined;
}

export const getMember = async (
  id: string | number,
  include?: string,
): Promise<ZhihuMember> => {
  const res = await apiClient.get<ZhihuMember>(
    `/members/${id}?include=${include || MEMBER_INCLUDE}`,
  );
  return res.data;
};

export const getMemberWithFallback = async (id: string | number) => {
  try {
    return await getMember(id);
  } catch (error: unknown) {
    if (getErrorStatus(error) === 403) {
      return getMember(id, MEMBER_FALLBACK_INCLUDE);
    }
    throw error;
  }
};

export const getMemberActivities = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuListResponse<ZhihuMemberActivity>> => {
  const url = `https://www.zhihu.com/api/v3/moments/${id}/activities?limit=${limit}&offset=${offset}`;
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberActivity>>(url, {
    headers: {
      'x-api-version': '3.0.40',
    },
  });
  return res.data;
};

/** 获取「最近更新」入口对应用户的纯发布流。 */
export const getRecentMemberActivities = async (
  memberId: string | number,
  cursor: ZhihuRecentActivityCursor,
  signal?: AbortSignal,
): Promise<ZhihuListResponse<ZhihuMemberActivity>> => {
  const url = `https://api.zhihu.com/moments/recent/people/${memberId}/activities`;
  const res = await apiClient.get<ZhihuListResponse<RawZhihuMemberActivity>>(
    url,
    {
      signal,
      params: {
        action: 'down',
        offset: cursor.offset,
        page_num: cursor.pageNum,
      },
      headers: {
        'x-api-version': '3.0.93',
        'x-page-id': '10103',
      },
    },
  );

  return {
    ...res.data,
    data: res.data.data.map((activity) => {
      const { source, target } = activity;
      if (!target) {
        return {
          id: activity.id,
          source,
          type: activity.type,
          url: activity.url,
        };
      }

      const voting =
        target.relationship?.voting ?? target.reaction_relation?.vote;
      const normalizedVoting =
        voting === undefined ? undefined : Number(voting);

      return {
        ...activity,
        target: {
          ...target,
          // Pin ids exceed Number.MAX_SAFE_INTEGER. The URL retains the exact
          // decimal string after JSON parsing, while the numeric id does not.
          id: getRecentActivityTargetId(target),
          type: target.type === 'moments_pin' ? 'pin' : target.type,
          created: target.created ?? target.created_time ?? source?.action_time,
          relationship:
            normalizedVoting !== undefined && Number.isFinite(normalizedVoting)
              ? { ...target.relationship, voting: normalizedVoting }
              : undefined,
        },
      };
    }),
  };
};

export const getMemberRelations = async (
  id: string | number,
  type: 'answers' | 'questions' | 'articles' | 'pins',
  params: {
    limit?: number;
    offset?: number;
    include?: string;
    sort_by?: string;
    ws_qiangzhisafe?: number;
  },
  options: ApiRequestOptions = {},
): Promise<ZhihuListResponse<ZhihuMemberRelation>> => {
  const endpoint = `/members/${id}/${type}`;
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberRelation>>(
    endpoint,
    { ...options, params },
  );
  return res.data;
};

/** 获取当前登录者赞同过的此主页用户的回答。 */
export const getMemberAnswersVotedByMe = async (
  id: string | number,
  offset = 0,
  signal?: AbortSignal,
): Promise<ZhihuListResponse<ZhihuAnswer>> => {
  const res = await apiClient.get<ZhihuListResponse<ZhihuAnswer>>(
    `/members/${id}/relations/vote`,
    {
      signal,
      params: {
        include: MEMBER_ANSWERS_INCLUDE,
        limit: 20,
        offset,
        sort_by: 'created',
        ws_qiangzhisafe: 0,
      },
    },
  );
  return res.data;
};

export const followMember = async (
  id: string | number,
): Promise<ZhihuFollowResponse> => {
  const res = await apiClient.post<ZhihuFollowResponse>(
    `/members/${id}/followers`,
  );
  return res.data;
};

export const unfollowMember = async (
  id: string | number,
): Promise<ZhihuFollowResponse> => {
  const res = await apiClient.delete<ZhihuFollowResponse>(
    `/members/${id}/followers`,
  );
  return res.data;
};

export const getMemberFollowers = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuListResponse<ZhihuMemberListItem>> => {
  const include =
    'data[*].answer_count,articles_count,gender,follower_count,is_followed,is_following,badge[?(type=best_answerer)].topics';
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberListItem>>(
    `/members/${id}/followers?include=${include}&limit=${limit}&offset=${offset}`,
  );
  return res.data;
};

export const getMemberFollowing = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuListResponse<ZhihuMemberListItem>> => {
  const include =
    'data[*].answer_count,articles_count,gender,follower_count,is_followed,is_following,badge[?(type=best_answerer)].topics';
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberListItem>>(
    `/members/${id}/followees?include=${include}&limit=${limit}&offset=${offset}`,
  );
  return res.data;
};

export const getMemberMutual = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuListResponse<ZhihuMemberListItem>> => {
  const include =
    'data[*].answer_count,articles_count,gender,follower_count,is_followed,is_following,badge[?(type=best_answerer)].topics';
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberListItem>>(
    `/members/${id}/relations/mutuals?include=${include}&limit=${limit}&offset=${offset}`,
  );
  return res.data;
};
