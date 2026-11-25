import { fireEvent, render } from '@testing-library/react-native';
import { type ImageProps, StyleSheet } from 'react-native';
import { DetailNavigationHeader } from '../src/components/DetailNavigationHeader';

let mockReadingSettings = { fontSizeScale: 1, lineHeightScale: 1.5 };

jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: (
    selector: (state: {
      fontSizeScale: number;
      lineHeightScale: number;
    }) => unknown,
  ) => selector(mockReadingSettings),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.requireActual<typeof import('react-native')>('react-native')
      .View,
  },
  useAnimatedStyle: (style: () => unknown) => style(),
}));
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../src/components/StableAvatar', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StableAvatar: ({
      uri,
      style,
    }: {
      uri?: string | null;
      style?: ImageProps['style'];
    }) =>
      react.createElement(native.Image, {
        testID: 'detail-header-avatar',
        source: uri ? { uri } : undefined,
        style,
      }),
  };
});

const title = '这是用于验证长问题标题始终只占一行的合成问题';

beforeEach(() => {
  mockReadingSettings = { fontSizeScale: 1, lineHeightScale: 1.5 };
});

test('floating answer actions stay available while the compact title and author are hidden', async () => {
  const onBack = jest.fn();
  const onMore = jest.fn();
  const host = await render(
    <DetailNavigationHeader
      testID="expanded-detail-header"
      title={title}
      collapsed={false}
      floatingActions
      onBack={onBack}
      onMore={onMore}
      author={{
        name: '作者 A',
        avatarUrl: 'https://example.com/avatar-a.png',
        onPress: jest.fn(),
      }}
    />,
  );

  expect(host.getByTestId('expanded-detail-header')).toHaveProp(
    'pointerEvents',
    'box-none',
  );
  expect(host.getByTestId('expanded-detail-header-surface')).toHaveStyle({
    opacity: 0,
  });
  expect(host.queryByText('回答')).toBeNull();
  expect(host.queryByText('问题')).toBeNull();
  expect(host.queryByText(title)).toBeNull();
  expect(host.queryByText('作者 A')).toBeNull();
  expect(host.queryByTestId('detail-header-avatar')).toBeNull();
  expect(host.getAllByRole('button')).toHaveLength(2);
  await fireEvent.press(host.getByRole('button', { name: '返回' }));
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onMore).toHaveBeenCalledTimes(1);
});

test('the floating more button stays in place while its question is loading', async () => {
  const onMore = jest.fn();
  const header = (ready: boolean) => (
    <DetailNavigationHeader
      title={title}
      collapsed={false}
      floatingActions
      onBack={jest.fn()}
      onMore={ready ? onMore : undefined}
    />
  );
  const host = await render(header(false));
  const more = host.getByRole('button', { name: '更多操作' });
  expect(more).toBeDisabled();
  await host.rerender(header(true));
  expect(host.getByRole('button', { name: '更多操作' })).toBe(more);
  await fireEvent.press(more);
  expect(onMore).toHaveBeenCalledTimes(1);
});

test('the collapsed header keeps the author avatar and name alongside a single-line title and working actions', async () => {
  const onBack = jest.fn();
  const onMore = jest.fn();
  const onTitlePress = jest.fn();
  const onAuthorPress = jest.fn();
  const host = await render(
    <DetailNavigationHeader
      testID="collapsed-detail-header"
      title={title}
      collapsed
      onBack={onBack}
      onMore={onMore}
      onTitlePress={onTitlePress}
      author={{
        name: '作者 A',
        avatarUrl: 'https://example.com/avatar-a.png',
        onPress: onAuthorPress,
      }}
    />,
  );

  expect(host.getByTestId('collapsed-detail-header-surface')).toHaveStyle({
    opacity: 1,
  });
  expect(host.queryByText('回答')).toBeNull();
  expect(host.getByText(title)).toHaveProp('numberOfLines', 1);
  expect(host.getByText('作者 A')).toBeTruthy();
  expect(host.getByTestId('detail-header-avatar')).toHaveProp('source', {
    uri: 'https://example.com/avatar-a.png',
  });

  await fireEvent.press(
    host.getByRole('button', { name: '查看 作者 A 的主页' }),
  );
  await fireEvent.press(host.getByRole('button', { name: '返回' }));
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }));
  await fireEvent.press(host.getByRole('button', { name: title }));
  expect(onAuthorPress).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onMore).toHaveBeenCalledTimes(1);
  expect(onTitlePress).toHaveBeenCalledTimes(1);
});

test('question headers can show the shared more button at the transparent top', async () => {
  const onMore = jest.fn();
  const host = await render(
    <DetailNavigationHeader
      testID="question-header"
      title={title}
      collapsed={false}
      moreAlwaysVisible
      onBack={jest.fn()}
      onMore={onMore}
    />,
  );
  expect(host.getByTestId('question-header-surface')).toHaveStyle({
    opacity: 0,
  });
  expect(host.queryByText(title)).toBeNull();
  const more = host.getByRole('button', { name: '更多操作' });
  expect(host.getAllByRole('button')).toHaveLength(2);
  await fireEvent.press(more);
  expect(onMore).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('changing answers replaces the displayed author, avatar and profile action together', async () => {
  const onAuthorAPress = jest.fn();
  const onAuthorBPress = jest.fn();
  const onBack = jest.fn();
  const host = await render(
    <DetailNavigationHeader
      title={title}
      collapsed
      onBack={onBack}
      author={{
        name: '作者 A',
        avatarUrl: 'https://example.com/avatar-a.png',
        onPress: onAuthorAPress,
      }}
    />,
  );

  await host.rerender(
    <DetailNavigationHeader
      title={title}
      collapsed
      onBack={onBack}
      author={{
        name: '作者 B',
        avatarUrl: 'https://example.com/avatar-b.png',
        onPress: onAuthorBPress,
      }}
    />,
  );

  expect(host.queryByText('作者 A')).toBeNull();
  expect(host.getByText('作者 B')).toBeTruthy();
  expect(host.getByTestId('detail-header-avatar')).toHaveProp('source', {
    uri: 'https://example.com/avatar-b.png',
  });
  await fireEvent.press(
    host.getByRole('button', { name: '查看 作者 B 的主页' }),
  );
  expect(onAuthorBPress).toHaveBeenCalledTimes(1);
  expect(onAuthorAPress).not.toHaveBeenCalled();
});

test('the question header supports both states without an author or share action', async () => {
  const onBack = jest.fn();
  const host = await render(
    <DetailNavigationHeader title={title} collapsed={false} onBack={onBack} />,
  );
  expect(host.queryByText('问题')).toBeNull();
  expect(host.getAllByRole('button')).toHaveLength(1);

  await host.rerender(
    <DetailNavigationHeader title={title} collapsed onBack={onBack} />,
  );

  expect(host.getByText(title)).toHaveProp('numberOfLines', 1);
  expect(host.queryByTestId('detail-header-avatar')).toBeNull();
  expect(host.queryByRole('button', { name: '更多操作' })).toBeNull();
  expect(host.getByRole('button', { name: title })).toBeDisabled();
  await fireEvent.press(host.getByRole('button', { name: '返回' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('increasing reading line height reserves enough header space for both title and author', async () => {
  const onBack = jest.fn();
  const onAuthorPress = jest.fn();
  const renderHeader = () => (
    <DetailNavigationHeader
      testID="detail-navigation-header"
      title={title}
      collapsed
      onBack={onBack}
      author={{ name: '作者 A', onPress: onAuthorPress }}
    />
  );
  const host = await render(renderHeader());
  const getRowHeight = () => {
    const row = host.getByTestId('detail-navigation-header-row');
    return StyleSheet.flatten(row.props.style).height as number;
  };
  const originalHeight = getRowHeight();

  mockReadingSettings = { fontSizeScale: 1, lineHeightScale: 2.5 };
  await host.rerender(renderHeader());

  const enlargedHeight = getRowHeight();
  const visibleContentHeight = (20 + 18) * (2.5 / 1.5) + 2;
  expect(enlargedHeight).toBeGreaterThan(originalHeight);
  expect(enlargedHeight).toBeGreaterThanOrEqual(visibleContentHeight);
  expect(host.getByText(title)).toHaveProp('numberOfLines', 1);
  expect(host.getByText('作者 A')).toBeTruthy();
  await fireEvent.press(
    host.getByRole('button', { name: '查看 作者 A 的主页' }),
  );
  expect(onAuthorPress).toHaveBeenCalledTimes(1);
});
