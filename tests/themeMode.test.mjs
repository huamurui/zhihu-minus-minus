import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as middleware from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

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
  let cachedScheme = systemScheme;
  let saved = persistedMode
    ? JSON.stringify({ version: 1, state: { themeMode: persistedMode } })
    : null;
  let previousDependencies;
  const listeners = new Set();
  const emit = () => {
    cachedScheme = override ?? osScheme;
    for (const listener of listeners) {
      listener({ colorScheme: cachedScheme });
    }
  };
  const appearance = {
    getColorScheme: () => cachedScheme,
    setColorScheme(value) {
      const previousScheme = override ?? osScheme;
      override = value;
      // RN caches the supplied value; the resolved native appearance arrives
      // asynchronously, and only emits when the effective appearance changes.
      cachedScheme = value;
      if (previousScheme !== (override ?? osScheme)) queueMicrotask(emit);
    },
    addChangeListener(listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  // NativeWind's native setter forwards system as null to Appearance.
  const setColorScheme = (mode) =>
    appearance.setColorScheme(mode === 'system' ? null : mode);
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
    nativewind: { useColorScheme: () => ({ setColorScheme }) },
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
    'react-native': { Appearance: appearance },
    zustand: {
      create: () => (initializer) => {
        const store = createStore(initializer);
        return Object.assign((selector) => selector(store.getState()), store);
      },
    },
    'zustand/middleware': middleware,
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
      return modules[name];
    },
    console,
  });
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
  };
}

test('system mode follows OS appearance changes in both directions', async () => {
  const app = await createHarness();
  assert.equal(app.store.getState().isDark, true);
  await app.changeSystem('light');
  assert.equal(app.store.getState().isDark, false);
  await app.changeSystem('dark');
  assert.equal(app.store.getState().isDark, true);
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
