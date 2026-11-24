const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Run the real Metro config outside Jest's React Native module mocks. A single
// transformed script exercises its production serializer without a Metro server.
const serializeFixture = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Consumer } = require('@expo/metro/metro-source-map');
const config = require('./metro.config');

async function main() {
  const platform = process.argv[1];
  const root = process.cwd();
  const entry = path.join(root, 'sentry-fixture.js');
  const code = 'globalThis.fixtureRan = true;';
  const fixture = {
    path: entry,
    dependencies: new Map(),
    inverseDependencies: new Set(),
    getSource: () => Buffer.from(code),
    output: [{
      type: 'js/script',
      data: { code, lineCount: 1, map: [[1, 0, 1, 0]] },
    }],
  };
  const graph = {
    dependencies: new Map([[entry, fixture]]),
    entryPoints: new Set([entry]),
    transformOptions: {
      dev: false,
      hot: false,
      platform,
      customTransformOptions: {},
    },
  };
  const ids = new Map();
  const result = await config.serializer.customSerializer(entry, [], graph, {
    createModuleId: (file) => {
      if (!ids.has(file)) ids.set(file, ids.size);
      return ids.get(file);
    },
    dev: false,
    projectRoot: root,
    serverRoot: root,
    processModuleFilter: () => true,
    shouldAddToIgnoreList: () => false,
    getRunModuleStatement: () => '',
    runModule: false,
    runBeforeMainModule: [],
    inlineSourceMap: false,
    sourceMapUrl: 'fixture.bundle.map',
    modulesOnly: false,
  });
  const sandbox = {};
  vm.runInNewContext(result.code, sandbox, { filename: 'fixture.bundle' });
  const sourceMap = JSON.parse(result.map);
  // Metro 0.87 emits indexed maps. Its consumer handles both flat maps and
  // sections without weakening the source-content or original-position checks.
  const consumer = new Consumer(sourceMap);
  const generatedStart = result.code.indexOf(code);
  if (generatedStart < 0) throw new Error('Fixture is missing from the bundle.');
  const precedingCode = result.code.slice(0, generatedStart);
  const position = consumer.originalPositionFor({
    line: precedingCode.split('\n').length,
    column: precedingCode.length - precedingCode.lastIndexOf('\n') - 1,
  });

  // NativeWind must still redirect the configured CSS entry to a native module.
  const cssEntry = path.join(root, 'src/global.css');
  const cssModule = config.resolver.resolveRequest({
    resolveRequest: () => ({ type: 'sourceFile', filePath: cssEntry }),
    isDev: false,
  }, cssEntry, platform);
  const resolveSentry = (moduleName, originModulePath = entry) =>
    config.resolver.resolveRequest({
      resolveRequest: () => ({ type: 'sourceFile', filePath: entry }),
      originModulePath,
      isDev: false,
    }, moduleName, platform);
  const excludedWebPackages = [
    '@sentry/replay',
    '@sentry/replay-canvas',
    '@sentry-internal/replay',
    '@sentry/feedback',
    '@sentry-internal/feedback',
  ].every((moduleName) => resolveSentry(moduleName).type === 'empty');
  // Exercise both host path formats even when CI runs entirely on Linux.
  const originPaths = [path.win32, path.posix];
  const index = (paths, pkg) => paths.join('fixture', 'node_modules', '@sentry', pkg, 'build', 'index.js');
  const feedbackWrappersScoped = ['./feedbackSync.js', './feedbackAsync.js'].every((moduleName) =>
    originPaths.every((paths) =>
      resolveSentry(moduleName, index(paths, 'browser')).type === 'empty'
      && resolveSentry(moduleName, index(paths, 'browser-utils')).type === 'sourceFile'
    ) && resolveSentry(moduleName, entry).type === 'sourceFile',
  );
  const errorPackagesPreserved = [
    '@sentry/react-native',
    '@sentry/core',
    '@sentry/browser',
  ].every((moduleName) =>
    originPaths.every((paths) => resolveSentry(moduleName, index(paths, 'browser')).type === 'sourceFile'),
  );
  process.stdout.write(JSON.stringify({
    registeredDebugIds: Object.values(sandbox._sentryDebugIds || {}),
    mapDebugId: sourceMap.debugId ?? sourceMap.debug_id,
    bundleHasMatchingId: result.code.includes('//# debugId=' + sourceMap.debugId),
    sourceRetained: consumer.sourceContentFor(entry, true) === code,
    sourcePositionRetained: position.source === entry
      && position.line === 1 && position.column === 0,
    fixtureRan: sandbox.fixtureRan === true,
    cssResolved: cssModule.type === 'sourceFile'
      && cssModule.filePath !== cssEntry
      && fs.existsSync(cssModule.filePath),
    excludedWebPackages,
    errorPackagesPreserved,
    feedbackWrappersScoped,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

test.each(['android', 'ios'])(
  '%s registers the source map Debug ID with NativeWind enabled',
  (platform) => {
    const result = JSON.parse(
      execFileSync(process.execPath, ['-e', serializeFixture, platform], {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 15_000,
      }),
    );

    expect(result.mapDebugId).toMatch(
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
    );
    expect(result.registeredDebugIds).toEqual([result.mapDebugId]);
    expect(result).toMatchObject({
      bundleHasMatchingId: true,
      sourceRetained: true,
      sourcePositionRetained: true,
      fixtureRan: true,
      cssResolved: true,
      excludedWebPackages: true,
      errorPackagesPreserved: true,
      feedbackWrappersScoped: true,
    });
  },
);
