import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { ContentActionBar } from '../src/components/ContentActionBar';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
}));
jest.mock('expo-glass-effect', () => ({
  GlassContainer: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/surfaces/FloatingSurface', () => ({
  useIsLiquidGlassActive: () => true,
  FloatingSurface: ({
    isInteractive,
    children,
  }: {
    isInteractive?: boolean;
    children: React.ReactNode;
  }) => {
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View testID={isInteractive ? 'interactive-glass' : 'static-glass'}>
        {children}
      </View>
    );
  },
}));
jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    contentOverlayStrong: '#fff',
    contentBorder: '#ddd',
    shadow: '#000',
  }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

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

  expect(host.getAllByTestId('interactive-glass')).toHaveLength(3);
  await fireEvent.press(host.getByRole('button', { name: '赞同' }));
  await fireEvent.press(host.getByRole('button', { name: '评论' }));
  await fireEvent.press(host.getByRole('button', { name: '收起' }));
  expect(onVote).toHaveBeenCalledTimes(1);
  expect(onComment).toHaveBeenCalledTimes(1);
  expect(onCollapse).toHaveBeenCalledTimes(1);
});
