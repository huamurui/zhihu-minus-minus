import { fireEvent, render } from '@testing-library/react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ContentActionBar } from '../src/components/ContentActionBar';
import { useColorScheme } from '../src/components/useColorScheme';
import { colors } from '../src/constants/designTokens';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
}));
jest.mock('expo-glass-effect', () => {
  const native = jest.requireActual('react-native');
  return {
    GlassContainer: native.View,
    GlassView: (props: Record<string, unknown>) => (
      <native.View {...props} testID="glass-view" />
    ),
    isGlassEffectAPIAvailable: () => true,
    isLiquidGlassAvailable: jest.fn(),
  };
});
jest.mock('expo-blur', () => {
  const native = jest.requireActual('react-native');
  return {
    BlurView: (props: Record<string, unknown>) => (
      <native.View {...props} testID="blur-view" />
    ),
  };
});
jest.mock('../src/components/Themed', () => {
  const { colors } = jest.requireActual(
    '../src/constants/designTokens',
  ) as typeof import('../src/constants/designTokens');
  const { useColorScheme } = jest.requireMock(
    '../src/components/useColorScheme',
  ) as typeof import('../src/components/useColorScheme');
  return { useRuntimeThemeColors: () => colors[useColorScheme()] };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: jest.fn(),
}));

const originalPlatform = Platform.OS;

beforeEach(() => {
  Platform.OS = 'ios';
  jest.mocked(useColorScheme).mockReturnValue('light');
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);
});

afterEach(() => {
  Platform.OS = originalPlatform;
});

test.each(['light', 'dark'] as const)(
  'Android islands use an opaque %s surface',
  async (scheme) => {
    Platform.OS = 'android';
    jest.mocked(useColorScheme).mockReturnValue(scheme);
    const host = await render(
      <ContentActionBar
        bottomInset={0}
        variant="islands"
        leading={<View testID="leading-action" />}
        trailing={<View testID="trailing-action" />}
        accessory={<View testID="accessory-action" />}
      />,
    );

    for (const action of ['leading', 'trailing', 'accessory']) {
      expect(host.getByTestId(`${action}-action`).parent).toHaveStyle({
        backgroundColor: colors[scheme].surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors[scheme].contentBorder,
      });
    }
    expect(host.queryByTestId('blur-view')).toBeNull();
  },
);

test('iOS islands retain the translucent BlurView fallback when Liquid Glass is unavailable', async () => {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
  const host = await render(
    <ContentActionBar
      bottomInset={0}
      variant="islands"
      leading={<Text>赞同</Text>}
      trailing={<Text>评论</Text>}
    />,
  );

  const islands = host.getAllByTestId('blur-view');
  expect(islands).toHaveLength(2);
  for (const island of islands) {
    expect(island).toHaveProp('intensity', 130);
    expect(island).toHaveProp('tint', 'light');
    expect(island).toHaveStyle({
      backgroundColor: colors.light.contentOverlayStrong,
    });
  }
});

test('interactive glass applies to action groups and the collapse control without intercepting their buttons', async () => {
  const onVote = jest.fn();
  const onComment = jest.fn();
  const onCollapse = jest.fn();
  const host = await render(
    <ContentActionBar
      bottomInset={0}
      variant="islands"
      interactiveGlass
      leading={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="赞同"
          onPress={onVote}
        >
          <Text>赞同</Text>
        </Pressable>
      }
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="评论"
          onPress={onComment}
        >
          <Text>评论</Text>
        </Pressable>
      }
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="收起"
          onPress={onCollapse}
        >
          <Text>收起</Text>
        </Pressable>
      }
    />,
  );

  const islands = host.getAllByTestId('glass-view');
  expect(islands).toHaveLength(3);
  for (const island of islands) {
    expect(island).toHaveProp('isInteractive', true);
    expect(island).toHaveProp('glassEffectStyle', 'regular');
    expect(island).toHaveProp('colorScheme', 'auto');
    expect(
      StyleSheet.flatten(island.props.style).backgroundColor,
    ).toBeUndefined();
  }
  await fireEvent.press(host.getByRole('button', { name: '赞同' }));
  await fireEvent.press(host.getByRole('button', { name: '评论' }));
  await fireEvent.press(host.getByRole('button', { name: '收起' }));
  expect(onVote).toHaveBeenCalledTimes(1);
  expect(onComment).toHaveBeenCalledTimes(1);
  expect(onCollapse).toHaveBeenCalledTimes(1);
});
