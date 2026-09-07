import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const COMPATIBILITY_FILES = new Set([
  path.join(REPO_ROOT, 'components/ZhihuContent.tsx'),
  path.join(REPO_ROOT, 'components/ZhihuDOMContent.tsx'),
]);
const LEGACY_IMPORT_PATTERN =
  /from\s+['"](?:@\/components\/ZhihuContent|\.\/ZhihuContent)['"]/;

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(entryPath);
      return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nestedFiles.flat();
}

test('application code imports rich content through the feature entry point', async () => {
  const sourceFiles = (
    await Promise.all(
      ['app', 'components'].map((directory) =>
        listSourceFiles(path.join(REPO_ROOT, directory)),
      ),
    )
  )
    .flat()
    .filter((filePath) => !COMPATIBILITY_FILES.has(filePath));

  const violations = [];
  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    if (LEGACY_IMPORT_PATTERN.test(source)) {
      violations.push(path.relative(REPO_ROOT, filePath));
    }
  }

  assert.deepEqual(violations, []);
});

test('the fixture browser is only reachable from development builds', async () => {
  const [devLayout, profileScreen] = await Promise.all([
    readFile(path.join(REPO_ROOT, 'app/dev/_layout.tsx'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'app/(tabs)/profile.tsx'), 'utf8'),
  ]);

  assert.match(devLayout, /if \(!__DEV__\) return <Redirect href="\/" \/>/);
  assert.match(
    profileScreen,
    /\{__DEV__ && \([\s\S]*title="富文本测试案例（开发）"/,
  );
});
