/** With 多页同时加载 on, offset-paged lists request this many pages at once. */
export const PARALLEL_PAGE_COUNT = 3;

interface Page<T> {
  data: T[];
  paging?: { is_end?: boolean; next?: string | null };
}

function identity(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const record = item as {
    id?: unknown;
    type?: unknown;
    target?: { id?: unknown; type?: unknown };
  };
  const id = record.target?.id ?? record.id;
  if (id === undefined || id === null || id === '') return undefined;
  return `${String(record.target?.type ?? record.type ?? '')}:${String(id)}`;
}

/**
 * Join consecutive pages into one, dropping items an earlier page already had
 * (Zhihu repeats items across pages). The joined page continues from the last
 * page kept.
 */
export function joinPages<T, P extends Page<T>>(pages: P[]): P {
  const seen = new Set<string>();
  const data = pages.flatMap((page) =>
    page.data.filter((item) => {
      const key = identity(item);
      if (key === undefined) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return { ...pages[pages.length - 1], data };
}

/**
 * Offset-paged lists (`/members/{id}/answers` and the like) name every page by
 * its offset, so the next pages can be requested together. Pages after the end
 * or after a failed request are dropped, and so is an empty extra page: its
 * `is_end` would otherwise end the list early, and the page after the last
 * kept one is requested on its own next time. The first page's failure is the
 * request's failure.
 */
export async function fetchOffsetPages<T, P extends Page<T>>(
  fetchPage: (offset: number) => Promise<P>,
  offset: number,
  limit: number,
  count = PARALLEL_PAGE_COUNT,
): Promise<P> {
  const [first, ...settled] = await Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      fetchPage(offset + index * limit),
    ),
  );
  if (first.status === 'rejected') throw first.reason;
  const pages = [first.value];
  for (const result of settled) {
    const previous = pages[pages.length - 1];
    if (
      previous.paging?.is_end ||
      result.status !== 'fulfilled' ||
      result.value.data.length === 0
    )
      break;
    pages.push(result.value);
  }
  return joinPages<T, P>(pages);
}

const RECOMMEND_PATH = '/api/v3/feed/topstory/recommend';
const RECOMMEND_CURSOR_KEYS = [
  'page_number',
  'after_id',
  'end_offset',
] as const;

/**
 * The Web recommendation feed pages by a cursor in its `next` URL: one session
 * token, `page_number` + 1 and `after_id` / `end_offset` + the page size (6) per
 * page. Predict the URLs `ahead` pages past `url`, or undefined when `url` is
 * not such a page.
 */
export function predictRecommendUrls(
  url: string,
  ahead: number,
  pageSize: number,
): string[] | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!parsed.pathname.endsWith(RECOMMEND_PATH)) return undefined;
  if (!parsed.searchParams.get('session_token')) return undefined;
  const cursor = RECOMMEND_CURSOR_KEYS.map((key) =>
    Number(parsed.searchParams.get(key)),
  );
  if (cursor.some((value) => !Number.isSafeInteger(value))) return undefined;
  const [pageNumber, afterId, endOffset] = cursor;
  return Array.from({ length: ahead }, (_, index) => {
    const step = index + 1;
    const next = new URL(parsed);
    next.searchParams.set('page_number', String(pageNumber + step));
    next.searchParams.set('after_id', String(afterId + step * pageSize));
    next.searchParams.set('end_offset', String(endOffset + step * pageSize));
    return next.toString();
  });
}

/** The Web recommendation feed returns this many items per page. */
export const RECOMMEND_PAGE_SIZE = 6;

/**
 * With 多页同时加载 on, recommendation requests kept in flight ahead of the
 * list (see PageQueue). On device only 3–4 of a page's 6 items survive
 * filtering and de-duplication, and a page takes 1.5–3 s, so 6 pages keep a
 * fast fling fed.
 */
export const RECOMMEND_QUEUE_DEPTH = 6;

/**
 * Identity of a recommendation page: its session and cursor, whatever the
 * scheme (`next` arrives as http) or parameter order. Other URLs are their own
 * identity.
 */
export function recommendPageKey(url: string): string {
  try {
    const parsed = new URL(url);
    const session = parsed.searchParams.get('session_token');
    if (parsed.pathname.endsWith(RECOMMEND_PATH) && session)
      return [
        'recommend',
        session,
        ...RECOMMEND_CURSOR_KEYS.map((key) => parsed.searchParams.get(key)),
      ].join(':');
  } catch {
    // Not an absolute URL: fall back to the text itself.
  }
  return url;
}
