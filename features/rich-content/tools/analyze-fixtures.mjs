import { fileURLToPath } from 'node:url';
import {
  analyzeFixtureCase,
  analyzeFixtureDirectory,
  loadManifest,
} from './fixture-lib.mjs';

const manifestPath = fileURLToPath(
  new URL('../fixtures/manifest.json', import.meta.url),
);
const inboxPath = fileURLToPath(new URL('../fixtures/inbox/', import.meta.url));
const analyzeInbox = process.argv.includes('--inbox');
const requestedIds = new Set(
  process.argv
    .slice(2)
    .filter((argument) => !['--inbox', '--json'].includes(argument)),
);
let results;

if (analyzeInbox) {
  results = await analyzeFixtureDirectory(inboxPath);
} else {
  const manifest = await loadManifest(manifestPath);
  const selectedCases = requestedIds.size
    ? manifest.cases.filter((fixtureCase) => requestedIds.has(fixtureCase.id))
    : manifest.cases;

  if (selectedCases.length === 0) {
    throw new Error(
      `No matching fixtures: ${Array.from(requestedIds).join(', ')}`,
    );
  }

  results = await Promise.all(
    selectedCases.map((fixtureCase) =>
      analyzeFixtureCase(fixtureCase, manifestPath),
    ),
  );
}

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      results.map(({ id, sourceType, traits, stats, errors }) => ({
        id,
        sourceType,
        traits,
        stats,
        errors,
      })),
      null,
      2,
    ),
  );
} else {
  console.table(
    results.map(({ id, stats, errors }) => ({
      id,
      paragraphs: stats.paragraphs,
      headings: stats.headings,
      images: `${stats.activeImages}/${stats.totalImages}`,
      formulas: stats.formulaImages,
      videos: stats.videoBoxes,
      segments: stats.segmentInfos,
      validation: analyzeInbox
        ? 'unregistered'
        : errors.length === 0
          ? 'ok'
          : `${errors.length} error(s)`,
    })),
  );
}

const failures = results.flatMap(({ id, errors }) =>
  errors.map((error) => `${id}: ${error}`),
);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
