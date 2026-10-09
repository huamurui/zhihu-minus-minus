import apiClient, { type ApiRequestOptions } from '../client';

export interface AnswerPagerItem {
  id: string | number;
  question?: { id: string | number };
  endorsements?: readonly unknown[];
}

export interface AnswerPagerPage {
  data: AnswerPagerItem[];
  paging?: { is_end: boolean; next: string };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('回答列表返回结构无效');
  return value as Record<string, unknown>;
}

function identifier(value: unknown): string | number {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return value;
  throw new Error('回答列表返回结构无效');
}

/** Keep pager identity and label metadata; list bodies are not certified detail content. */
export function normalizeAnswerPagerPage(value: unknown): AnswerPagerPage {
  const page = record(value);
  if (!Array.isArray(page.data)) throw new Error('回答列表返回结构无效');
  const data = page.data.flatMap((entry): AnswerPagerItem[] => {
    const item = record(entry);
    if (item.type !== undefined && item.type !== 'answer') return [];
    const question =
      item.question && typeof item.question === 'object'
        ? record(item.question)
        : undefined;
    return [
      {
        id: identifier(item.id),
        ...(question?.id != null && {
          question: { id: identifier(question.id) },
        }),
        ...(Array.isArray(item.endorsements) && {
          endorsements: item.endorsements,
        }),
      },
    ];
  });
  if (page.paging === undefined) return { data };
  const paging = record(page.paging);
  if (typeof paging.is_end !== 'boolean')
    throw new Error('回答列表返回结构无效');
  return {
    data,
    paging: {
      is_end: paging.is_end,
      next: typeof paging.next === 'string' ? paging.next : '',
    },
  };
}

/** Fetch thin question pager entries with the label metadata used above each body. */
export async function getQuestionAnswerPagerPage(
  questionId: string | number,
  sortBy: string,
  offset: number,
  options: ApiRequestOptions = {},
): Promise<AnswerPagerPage> {
  const response = await apiClient.get<unknown>(
    `/questions/${encodeURIComponent(String(questionId))}/answers`,
    {
      ...options,
      params: {
        include: 'data[*].id,endorsements',
        limit: 20,
        offset,
        sort_by: sortBy,
      },
    },
  );
  return normalizeAnswerPagerPage(response.data);
}
