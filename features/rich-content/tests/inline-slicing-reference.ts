import type { ZhihuInlineRun } from '../document';

/** Pre-optimization implementation, retained only for differential checks. */
export function legacyInlineText(runs: readonly ZhihuInlineRun[]): string {
  return runs
    .map((run) => {
      if ('children' in run) return legacyInlineText(run.children);
      if ('text' in run) return run.text;
      if (run.type === 'unsupported') return run.fallbackText;
      if (run.type === 'footnoteReference') return run.label;
      return '';
    })
    .join('');
}

export function legacySliceRuns(
  runs: readonly ZhihuInlineRun[],
  start: number,
  end: number,
  total: number,
): ZhihuInlineRun[] {
  if (start === end) return [];
  let offset = 0;
  const result: ZhihuInlineRun[] = [];
  for (const run of runs) {
    const length = legacyInlineText([run]).length;
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    const suffix = `:slice:${start}:${end}`;
    if (length === 0) {
      if (
        offset >= start &&
        (offset < end || (end === total && offset === end))
      )
        result.push(run);
    } else if (from < to) {
      if (from === offset && to === offset + length) result.push(run);
      else if ('children' in run)
        result.push({
          ...run,
          id: run.id + suffix,
          children: legacySliceRuns(
            run.children,
            from - offset,
            to - offset,
            length,
          ),
        });
      else if ('text' in run)
        result.push({
          ...run,
          id: run.id + suffix,
          text: run.text.slice(from - offset, to - offset),
        });
      else if (run.type === 'unsupported')
        result.push({
          ...run,
          id: run.id + suffix,
          fallbackText: run.fallbackText.slice(from - offset, to - offset),
        });
      else result.push(run);
    }
    offset += length;
  }
  return result;
}
