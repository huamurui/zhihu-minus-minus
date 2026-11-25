import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import GuestDetailScreen from '../src/app/guest/detail';

const mockBack = jest.fn();
let mockItem: string | undefined;
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ item: mockItem }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  FadeIn: { duration: () => undefined },
  FadeInDown: { delay: () => ({ duration: () => undefined }) },
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/features/rich-content', () => ({ ZhihuContent: () => null }));
jest.mock('../src/store/useAuthStore', () => ({ useAuthStore: () => 0 }));

test('guest preview keeps the same usable navigation button when the preview is unavailable', async () => {
  const client = new QueryClient();
  const screen = () => (
    <QueryClientProvider client={client}>
      <SafeAreaInsetsContext.Provider
        value={{ top: 59, left: 0, right: 0, bottom: 34 }}
      >
        <GuestDetailScreen />
      </SafeAreaInsetsContext.Provider>
    </QueryClientProvider>
  );
  mockItem = JSON.stringify({ type: 'answers', id: '42', excerpt: '合成摘要' });
  const host = await render(screen());
  expect(host.getByText('知乎回答')).toBeVisible();
  const back = host.getByRole('button', { name: '返回' });
  await fireEvent.press(back);
  expect(mockBack).toHaveBeenCalledTimes(1);

  mockItem = undefined;
  await host.rerender(screen());
  expect(host.getByText('加载预览失败喵')).toBeVisible();
  expect(host.queryByText('知乎回答')).toBeNull();
  expect(host.getByRole('button', { name: '返回' })).toBe(back);
  await fireEvent.press(back);
  await fireEvent.press(host.getByText('返回上一页'));
  expect(mockBack).toHaveBeenCalledTimes(3);

  await host.unmount();
  client.clear();
});
