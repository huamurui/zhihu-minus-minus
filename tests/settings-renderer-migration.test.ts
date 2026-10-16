import * as SecureStore from 'expo-secure-store';
import {
  type AppSettings,
  type RichContentRenderer,
  useSettingsStore,
} from '../store/useSettingsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

async function migrate(
  value: unknown,
  version = 12,
): Promise<Record<string, unknown>> {
  const migration = useSettingsStore.persist.getOptions().migrate;
  if (!migration) throw new Error('Settings migration must be registered');
  const migrated = await migration(value, version);
  if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) {
    throw new Error('Settings migration must return a settings object');
  }
  return migrated as Record<string, unknown>;
}

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

test('defaults to tiqian-super-mini with visual feedback and filtering enabled in settings version 18', () => {
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  expect(useSettingsStore.getState().enablePressFeedback).toBe(true);
  expect(useSettingsStore.getState().enableLocalFeedFilter).toBe(true);
  expect(useSettingsStore.getState().filterRegexPatterns).toEqual([]);
  expect(useSettingsStore.persist.getOptions().version).toBe(18);
});

test('leaves the double-tap action unset until the user picks one', () => {
  expect(useSettingsStore.getState().doubleTapAction).toBeUndefined();
  useSettingsStore.getState().updateSettings({ doubleTapAction: 'comments' });
  expect(useSettingsStore.getState().doubleTapAction).toBe('comments');
  useSettingsStore.getState().updateSettings({
    doubleTapAction: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().doubleTapAction).toBeUndefined();
});

test('keeps a previously saved double-tap action and defaults unset legacy data', async () => {
  expect((await migrate({ doubleTapAction: 'like' }, 17)).doubleTapAction).toBe(
    'like',
  );
  expect(
    (await migrate({ doubleTapAction: 'unknown' }, 17)).doubleTapAction,
  ).toBeUndefined();
  expect((await migrate({}, 17)).doubleTapAction).toBeUndefined();
});

test.each([
  [{ useWebView: true }, 'webview'],
  [{ useWebView: false }, 'native-v2'],
  [{}, 'native-v2'],
] as const)('migrates the legacy renderer toggle %j to %s', async (legacy, renderer) => {
  const migrated = await migrate(legacy);
  expect(migrated.richContentRenderer).toBe(renderer);
  expect(migrated).not.toHaveProperty('useWebView');
});

test.each<RichContentRenderer>([
  'webview',
  'native-v2',
])('preserves an existing valid renderer %s over the legacy toggle', async (renderer) => {
  const migrated = await migrate({
    richContentRenderer: renderer,
    useWebView: renderer !== 'webview',
  });
  expect(migrated.richContentRenderer).toBe(renderer);
  expect(migrated).not.toHaveProperty('useWebView');
});

test('recovers invalid persisted renderer values using the legacy setting', async () => {
  expect(
    (await migrate({ richContentRenderer: 'invalid', useWebView: true }))
      .richContentRenderer,
  ).toBe('webview');
  expect(
    (await migrate({ richContentRenderer: null })).richContentRenderer,
  ).toBe('native-v2');
});

test('retains unrelated settings and the earlier settings migrations', async () => {
  const legacy = {
    useWebView: true,
    fontSizeScale: 1.2,
    lineHeightScale: 1.7,
    primaryColor: '#12AbCd',
    localCityName: '上海',
    visibleTabs: ['recommend', 'profile'],
    enablePrivateMessaging: true,
  };
  const migrated = await migrate(legacy, 1);
  expect(migrated).toMatchObject({
    fontSizeScale: 1.2,
    lineHeightScale: 1.7,
    primaryColor: '#12abcd',
    localCityName: '上海',
    visibleTabs: ['recommend', 'profile'],
    enablePrivateMessaging: true,
    richContentRenderer: 'webview',
    pressOpacity: 0.82,
    androidFeedbackType: 'ripple',
    enablePressFeedback: true,
    enableLocalFeedFilter: true,
    filterRegexPatterns: [],
    enableHapticFeedback: true,
    useNativeIOSBottomTabs: true,
    recommendRequestAdInterval: -10,
  });
  expect(legacy).toHaveProperty('useWebView', true);
  expect(legacy.primaryColor).toBe('#12AbCd');
});

test('hydrates legacy settings and writes back only the new renderer field', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
    JSON.stringify({
      state: { useWebView: true, fontSizeScale: 1.3 },
      version: 12,
    }),
  );
  await useSettingsStore.persist.rehydrate();

  expect(useSettingsStore.getState().richContentRenderer).toBe('webview');
  expect(useSettingsStore.getState().fontSizeScale).toBe(1.3);
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  expect(persistedJson).toBeDefined();
  if (!persistedJson) throw new Error('Migrated settings must be persisted');
  expect(JSON.parse(persistedJson)).toMatchObject({
    state: {
      richContentRenderer: 'webview',
      fontSizeScale: 1.3,
      enablePressFeedback: true,
    },
    version: 18,
  });
  expect(JSON.parse(persistedJson).state).not.toHaveProperty('useWebView');
});

test('adds visual feedback to v13 settings without changing the saved style or haptics', async () => {
  const legacy = {
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
    enableHapticFeedback: false,
  };
  expect(await migrate(legacy, 13)).toMatchObject({
    ...legacy,
    enablePressFeedback: true,
  });
  expect(legacy).not.toHaveProperty('enablePressFeedback');
});

test('persists disabled visual feedback and restores the saved style when reenabled', async () => {
  useSettingsStore.getState().updateSettings({
    enablePressFeedback: false,
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
  });
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  if (!persistedJson) throw new Error('Feedback preference must be persisted');
  useSettingsStore.setState({ enablePressFeedback: true });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(persistedJson);
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().enablePressFeedback).toBe(false);

  useSettingsStore.getState().updateSettings({ enablePressFeedback: true });
  expect(useSettingsStore.getState()).toMatchObject({
    enablePressFeedback: true,
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
  });
});

test('sanitizes invalid renderer updates and retains a valid renderer during other updates', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ richContentRenderer: 'native-v2' });
  updateSettings({ fontSizeScale: 1.4 });
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  updateSettings({
    richContentRenderer: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  expect(useSettingsStore.getState().fontSizeScale).toBe(1.4);
});

test('migrates removed RNRH preferences without changing explicit WebView preferences', async () => {
  expect(
    (await migrate({ richContentRenderer: 'rnrh' }, 14)).richContentRenderer,
  ).toBe('native-v2');
  expect(
    (await migrate({ richContentRenderer: 'webview' }, 14)).richContentRenderer,
  ).toBe('webview');
});

test('adds the answer destination mode on upgrade while preserving explicit choices', async () => {
  expect(await migrate({ richContentRenderer: 'webview' }, 15)).toMatchObject({
    richContentRenderer: 'webview',
    answerReadingMode: 'detail',
  });
  expect(
    await migrate({ answerReadingMode: 'preview-list' }, 15),
  ).toMatchObject({ answerReadingMode: 'preview-list' });
  useSettingsStore
    .getState()
    .updateSettings({ answerReadingMode: 'preview-list' });
  expect(useSettingsStore.getState().answerReadingMode).toBe('preview-list');
  useSettingsStore.getState().updateSettings({
    answerReadingMode: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().answerReadingMode).toBe('detail');
});

test.each([
  false,
  true,
])('preserves a saved v16 filtering preference of %s', async (enabled) => {
  expect(await migrate({ enableLocalFeedFilter: enabled }, 16)).toMatchObject({
    enableLocalFeedFilter: enabled,
    filterRegexPatterns: [],
  });
});

test.each([
  1, 7, 16,
])('enables filtering only for missing or invalid choices in v%s settings', async (version) => {
  expect((await migrate({}, version)).enableLocalFeedFilter).toBe(true);
  expect(
    (await migrate({ enableLocalFeedFilter: 'invalid' }, version))
      .enableLocalFeedFilter,
  ).toBe(true);
  expect(
    (await migrate({ enableLocalFeedFilter: false }, version))
      .enableLocalFeedFilter,
  ).toBe(false);
});

test('persists and restores sanitized custom regex rules together with a disabled filter', async () => {
  const suppliedPatterns = [' 广告\\s*推广 ', '^(?:优惠|福利)', '广告\\s*推广'];
  const expectedPatterns = ['广告\\s*推广', '^(?:优惠|福利)'];
  useSettingsStore.getState().updateSettings({
    enableLocalFeedFilter: false,
    filterRegexPatterns: suppliedPatterns,
  });
  expect(useSettingsStore.getState().filterRegexPatterns).toEqual(
    expectedPatterns,
  );
  expect(suppliedPatterns[0]).toBe(' 广告\\s*推广 ');
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  if (!persistedJson) throw new Error('Filter preferences must be persisted');
  expect(JSON.parse(persistedJson)).toMatchObject({
    state: {
      enableLocalFeedFilter: false,
      filterRegexPatterns: expectedPatterns,
    },
    version: 18,
  });
  useSettingsStore.setState({
    enableLocalFeedFilter: true,
    filterRegexPatterns: [],
  });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(persistedJson);
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState()).toMatchObject({
    enableLocalFeedFilter: false,
    filterRegexPatterns: expectedPatterns,
  });
});

test('sanitizes invalid custom regex payloads on migration and updates', async () => {
  const invalidPayload = [' 福利 ', '[', '', 42, null, '福利'];
  const migrated = await migrate({ filterRegexPatterns: invalidPayload }, 16);
  expect(migrated.filterRegexPatterns).toEqual(['福利']);
  expect(invalidPayload).toEqual([' 福利 ', '[', '', 42, null, '福利']);
  expect(
    (await migrate({ filterRegexPatterns: '福利' }, 16)).filterRegexPatterns,
  ).toEqual([]);
  useSettingsStore.getState().updateSettings({
    filterRegexPatterns: invalidPayload,
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().filterRegexPatterns).toEqual(['福利']);
  useSettingsStore.getState().updateSettings({
    filterRegexPatterns: null,
    enableLocalFeedFilter: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().filterRegexPatterns).toEqual([]);
  expect(useSettingsStore.getState().enableLocalFeedFilter).toBe(true);
});

test.each([
  { patterns: [] },
  { patterns: ['广告\\s*推广', '^(?:优惠|福利)'] },
])('retains regex rule references across unrelated updates for %j', ({
  patterns,
}) => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ filterRegexPatterns: patterns });
  const savedPatterns = useSettingsStore.getState().filterRegexPatterns;

  updateSettings({ fontSizeScale: 1.4 });
  expect(useSettingsStore.getState().filterRegexPatterns).toBe(savedPatterns);
  updateSettings({ enableLocalFeedFilter: false });
  expect(useSettingsStore.getState().filterRegexPatterns).toBe(savedPatterns);
  updateSettings({ enableLocalFeedFilter: true });
  expect(useSettingsStore.getState().filterRegexPatterns).toBe(savedPatterns);
  expect(savedPatterns).toEqual(patterns);
});

test('reuses regex rules when an explicit update normalizes to the saved rules', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ filterRegexPatterns: ['广告\\s*推广', '^(?:优惠|福利)'] });
  const savedPatterns = useSettingsStore.getState().filterRegexPatterns;
  const suppliedPatterns = [
    ' 广告\\s*推广 ',
    '^(?:优惠|福利)',
    '广告\\s*推广',
    '',
  ];

  updateSettings({ filterRegexPatterns: suppliedPatterns });
  expect(useSettingsStore.getState().filterRegexPatterns).toBe(savedPatterns);
  expect(savedPatterns).toEqual(['广告\\s*推广', '^(?:优惠|福利)']);
  expect(suppliedPatterns).toEqual([
    ' 广告\\s*推广 ',
    '^(?:优惠|福利)',
    '广告\\s*推广',
    '',
  ]);
});

test('replaces changed and cleared regex rules without mutating prior rules', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ filterRegexPatterns: ['广告\\s*推广', '^(?:优惠|福利)'] });
  const originalPatterns = useSettingsStore.getState().filterRegexPatterns;

  updateSettings({ filterRegexPatterns: ['盐选'] });
  const changedPatterns = useSettingsStore.getState().filterRegexPatterns;
  expect(changedPatterns).not.toBe(originalPatterns);
  expect(changedPatterns).toEqual(['盐选']);
  expect(originalPatterns).toEqual(['广告\\s*推广', '^(?:优惠|福利)']);

  updateSettings({ filterRegexPatterns: [] });
  const clearedPatterns = useSettingsStore.getState().filterRegexPatterns;
  expect(clearedPatterns).not.toBe(changedPatterns);
  expect(clearedPatterns).toEqual([]);
  expect(changedPatterns).toEqual(['盐选']);
  expect(originalPatterns).toEqual(['广告\\s*推广', '^(?:优惠|福利)']);
});

test('preserves an explicit new regex rule order without mutating saved rules', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ filterRegexPatterns: ['广告\\s*推广', '^(?:优惠|福利)'] });
  const savedPatterns = useSettingsStore.getState().filterRegexPatterns;

  updateSettings({ filterRegexPatterns: ['^(?:优惠|福利)', '广告\\s*推广'] });
  expect(useSettingsStore.getState().filterRegexPatterns).not.toBe(
    savedPatterns,
  );
  expect(useSettingsStore.getState().filterRegexPatterns).toEqual([
    '^(?:优惠|福利)',
    '广告\\s*推广',
  ]);
  expect(savedPatterns).toEqual(['广告\\s*推广', '^(?:优惠|福利)']);
});
