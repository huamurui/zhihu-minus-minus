/**
 * A relay of page requests running ahead of a paged list.
 *
 * The list still asks for one page at a time, by the URL the previous page
 * named. After each page, `ahead` queues that next URL and the pages predicted
 * after it, so up to `depth` requests are in flight before the list asks.
 * `take` hands over the queued request for a URL, or requests it on the spot.
 *
 * Queued requests are found by `key`, so a prediction that does not match the
 * URL the list actually asks for is never used: a wrong guess costs a request,
 * never wrong or repeated content. Requests off the current path are aborted.
 */
export interface PageQueueOptions<P> {
  fetchPage: (url: string, signal: AbortSignal) => Promise<P>;
  /** URLs expected after `url`, nearest first; [] when they cannot be known. */
  predict: (url: string, count: number) => string[];
  /** Identity of the page a URL names; requests match on it. */
  key: (url: string) => string;
  /** Requests kept in flight ahead of the list, the named next page included. */
  depth: number;
}

interface Entry<P> {
  promise: Promise<P>;
  controller: AbortController;
}

export class PageQueue<P> {
  private readonly entries = new Map<string, Entry<P>>();

  constructor(private readonly options: PageQueueOptions<P>) {}

  /** Queued page keys, nearest first. */
  get pending(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * The page for `url`: the queued request when there is one, otherwise a new
   * request that `signal` can cancel. A queued request that failed is retried
   * once on the spot, so a failed prefetch only costs time.
   */
  async take(url: string, signal?: AbortSignal): Promise<P> {
    const key = this.options.key(url);
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      try {
        return await entry.promise;
      } catch {
        // Fall through to a fresh request.
      }
    }
    return this.options.fetchPage(url, signal ?? new AbortController().signal);
  }

  /**
   * The list's next page is `url`: keep it and the predicted pages after it in
   * flight, and abort queued requests off that path. `null` ends the list.
   */
  ahead(url: string | null) {
    if (!url || this.options.depth <= 0) {
      this.clear();
      return;
    }
    const path = [url, ...this.options.predict(url, this.options.depth - 1)];
    const wanted = new Map(path.map((next) => [this.options.key(next), next]));
    for (const [key, entry] of this.entries) {
      if (wanted.has(key)) continue;
      entry.controller.abort();
      this.entries.delete(key);
    }
    for (const [key, next] of wanted) {
      if (this.entries.has(key)) continue;
      const controller = new AbortController();
      const promise = this.options.fetchPage(next, controller.signal);
      // A request nobody takes must not surface as an unhandled rejection.
      promise.catch(() => undefined);
      this.entries.set(key, { promise, controller });
    }
  }

  /** Abort and forget every queued request. */
  clear() {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }
}
