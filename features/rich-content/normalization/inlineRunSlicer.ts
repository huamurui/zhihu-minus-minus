import type { ZhihuInlineRun } from '../document';

interface IndexedRun {
  readonly run: ZhihuInlineRun;
  readonly start: number;
  readonly end: number;
  readonly children?: RunCursor;
}

interface RunCursor {
  readonly entries: readonly IndexedRun[];
  readonly length: number;
  index: number;
}

function indexRuns(runs: readonly ZhihuInlineRun[]): RunCursor {
  let length = 0;
  const entries = runs.map((run): IndexedRun => {
    const children = 'children' in run ? indexRuns(run.children) : undefined;
    const start = length;
    length += children
      ? children.length
      : 'text' in run
        ? run.text.length
        : run.type === 'unsupported'
          ? run.fallbackText.length
          : run.type === 'footnoteReference'
            ? run.label.length
            : 0;
    return { run, start, end: length, children };
  });
  return { entries, length, index: 0 };
}

function slice(
  cursor: RunCursor,
  start: number,
  end: number,
): ZhihuInlineRun[] {
  if (start === end) return [];
  const result: ZhihuInlineRun[] = [];
  while (cursor.index < cursor.entries.length) {
    const entry = cursor.entries[cursor.index];
    const { run } = entry;
    if (entry.start === entry.end) {
      // Attachments/breaks at a boundary belong to the following slice, except
      // trailing zero-length nodes, which belong to the final nonempty slice.
      if (entry.start >= end && !(end === cursor.length && entry.start === end))
        break;
      if (entry.start >= start) result.push(run);
      cursor.index += 1;
      continue;
    }
    if (entry.start >= end) break;
    const from = Math.max(start, entry.start);
    const to = Math.min(end, entry.end);
    if (from < to) {
      if (from === entry.start && to === entry.end) result.push(run);
      else if ('children' in run && entry.children)
        result.push({
          ...run,
          id: `${run.id}:slice:${start}:${end}`,
          children: slice(entry.children, from - entry.start, to - entry.start),
        });
      else if ('text' in run)
        result.push({
          ...run,
          id: `${run.id}:slice:${start}:${end}`,
          text: run.text.slice(from - entry.start, to - entry.start),
        });
      else if (run.type === 'unsupported')
        result.push({
          ...run,
          id: `${run.id}:slice:${start}:${end}`,
          fallbackText: run.fallbackText.slice(
            from - entry.start,
            to - entry.start,
          ),
        });
      else result.push(run);
    }
    if (entry.end > end) break;
    cursor.index += 1;
  }
  return result;
}

/** Internal paragraph slicer: callers supply non-overlapping, increasing ranges. */
export function createInlineRunSlicer(
  runs: readonly ZhihuInlineRun[],
): (start: number, end: number) => ZhihuInlineRun[] {
  const cursor = indexRuns(runs);
  return (start, end) => slice(cursor, start, end);
}
