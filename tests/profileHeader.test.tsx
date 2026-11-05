import { act, fireEvent, render } from '@testing-library/react-native';
import type { ZhihuMember } from '../src/api/zhihu';
import { ProfileHeader } from '../src/components/profile/ProfileHeader';
import { resolveThemeColors } from '../src/constants/theme';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { contrastRatio } from '../src/utils/colorContrast';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (factory: () => unknown) => factory(),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  })),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

const member: ZhihuMember = {
  id: 'profile-header-member',
  name: '测试作者',
  url_token: 'profile-header-member',
  avatar_url: '',
  type: 'people',
  following_count: 12,
  follower_count: 24500,
  mutual_followees_count: 3,
};

function props(user = member) {
  return {
    user,
    isMe: false,
    followLoading: false,
    topInset: 88,
    onFollow: jest.fn(),
    onFollowers: jest.fn(),
    onFollowing: jest.fn(),
    onMutual: jest.fn(),
  };
}

beforeEach(() => {
  useSettingsStore.setState({
    primaryColor: null,
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
});

test('profile actions retain their targets and a pending follow cannot be pressed', async () => {
  const callbacks = props();
  const host = await render(<ProfileHeader {...callbacks} />);
  await fireEvent.press(host.getByRole('button', { name: '12 关注' }));
  await fireEvent.press(host.getByRole('button', { name: '24500 关注者' }));
  await fireEvent.press(host.getByRole('button', { name: '3 位共同关注' }));
  expect(callbacks.onFollowing).toHaveBeenCalledTimes(1);
  expect(callbacks.onFollowers).toHaveBeenCalledTimes(1);
  expect(callbacks.onMutual).toHaveBeenCalledTimes(1);

  await host.rerender(<ProfileHeader {...callbacks} followLoading />);
  await fireEvent.press(host.getByRole('button', { name: '关注测试作者' }));
  expect(callbacks.onFollow).not.toHaveBeenCalled();
  await host.rerender(<ProfileHeader {...callbacks} isMe />);
  expect(host.queryByRole('button', { name: '关注测试作者' })).toBeNull();
  expect(host.queryByRole('button', { name: '3 位共同关注' })).toBeNull();
});

test('loading profile displays known identity without inventing statistics or enabling follow', async () => {
  const host = await render(
    <ProfileHeader
      {...props({
        id: 'synthetic',
        name: '卡片作者',
        avatar_url: '',
        type: 'people',
      })}
      isLoading
    />,
  );
  expect(host.getByText('卡片作者')).toBeVisible();
  expect(host.queryByRole('button', { name: /关注/ })).toBeNull();
  expect(host.queryByText('0', { exact: true })).toBeNull();
});

test('card headline remains available if the profile response omits it', async () => {
  const host = await render(
    <ProfileHeader {...props()} initialHeadline="卡片简介" />,
  );
  expect(host.getByText('卡片简介')).toBeVisible();
  await host.rerender(
    <ProfileHeader
      {...props({ ...member, headline: '' })}
      initialHeadline="卡片简介"
    />,
  );
  expect(host.queryByText('卡片简介')).toBeNull();
});

test('a long biography can be read in full without expanding the next member', async () => {
  const description = '这是一段用于检查个人主页简介展开行为的脱敏介绍。'.repeat(
    8,
  );
  const callbacks = props({ ...member, description });
  const host = await render(<ProfileHeader {...callbacks} />);
  expect(host.getByText(description).props.numberOfLines).toBe(3);
  await fireEvent.press(host.getByRole('button', { name: '展开简介' }));
  expect(host.getByText(description).props.numberOfLines).toBeUndefined();
  expect(host.getByRole('button', { name: '收起简介' })).toBeTruthy();

  await host.rerender(
    <ProfileHeader
      {...callbacks}
      user={{ ...callbacks.user, id: 'second-member' }}
    />,
  );
  expect(host.getByText(description).props.numberOfLines).toBe(3);
  expect(host.getByRole('button', { name: '展开简介' })).toBeTruthy();
});

test('a white primary color keeps the open profile follow action readable', async () => {
  const host = await render(<ProfileHeader {...props()} />);
  await act(() => {
    useSettingsStore.setState({ primaryColor: '#ffffff' });
  });
  const palette = resolveThemeColors('light', {
    primaryColor: '#ffffff',
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
  });
  expect(host.getByRole('button', { name: '关注测试作者' })).toHaveStyle({
    backgroundColor: palette.primaryTransparent,
  });
  expect(host.getByText('关注', { exact: true })).toHaveStyle({
    color: palette.link,
  });
  expect(
    contrastRatio(palette.link, palette.background),
  ).toBeGreaterThanOrEqual(4.5);
});
