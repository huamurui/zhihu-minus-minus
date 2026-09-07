import type {
  ZhihuAuthor,
  ZhihuMemberRelation,
  ZhihuPaging,
} from '@/types/zhihu';
import apiClient from '../client';

export const MEMBER_INCLUDE =
  'url_token,answer_count,articles_count,question_count,pins_count,follower_count,following_count,headline,cover_url,description,voteup_count,thanked_count,favorited_count,is_following,mutual_followees_count';

export const MEMBER_ANSWERS_INCLUDE =
  'data[*].is_normal,admin_closed_comment,reward_info,is_collapsed,annotation_action,annotation_detail,collapse_reason,collapsed_by,suggest_edit,comment_count,can_comment,content,editable_content,attachment,voteup_count,reshipment_settings,comment_permission,created_time,updated_time,review_info,excerpt,paid_info,reaction_instruction,is_labeled,label_info,relationship.is_authorized,voting,is_author,is_thanked,is_nothelp,reaction,vessay_info;data[*].author.badge[?(type=best_answerer)].topics;data[*].author.kvip_info;data[*].author.vip_info;data[*].question.has_publishing_draft,relationship';

const MEMBER_FALLBACK_INCLUDE =
  'id,url_token,name,avatar_url,follower_count,following_count,headline,cover_url,description,answer_count,articles_count,question_count,pins_count,voteup_count,is_following,mutual_followees_count';

export interface ZhihuMember extends ZhihuAuthor {
  answer_count?: number;
  articles_count?: number;
  question_count?: number;
  pins_count?: number;
  follower_count?: number;
  following_count?: number;
  cover_url?: string;
  description?: string;
  voteup_count?: number;
  thanked_count?: number;
  favorited_count?: number;
  mutual_followees_count?: number;
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
  target?: ZhihuMemberRelation;
  type?: string;
  url?: string;
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
): Promise<ZhihuListResponse<ZhihuMemberRelation>> => {
  const endpoint = `/members/${id}/${type}`;
  const res = await apiClient.get<ZhihuListResponse<ZhihuMemberRelation>>(
    endpoint,
    { params },
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
