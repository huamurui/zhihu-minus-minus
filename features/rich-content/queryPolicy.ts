export const RICH_CONTENT_STALE_TIME = 5 * 60 * 1000;

export type RichContentEntityType =
  | 'answers'
  | 'articles'
  | 'pins'
  | 'questions';

interface FeedAnswerTarget {
  type?: string;
  content?: unknown;
  author?: unknown;
  question?: unknown;
  answer_type?: unknown;
  paid_info?: unknown;
  content_need_truncated?: boolean;
}

export function hasInlineRichContent(content: unknown): boolean {
  if (Array.isArray(content)) return content.length > 0;
  return typeof content === 'string' && content.trim().length > 0;
}

export function hasReusableAnswerDetail(target: FeedAnswerTarget): boolean {
  const answerType =
    typeof target.answer_type === 'string'
      ? target.answer_type.toUpperCase()
      : undefined;

  return (
    target.type === 'answer' &&
    hasInlineRichContent(target.content) &&
    Boolean(target.author) &&
    Boolean(target.question) &&
    answerType !== 'PAID' &&
    target.paid_info == null &&
    target.content_need_truncated !== true
  );
}

export function getRichContentQueryKey(
  type: RichContentEntityType,
  id: string,
  isAuthenticated?: boolean,
) {
  const keyByType: Record<RichContentEntityType, string> = {
    answers: 'answer-detail',
    articles: 'zhihu-article',
    pins: 'pin-detail',
    questions: 'question',
  };

  if (type === 'questions' && isAuthenticated !== undefined) {
    return [keyByType[type], id, isAuthenticated] as const;
  }

  return [keyByType[type], id] as const;
}

export function getNeighborAnswerIds(
  answerIds: readonly string[],
  currentPage: number,
): string[] {
  return [answerIds[currentPage - 1], answerIds[currentPage + 1]].filter(
    (answerId): answerId is string => Boolean(answerId),
  );
}
