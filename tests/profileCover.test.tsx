import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  ProfileCover,
  ProfileToolbarBackground,
} from '../components/profile/ProfileCover';

const mockColors = {
  primary: '#1364cc',
  background: '#ffffff',
  backgroundSecondary: '#f5f5f5',
  backgroundTertiary: '#eeeeee',
  border: '#dddddd',
};

jest.mock('../components/Themed', () => ({
  useRuntimeThemeColors: () => mockColors,
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
}));

test('the cover still fills the toolbar after scrolling and resizing', async () => {
  const offset = { value: 56 } as SharedValue<number>;
  const view = (navigationHeight = 88) => (
    <ProfileToolbarBackground
      coverUrl="https://example.test/cover.jpg"
      navigationHeight={navigationHeight}
      headerOffset={offset}
    />
  );
  const host = await render(view());
  const expectCoverage = (navigationHeight: number) => {
    const surfaces = host.container
      .queryAll((node) => node.type === 'View')
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(surfaces[0]).toMatchObject({ overflow: 'hidden' });
    const cover = surfaces.find((style) => typeof style?.height === 'number');
    const movement = surfaces.find((style) => style?.transform)?.transform;
    const translateY = movement?.[0].translateY;
    expect(Number.isFinite(translateY)).toBe(true);
    expect(translateY).toBeLessThanOrEqual(0);
    expect(cover.height + translateY).toBeGreaterThanOrEqual(navigationHeight);
    const images = host.container.queryAll((node) => node.type === 'Image');
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.props.source).toEqual({
        uri: 'https://example.test/cover.jpg',
        cache: 'force-cache',
      });
    }
  };

  expectCoverage(88);
  offset.value = 900;
  await host.rerender(view());
  expectCoverage(88);
  await host.rerender(view(112));
  expectCoverage(112);
  offset.value = 0;
  await host.rerender(view(112));
  expectCoverage(112);
});

test('missing or failed covers keep the fallback and a new image can recover', async () => {
  const host = await render(<ProfileCover height={200} />);
  expect(host.container.queryAll((node) => node.type === 'Image')).toHaveLength(
    0,
  );
  const expectFallback = () => {
    expect(
      host.container
        .queryAll((node) => node.type === 'View')
        .map((node) => StyleSheet.flatten(node.props.style)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          height: 200,
        }),
      ]),
    );
  };
  expectFallback();
  await host.rerender(
    <ProfileCover coverUrl="https://example.test/failed.jpg" height={200} />,
  );
  await fireEvent(
    host.container.queryAll((node) => node.type === 'Image')[0],
    'error',
    {
      nativeEvent: { error: 'Synthetic image failure' },
    },
  );
  expect(host.container.queryAll((node) => node.type === 'Image')).toHaveLength(
    0,
  );
  expectFallback();

  await host.rerender(
    <ProfileCover
      coverUrl="https://example.test/replacement.jpg"
      height={200}
    />,
  );
  expect(
    host.container.queryAll((node) => node.type === 'Image')[0].props.source,
  ).toEqual({
    uri: 'https://example.test/replacement.jpg',
    cache: 'force-cache',
  });
});
