import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { transformSync } from '@babel/core';
import ts from 'typescript';
import * as middleware from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

const require = createRequire(import.meta.url);
const { code: appearanceSource } = transformSync(
  readFileSync(
    require.resolve('react-native/Libraries/Utilities/Appearance.js'),
    'utf8',
  ),
  {
    babelrc: false,
    configFile: false,
    plugins: [
      '@babel/plugin-transform-flow-strip-types',
      '@babel/plugin-transform-modules-commonjs',
    ],
  },
);
const interopSource = readFileSync(
  require.resolve(
    'react-native-css-interop/dist/runtime/native/appearance-observables.js',
  ),
  'utf8',
);

function loadModule(source, modules) {
  const exports = {};
  runInNewContext(source, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
    // Exercise NativeWind's production event path, not its test-only override.
    process: { env: { NODE_ENV: 'development' } },
    console,
  });
  return exports;
}

const source = readFileSync(
  new URL('../store/useThemeStore.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

async function createHarness(systemScheme = 'dark', persistedMode = null) {
  let osScheme = systemScheme;
  let override = null;
  let saved = persistedMode
    ? JSON.stringify({ version: 1, state: { themeMode: persistedMode } })
    : null;
  let previousDependencies;
  const nativeCalls = [];
  const nativeListeners = new Set();
  const appStateListeners = new Set();
  class EventEmitter {
    listeners = new Set();
    addListener(_event, listener) {
      this.listeners.add(listener);
      return { remove: () => this.listeners.delete(listener) };
    }
    emit(_event, value) {
      for (const listener of this.listeners) listener(value);
    }
  }
  const emit = () => {
    for (const listener of nativeListeners) {
      listener({ colorScheme: override ?? osScheme });
    }
  };
  const nativeAppearance = {
    getColorScheme: () => override ?? osScheme,
    setColorScheme(value) {
      assert.ok(
        ['light', 'dark', 'unspecified'].includes(value),
        `AppearanceModule.setColorScheme requires a non-null style, received ${value}`,
      );
      nativeCalls.push(value);
      const previousScheme = override ?? osScheme;
      // Android applies the override on the UI thread asynchronously.
      queueMicrotask(() => {
        override = value === 'unspecified' ? null : value;
        if (previousScheme !== (override ?? osScheme)) emit();
      });
    },
  };
  const appearance = loadModule(appearanceSource, {
    './NativeAppearance': { default: nativeAppearance },
    '../vendor/emitter/EventEmitter': EventEmitter,
    '../EventEmitter/NativeEventEmitter': class {
      addListener(_event, listener) {
        nativeListeners.add(listener);
        return { remove: () => nativeListeners.delete(listener) };
      }
    },
  });
  const appState = {
    currentState: 'active',
    addEventListener(_event, listener) {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    },
  };
  const interop = loadModule(interopSource, {
    'react-native': {
      Appearance: appearance,
      AppState: appState,
      AccessibilityInfo: {
        isReduceMotionEnabled: async () => false,
        addEventListener() {},
      },
    },
    '../../shared': require('react-native-css-interop/dist/shared'),
    '../observable': require('react-native-css-interop/dist/runtime/observable'),
  });
  const nativewind = {
    colorScheme: interop.colorScheme,
  };
  const modules = {
    'expo-secure-store': {
      getItemAsync: async () => saved,
      setItemAsync: async (_name, value) => {
        saved = value;
      },
      deleteItemAsync: async () => {
        saved = null;
      },
    },
    nativewind,
    react: {
      useEffect(effect, dependencies) {
        if (
          !previousDependencies ||
          dependencies.some(
            (value, index) => !Object.is(value, previousDependencies[index]),
          )
        ) {
          previousDependencies = dependencies;
          effect();
        }
      },
    },
    'react-native': {
      Appearance: appearance,
      Platform: { OS: 'android' },
      TurboModuleRegistry: {
        get(name) {
          assert.equal(name, 'Appearance');
          return nativeAppearance;
        },
      },
    },
    zustand: {
      create: () => (initializer) => {
        const store = createStore(initializer);
        return Object.assign((selector) => selector(store.getState()), store);
      },
    },
    'zustand/middleware': middleware,
  };
  const exports = loadModule(outputText, modules);
  const store = exports.useThemeStore;
  async function flush() {
    await setImmediate();
    // biome-ignore lint/correctness/useHookAtTopLevel: React hooks are mocked above to drive the store integration without a native renderer.
    exports.useSyncThemeWithNativeWind();
    await setImmediate();
  }
  await flush();
  return {
    store,
    nativeCalls,
    nativewindScheme: () => interop.colorScheme.get(),
    appearanceScheme: () => appearance.getColorScheme(),
    savedMode: () => JSON.parse(saved).state.themeMode,
    async select(mode) {
      store.getState().setThemeMode(mode);
      await flush();
    },
    async changeSystem(mode) {
      osScheme = mode;
      if (override === null) emit();
      await flush();
    },
    async resume() {
      for (const state of ['background', 'active']) {
        appState.currentState = state;
        for (const listener of appStateListeners) listener(state);
      }
      await flush();
    },
  };
}

test('system mode follows OS appearance changes in both directions', async () => {
  const app = await createHarness();
  assert.deepEqual(app.nativeCalls, ['unspecified']);
  assert.equal(app.nativewindScheme(), 'dark');
  assert.equal(app.store.getState().isDark, true);
  await app.changeSystem('light');
  assert.equal(app.store.getState().isDark, false);
  assert.equal(app.nativewindScheme(), 'light');
  await app.changeSystem('dark');
  assert.equal(app.store.getState().isDark, true);
  assert.equal(app.nativewindScheme(), 'dark');
  assert.equal(app.store.getState().themeMode, 'system');
});

for (const manualMode of ['light', 'dark']) {
  test(`${manualMode} ignores OS changes and releases its override on system selection`, async () => {
    const app = await createHarness(manualMode);
    await app.select(manualMode);
    await app.changeSystem(manualMode === 'light' ? 'dark' : 'light');
    assert.equal(app.store.getState().isDark, manualMode === 'dark');
    await app.select('system');
    assert.equal(app.store.getState().isDark, manualMode === 'light');
    assert.equal(
      app.nativewindScheme(),
      manualMode === 'light' ? 'dark' : 'light',
    );
    assert.equal(app.savedMode(), 'system');
  });
}

test('returning to system with unchanged color still releases the override', async () => {
  const app = await createHarness('light');
  await app.select('light');
  await app.select('system');
  await app.changeSystem('dark');
  assert.equal(app.store.getState().isDark, true);
});

for (const scheme of ['light', 'dark']) {
  test(`system ${scheme} remains resolved after startup, same-color override release and resume`, async () => {
    const app = await createHarness(scheme);
    await app.resume();
    assert.equal(app.appearanceScheme(), scheme);
    assert.equal(app.nativewindScheme(), scheme);
    await app.select(scheme);
    await app.select('system');
    await app.resume();
    assert.equal(app.appearanceScheme(), scheme);
    assert.equal(app.nativewindScheme(), scheme);
    assert.equal(app.store.getState().isDark, scheme === 'dark');
    await app.changeSystem(scheme === 'light' ? 'dark' : 'light');
    assert.equal(app.nativewindScheme(), scheme === 'light' ? 'dark' : 'light');
  });
}

test('saved modes hydrate correctly, including system after an OS change', async () => {
  for (const mode of ['system', 'light', 'dark']) {
    const app = await createHarness('light');
    await app.select(mode);
    const restarted = await createHarness('dark', app.savedMode());
    assert.equal(restarted.store.getState().hasHydrated, true);
    assert.equal(restarted.store.getState().themeMode, mode);
    assert.equal(restarted.store.getState().isDark, mode !== 'light');
  }
});
