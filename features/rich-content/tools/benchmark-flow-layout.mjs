import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createTypeScriptRequire } from './load-typescript.mjs';

const require = createTypeScriptRequire(import.meta.url);
const { compileZhihuDocument } = require('../compileRichText.ts');
const {
  normalizeZhihuDocument,
} = require('../normalization/normalizeZhihuDocument.ts');
const { flowMetricStyles } = require('../flowLayout.ts');
const { legacyMetricStyles } = require('../tests/flow-layout-reference.ts');
const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../fixtures/cases/dense-metric-spans-001.json', import.meta.url),
    ),
    'utf8',
  ),
);
const flows = compileZhihuDocument(
  normalizeZhihuDocument(fixture.content, { documentId: fixture.id }).document,
  { fontSize: 17, lineHeight: 25.5 },
).parts.flatMap((part) => (part.type === 'flow' ? [part.flow] : []));
for (const flow of flows)
  assert.deepEqual(flowMetricStyles(flow), legacyMetricStyles(flow));
function medianTime(fn) {
  const times = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    for (const flow of flows) fn(flow);
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[3];
}
const legacyMs = medianTime(legacyMetricStyles);
const sweepMs = medianTime(flowMetricStyles);
console.log(
  JSON.stringify(
    {
      fixture: 'dense-metric-spans-001',
      flows: flows.length,
      spans: flows.reduce((sum, flow) => sum + flow.spans.length, 0),
      legacyMs,
      sweepMs,
      speedup: legacyMs / sweepMs,
      identical: true,
    },
    null,
    2,
  ),
);
