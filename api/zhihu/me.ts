import apiClient from '../client';

export const getMe = async () => {
  const include =
    'ad_type,email,account_status,is_bind_phone,available_message_types,default_notifications_count,follow_notifications_count,vote_thank_notifications_count,messages_count,is_org,avatar_url,name,url_token,draft_count,following_question_count,is_realname,is_force_renamed,renamed_fullname,is_destroy_waiting';
  const res = await apiClient.get(`/me?include=${include}`);
  return res.data;
};

export const getMyLikes = async (
  type: 'answers' | 'articles',
  limit = 20,
  offset = 0,
) => {
  const endpoint = type === 'answers' ? 'voted_answers' : 'voted_articles';
  const include =
    'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting';
  const res = await apiClient.get(
    `/members/me/${endpoint}?limit=${limit}&offset=${offset}&include=${include}`,
  );
  return res.data;
};
