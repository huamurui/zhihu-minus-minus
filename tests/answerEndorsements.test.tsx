import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AnswerEndorsements } from '../components/AnswerEndorsements';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useRuntimeThemeColors: () => ({
    link: '#123456',
    textSecondary: '#666666',
    badgeText: '#987654',
    badgeBackground: '#fedcba',
    primaryTransparent: '#12345620',
  }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = jest.requireActual('react-native');
  return ({ name }: { name: string }) => <View testID={`icon:${name}`} />;
});
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ children }: PropsWithChildren) => (
      <View testID="icon:crab">{children}</View>
    ),
    Path: View,
    Ellipse: View,
  };
});

function text(content: string, isBold = false) {
  return {
    type: 'TEXT',
    content,
    font_size: 13,
    font_color: { alpha: 1, group: 'GBL07A' },
    is_bold: isBold,
    max_line: 1,
  };
}

function image(imageKey: string) {
  return {
    type: 'IMAGE',
    image_key: imageKey,
    image_color: { alpha: 1, group: 'GBL07A' },
    width: 16,
    height: 16,
  };
}

function thanks() {
  return {
    background_color: { alpha: 0.1, group: 'GBL01A' },
    action_url: 'https://www.zhihu.com/people/redacted-person-token-003',
    elements: [
      image('zhicon_icon_24_crab_fill'),
      text('谢邀 @脱敏用户003', true),
    ],
    sub_elements: [],
    sub_elements_type: 'DESCRIPTION',
    za: { block_text: 'ThanksForInvitingLabel', text: '', type: 'text' },
  };
}

function daily() {
  return {
    background_color: { alpha: 0.1, group: 'GYL02A' },
    elements: [
      {
        ...image('zhicon_icon_24_label_daily'),
        image_color: { alpha: 1, group: 'GYL02A' },
      },
      {
        ...text('知乎日报收录', true),
        font_color: { alpha: 1, group: 'GYL02A' },
      },
    ],
    sub_elements: [],
    sub_elements_type: 'DESCRIPTION',
    za: { block_text: 'daily', text: '', type: 'text' },
  };
}

function column() {
  return {
    action_url: 'https://www.zhihu.com/column/synthetic-column',
    background_color: { alpha: 0.08, group: 'GBL01A' },
    elements: [
      image('zhicon_icon_24_column_fill'),
      text('收录于 · 合成专栏'),
      image('zhicon_icon_16_arrow_right'),
    ],
    sub_elements: [],
    sub_elements_type: 'DESCRIPTION',
    za: { block_text: 'Column', text: '收录于 · 合成专栏', type: 'text' },
  };
}

beforeEach(() => {
  mockPush.mockReset();
});

test('renders the invitation thanks text with its crab icon and opens the local inviter profile', async () => {
  const host = await render(<AnswerEndorsements endorsements={[thanks()]} />);
  expect(host.getByText('谢邀 @脱敏用户003')).toBeTruthy();
  expect(host.getByTestId('icon:crab')).toBeTruthy();
  await fireEvent.press(
    host.getByRole('button', { name: '谢邀 @脱敏用户003' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/user/redacted-person-token-003');
});

test('shows daily and column labels together with their native icons and local column action', async () => {
  const host = await render(
    <AnswerEndorsements endorsements={[daily(), column()]} />,
  );
  expect(host.getByText('知乎日报收录')).toBeTruthy();
  expect(host.getByText('收录于 · 合成专栏')).toBeTruthy();
  expect(host.getByTestId('icon:newspaper')).toBeTruthy();
  expect(host.getByTestId('icon:library')).toBeTruthy();
  expect(host.getByTestId('icon:chevron-forward')).toBeTruthy();
  await fireEvent.press(host.getByText('知乎日报收录'));
  expect(mockPush).not.toHaveBeenCalled();
  await fireEvent.press(
    host.getByRole('button', { name: '收录于 · 合成专栏' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/column/synthetic-column');
});

test('empty labels add no visible content', async () => {
  const host = await render(<AnswerEndorsements endorsements={[]} />);
  expect(host.toJSON()).toBeNull();
});

test('an unknown icon keeps the label text and supported action visible', async () => {
  const host = await render(
    <AnswerEndorsements
      endorsements={[
        {
          ...thanks(),
          elements: [
            image('synthetic_unknown_icon'),
            text('谢邀 @脱敏用户003', true),
          ],
        },
      ]}
    />,
  );
  expect(host.getByText('谢邀 @脱敏用户003')).toBeTruthy();
  expect(host.queryByTestId('icon:crab')).toBeNull();
  await fireEvent.press(
    host.getByRole('button', { name: '谢邀 @脱敏用户003' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/user/redacted-person-token-003');
});
