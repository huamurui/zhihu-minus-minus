import { useEffect, useState } from 'react';
import { PageQueue, type PageQueueOptions } from '@/utils/pageQueue';

/**
 * A PageQueue that follows a paged list: whenever the list's next page is
 * `nextUrl`, that page and the predicted ones after it are kept in flight. The
 * relay follows the list's data, not its requests, so pages restored from a
 * cache start it too. Disabling it or unmounting aborts every queued request.
 *
 * `options` are read once, when the queue is created.
 */
export function usePageQueue<P>(
  options: PageQueueOptions<P>,
  { enabled, nextUrl }: { enabled: boolean; nextUrl: string | null },
): PageQueue<P> {
  const [queue] = useState(() => new PageQueue(options));

  useEffect(() => {
    if (enabled) queue.ahead(nextUrl);
    else queue.clear();
  }, [enabled, nextUrl, queue]);

  useEffect(() => () => queue.clear(), [queue]);

  return queue;
}
