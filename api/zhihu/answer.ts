import apiClient from '../client';

export const getAnswer = async (id: string | number, include?: string) => {
  const defaultInclude =
    'content,voteup_count,comment_count,author.headline,author.follower_count,author.badge,author.is_following,question.title,relationship.voting,relationship.is_author,created_time,updated_time,segment_infos';
  const res = await apiClient.get(
    `/answers/${id}?include=${include || defaultInclude}`,
  );
  return res.data;
};

export const voteAnswer = async (
  id: string | number,
  type: 'up' | 'neutral' | 'down',
) => {
  const res = await apiClient.post(`/answers/${id}/voters`, { type });
  return res.data;
};

export const createAnswer = async (
  questionId: string | number,
  text: string,
) => {
  // 转化成知乎喜欢的 HTML 格式
  const htmlContent = `<p>${text}</p>`;
  // 模拟 traceId (timestamp + uuid)
  const timestamp = Date.now();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const traceId = `${timestamp},${uuid}`;

  const payload = {
    action: 'answer',
    data: {
      publish: { traceId },
      hybridInfo: {},
      draft: { isPublished: false, disabled: 1 },
      extra_info: {
        question_id: String(questionId),
        publisher: 'pc',
      },
      hybrid: {
        html: htmlContent,
        textLength: text.length,
      },
      reprint: { reshipment_settings: 'allowed' },
      commentsPermission: { comment_permission: 'all' },
      appreciate: { can_reward: false, tagline: '' },
      publishSwitch: { draft_type: 'normal' },
      creationStatement: {
        disclaimer_status: 'close',
        disclaimer_type: 'none',
      },
      commercialReportInfo: { isReport: 0 },
      toFollower: {},
      contentsTables: { table_of_contents_enabled: false },
      thanksInvitation: { thank_inviter_status: 'close', thank_inviter: '' },
    },
  };

  // 使用 /content/publish 接口
  const res = await apiClient.post('/content/publish', payload);
  return res.data;
};

export const deleteAnswer = async (id: string | number) => {
  const res = await apiClient.delete(`/answers/${id}`);
  return res.data;
};

export const reactAnswerSegment = async (
  answerId: string | number,
  segId: string,
  content: string,
  paragraphId: string,
  startOffset: number,
  endOffset: number,
) => {
  const payload = {
    seg_id: segId,
    content: content,
    position: {
      start: { paragraph_id: paragraphId, offset: startOffset },
      end: { paragraph_id: paragraphId, offset: endOffset },
    },
  };
  const res = await apiClient.post(
    `/reaction/answers/${answerId}/segment_reaction`,
    payload,
  );
  return res.data;
};

export const unreactAnswerSegment = async (
  answerId: string | number,
  segId: string,
) => {
  // 根据抓包，这里 body 是 seg_ids 且为字符串
  const res = await apiClient.delete(
    `/reaction/answers/${answerId}/segment_reaction`,
    {
      data: { seg_ids: segId },
    },
  );
  return res.data;
};

export const getSegmentComments = async (
  answerId: string | number,
  segmentId: string,
  limit = 20,
  offset = '',
) => {
  const res = await apiClient.get(
    `/comment_v5/answers/${answerId}/segment/root_comment?segment_id=${segmentId}&order_by=score&limit=${limit}&offset=${offset}`,
  );
  // 基础标准化 (V5 扁平化了作者结构)
  if (res.data?.data) {
    res.data.data = res.data.data.map((comment: any) => {
      if (comment.author && !comment.author.member) {
        comment.author = { member: { ...comment.author } };
      }
      if (!comment.relationship && comment.liked !== undefined) {
        comment.relationship = { voting: comment.liked ? 1 : 0 };
      }
      if (
        comment.vote_count === undefined &&
        comment.like_count !== undefined
      ) {
        comment.vote_count = comment.like_count;
      }
      return comment;
    });
  }
  return res.data;
};
