import type { ZhihuPaging } from '@/types/zhihu';
import type { AnswerDetail } from './answer';

/** The card envelope returned by `/questions/{id}/feeds`. */
export interface ZhihuAppQuestionFeedCard {
  type?: string;
  target_type?: string;
  target?: ZhihuAppQuestionFeedAnswer;
  cursor?: string;
  position?: number;
  skip_count?: number;
}

/**
 * The App endpoint returns a preview answer, not the web `/answers` shape.
 * `big_card_summary` is the readable body used when `content` is withheld.
 */
export interface ZhihuAppQuestionFeedAnswer extends Partial<AnswerDetail> {
  id: string | number;
  author?: AnswerDetail['author'];
  big_card_summary?: string;
  content_text_length?: number;
  reactions?: Record<
    string,
    {
      count?: number;
      reacted?: boolean;
      options?: Record<string, { count?: number }>;
    }
  >;
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
