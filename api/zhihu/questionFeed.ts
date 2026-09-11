import type { ZhihuPaging } from '@/types/zhihu';
import type { AnswerDetail } from './answer';

/** The card envelope returned by `/questions/{id}/feeds`. */
export interface ZhihuAppQuestionFeedCard {
  type?: string;
  target_type?: string;
  target?: ZhihuAppQuestionFeedAnswer;
  cursor?: string;
  position?: number;
  skip_count?: boolean | number;
  is_jump_native?: boolean;
}

export interface ZhihuAppReaction {
  relation?: {
    faved?: boolean;
    liked?: boolean;
    vote?: 'UP' | 'DOWN' | 'NEUTRAL';
  };
  statistics?: {
    down_vote_count?: number;
    favorites?: number;
    like_count?: number;
  };
}

export interface ZhihuAppReactionValue {
  count?: number;
  reacted?: boolean;
  reaction_type?: string;
  options?: Record<string, { count?: number }>;
}

export interface ZhihuAppMediaDetail {
  pdf_parsed_txt?: string;
  user_upload_parsed_content?: string;
}

export interface ZhihuAppRelevantInfo {
  is_relevant?: boolean;
  relevant_text?: string;
  relevant_type?: string;
}

export interface ZhihuAppThumbnailInfo {
  count?: number;
  thumbnails?: unknown[];
  type?: string;
}

/**
 * The App endpoint returns answer cards. `content` is present for some
 * answers, while `big_card_summary` is the only readable body for others.
 */
export interface ZhihuAppQuestionFeedAnswer
  extends Omit<Partial<AnswerDetail>, 'reaction'> {
  id: string | number;
  author?: AnswerDetail['author'];
  admin_closed_comment?: boolean;
  annotation_action?: unknown;
  attached_info?: string;
  big_card_summary?: string;
  business_type?: string;
  content_id?: string | number;
  content_mark?: Record<string, unknown>;
  content_text_length?: number;
  decorative_labels?: unknown[];
  exposed_medal?: unknown;
  has_publishing_draft?: boolean;
  is_mine?: boolean;
  is_navigator?: boolean;
  is_normal?: boolean;
  is_sticky?: boolean;
  is_visible?: boolean;
  matrix_tips?: string;
  media_detail?: ZhihuAppMediaDetail;
  navigator_vote?: boolean;
  reaction?: ZhihuAppReaction;
  reaction_instruction?: Record<string, unknown>;
  reactions?: Record<string, ZhihuAppReactionValue>;
  relevant_info?: ZhihuAppRelevantInfo;
  sticky_info?: string;
  thumbnail_info?: ZhihuAppThumbnailInfo;
  visible_only_to_author?: boolean;
  vote_next_step?: string;
}

export interface ZhihuAppQuestionFeedsPaging extends ZhihuPaging {
  page?: number;
  need_force_login?: boolean;
}

export interface ZhihuAppQuestionFeedsResponse {
  data: ZhihuAppQuestionFeedCard[];
  paging?: ZhihuAppQuestionFeedsPaging;
  read_count?: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function summaryToHtml(summary: string): string {
  return `<p>${escapeHtml(summary).replaceAll('\n', '<br />')}</p>`;
}

function getVoteCount(target: ZhihuAppQuestionFeedAnswer): number {
  return target.voteup_count ?? target.reactions?.VOTE?.options?.UP?.count ?? 0;
}

/** Convert App question cards into the answer list shape used by the UI. */
export function normalizeZhihuAppQuestionFeeds(
  response: ZhihuAppQuestionFeedsResponse,
): {
  data: AnswerDetail[];
  paging?: ZhihuAppQuestionFeedsPaging;
  read_count?: number;
} {
  const data = (response.data || []).flatMap((card) => {
    if (card.target_type && card.target_type !== 'answer') return [];
    const target = card.target;
    if (!target || !target.author) return [];

    const summary = target.big_card_summary?.trim() || '';
    const excerpt = target.excerpt?.trim() || summary;
    const content =
      typeof target.content === 'string' && target.content.trim()
        ? target.content
        : summaryToHtml(summary || excerpt);

    const answer: AnswerDetail = {
      ...target,
      id: target.id,
      type: 'answer',
      author: target.author,
      content,
      excerpt,
      created_time: target.created_time ?? 0,
      updated_time: target.updated_time,
      voteup_count: getVoteCount(target),
      comment_count: target.comment_count ?? 0,
      favlists_count: target.favlists_count ?? 0,
      // A summary is intentionally not treated as reusable full answer HTML.
      content_need_truncated:
        typeof target.content === 'string' && target.content.trim()
          ? target.content_need_truncated
          : true,
    };
    return [answer];
  });

  return { data, paging: response.paging, read_count: response.read_count };
}
