import * as SecureStore from 'expo-secure-store';
import {
  type AppSettings,
  useSettingsStore,
} from '../src/store/useSettingsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

async function migrate(value: unknown, version = 18) {
  const migration = useSettingsStore.persist.getOptions().migrate;
  if (!migration) throw new Error('Settings migration must be registered');
  return migration(value, version);
}

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

test('defaults adaptive panes to disabled with a one-third list width in settings version 20', () => {
  expect(useSettingsStore.getState()).toMatchObject({
    enableLargeScreenLayout: false,
    largeScreenListRatio: 1 / 3,
  });
  expect(useSettingsStore.persist.getOptions().version).toBe(20);
});

test('migrates v18 settings without changing unrelated preferences or the input object', async () => {
  const previous = {
    fontSizeScale: 1.3,
    doubleTapAction: 'comments',
    useNativeIOSBottomTabs: false,
  };
  expect(await migrate(previous)).toMatchObject({
    ...previous,
    enableLargeScreenLayout: false,
    largeScreenListRatio: 1 / 3,
  });
  expect(previous).not.toHaveProperty('enableLargeScreenLayout');
  expect(previous).not.toHaveProperty('largeScreenListRatio');
});

test.each([null, undefined, 'invalid', 42])(
  'recovers absent or invalid persisted settings %j',
  async (value) => {
    expect(await migrate(value)).toMatchObject({
      enableLargeScreenLayout: false,
      largeScreenListRatio: 1 / 3,
    });
  },
);

test('retains an explicit enabled preference and saved list width during migration', async () => {
  expect(
    await migrate({
      enableLargeScreenLayout: true,
      largeScreenListRatio: 0.45,
    }),
  ).toMatchObject({
    enableLargeScreenLayout: true,
    largeScreenListRatio: 0.45,
  });
});

test.each<[unknown, number]>([
  [Number.NaN, 1 / 3],
  [Number.POSITIVE_INFINITY, 1 / 3],
  [Number.NEGATIVE_INFINITY, 1 / 3],
  [undefined, 1 / 3],
  [null, 1 / 3],
  ['0.45', 1 / 3],
  [-1, 0.2],
  [1, 0.6],
  [0.2, 0.2],
  [0.45, 0.45],
  [0.6, 0.6],
])(
  'normalizes list width %j to %s on migration and update',
  async (value, expected) => {
    expect(
      await migrate({
        largeScreenListRatio: value,
        enableLargeScreenLayout: 'invalid',
      }),
    ).toMatchObject({
      largeScreenListRatio: expected,
      enableLargeScreenLayout: false,
    });

    useSettingsStore.getState().updateSettings({
      largeScreenListRatio: value,
      enableLargeScreenLayout: 'invalid',
    } as unknown as Partial<AppSettings>);
    expect(useSettingsStore.getState()).toMatchObject({
      largeScreenListRatio: expected,
      enableLargeScreenLayout: false,
    });
  },
);

test('retains the resized width when disabling and reenabling adaptive panes', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ largeScreenListRatio: 0.45 });
  updateSettings({ enableLargeScreenLayout: false });
  updateSettings({ fontSizeScale: 1.2 });
  expect(useSettingsStore.getState()).toMatchObject({
    enableLargeScreenLayout: false,
    largeScreenListRatio: 0.45,
  });
  updateSettings({ enableLargeScreenLayout: true });
  expect(useSettingsStore.getState().largeScreenListRatio).toBe(0.45);
});

test('rehydrates both layout preferences after restart', async () => {
  useSettingsStore.getState().updateSettings({
    enableLargeScreenLayout: false,
    largeScreenListRatio: 0.45,
  });
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  if (!persistedJson) throw new Error('Layout preferences must be persisted');
  expect(JSON.parse(persistedJson)).toMatchObject({
    version: 20,
    state: { enableLargeScreenLayout: false, largeScreenListRatio: 0.45 },
  });

  useSettingsStore.getState().resetSettings();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(persistedJson);
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({
    enableLargeScreenLayout: false,
    largeScreenListRatio: 0.45,
  });
});

test('rehydrates v18 settings and persists the layout defaults added in v19', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue(
      JSON.stringify({ state: { doubleTapAction: 'like' }, version: 18 }),
    );
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({
    doubleTapAction: 'like',
    enableLargeScreenLayout: false,
    largeScreenListRatio: 1 / 3,
  });
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  if (!persistedJson) throw new Error('Migrated settings must be persisted');
  expect(JSON.parse(persistedJson)).toMatchObject({
    version: 20,
    state: { enableLargeScreenLayout: false, largeScreenListRatio: 1 / 3 },
  });
});

test('reset restores the default adaptive pane preference and width', () => {
  useSettingsStore.getState().updateSettings({
    enableLargeScreenLayout: true,
    largeScreenListRatio: 0.45,
  });
  useSettingsStore.getState().resetSettings();
  expect(useSettingsStore.getState()).toMatchObject({
    enableLargeScreenLayout: false,
    largeScreenListRatio: 1 / 3,
  });
});
