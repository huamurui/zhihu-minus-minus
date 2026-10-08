import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createTypeScriptRequire } from './load-typescript.mjs';

const require = createTypeScriptRequire(import.meta.url);
const {
  normalizeZhihuDocument,
} = require('../normalization/normalizeZhihuDocument.ts');
const slicer = require('../normalization/inlineRunSlicer.ts');
const {
  legacyInlineText,
  legacySliceRuns,
} = require('../tests/inline-slicing-reference.ts');
const currentSlicer = slicer.createInlineRunSlicer;
const legacySlicer = (runs) => {
  const total = legacyInlineText(runs).length;
  return (start, end) => legacySliceRuns(runs, start, end, total);
};

function medianTime(fn) {
  const samples = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((first, second) => first - second)[3];
}

for (const count of [500, 1000, 2000, 4000]) {
  const html = `<p data-pid="benchmark">${'<b>甲乙</b>'.repeat(count)}</p>`;
  const options = {
    documentId: 'benchmark:normalization',
    segmentInfos: [
      {
        pid: 'benchmark',
        text: '甲乙'.repeat(count),
        marks: Array.from({ length: count }, (_, index) => ({
          start_index: index * 2,
          end_index: index * 2 + 1,
        })),
      },
    ],
  };
  // Swap only the internal slicer in this synchronous tool process, so both
  // implementations exercise the same complete normalization and validation.
  const normalize = (implementation) => {
    slicer.createInlineRunSlicer = implementation;
    try {
      return normalizeZhihuDocument(html, options);
    } finally {
      slicer.createInlineRunSlicer = currentSlicer;
    }
  };
  assert.deepEqual(normalize(currentSlicer), normalize(legacySlicer));
  const legacyMs = medianTime(() => normalize(legacySlicer));
  const cursorMs = medianTime(() => normalize(currentSlicer));
  console.log(
    JSON.stringify({
      nodes: count,
      marks: count,
      characters: count * 2,
      legacyMs,
      cursorMs,
      speedup: legacyMs / cursorMs,
      identical: true,
    }),
  );
}
