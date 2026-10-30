import { PageQueue } from '../src/utils/pageQueue';

/** Pages named p1, p2, …; each page names the next one. */
const pageNumber = (url: string) => Number(url.slice(1));
const nextOf = (url: string) => `p${pageNumber(url) + 1}`;

function source() {
  const signals = new Map<string, AbortSignal>();
  const fetchPage = jest.fn(async (url: string, signal: AbortSignal) => {
    signals.set(url, signal);
    return { url };
  });
  return { fetchPage, signals };
}

function queue(fetchPage: ReturnType<typeof source>['fetchPage'], depth = 3) {
  return new PageQueue({
    fetchPage,
    predict: (url, count) =>
      Array.from(
        { length: count },
        (_, index) => `p${pageNumber(url) + index + 1}`,
      ),
    key: (url) => url,
    depth,
  });
}

const requested = (fetchPage: jest.Mock) =>
  fetchPage.mock.calls.map(([url]) => url);

test('keeps the named next page and the predicted ones in flight', () => {
  const { fetchPage } = source();
  const pages = queue(fetchPage);
  pages.ahead('p2');
  expect(requested(fetchPage)).toEqual(['p2', 'p3', 'p4']);
  expect(pages.pending).toEqual(['p2', 'p3', 'p4']);
});

test('hands over a queued page without asking again, then tops the relay up', async () => {
  const { fetchPage } = source();
  const pages = queue(fetchPage);
  pages.ahead('p2');
  await expect(pages.take('p2')).resolves.toEqual({ url: 'p2' });
  pages.ahead(nextOf('p2'));
  expect(requested(fetchPage)).toEqual(['p2', 'p3', 'p4', 'p5']);
  expect(pages.pending).toEqual(['p3', 'p4', 'p5']);
});

test('requests a page that was not predicted, and drops the guesses off its path', async () => {
  const { fetchPage, signals } = source();
  const pages = queue(fetchPage);
  pages.ahead('p2');
  await expect(pages.take('p9')).resolves.toEqual({ url: 'p9' });
  pages.ahead('p10');
  expect(pages.pending).toEqual(['p10', 'p11', 'p12']);
  expect(['p2', 'p3', 'p4'].map((url) => signals.get(url)?.aborted)).toEqual([
    true,
    true,
    true,
  ]);
});

test('retries a queued page whose request failed', async () => {
  const { fetchPage } = source();
  fetchPage.mockRejectedValueOnce(new Error('offline'));
  const pages = queue(fetchPage, 1);
  pages.ahead('p2');
  await expect(pages.take('p2')).resolves.toEqual({ url: 'p2' });
  expect(requested(fetchPage)).toEqual(['p2', 'p2']);
});

test('the end of the list or a clear aborts every queued request', () => {
  const { fetchPage, signals } = source();
  const pages = queue(fetchPage);
  pages.ahead('p2');
  pages.ahead(null);
  expect(pages.pending).toEqual([]);
  expect(signals.get('p2')?.aborted).toBe(true);

  pages.ahead('p5');
  pages.clear();
  expect(pages.pending).toEqual([]);
  expect(signals.get('p7')?.aborted).toBe(true);
});
