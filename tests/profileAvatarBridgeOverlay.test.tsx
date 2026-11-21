import { render } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  ProfileAvatarBridgeOverlay,
  useProfileAvatarInk,
} from '../src/components/profile/ProfileAvatarBridge';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (component: unknown) => component },
  useAnimatedProps: (read: () => unknown) => read(),
  useSharedValue: (value: unknown) =>
    jest.requireActual<typeof import('react')>('react').useRef({ value })
      .current,
}));

jest.mock('react-native-svg', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: View,
    Path: () => null,
    Circle: ({ animatedProps }: { animatedProps: { cx: number } }) => (
      <Text testID="ink-position">{animatedProps.cx}</Text>
    ),
  };
});

function ProfilePage({
  center,
  visible = true,
}: {
  center: number;
  visible?: boolean;
}) {
  const motion = useSharedValue({
    bridge: {
      target: { x: 140, y: 14, width: 120, height: 36 },
      avatar: { cx: center, cy: 62, r: 10 },
    },
    darkness: 1,
  });
  useProfileAvatarInk(visible ? motion : null);
  return null;
}

test('the overlay follows the newest profile until that profile hides', async () => {
  const overlay = await render(<ProfileAvatarBridgeOverlay />);
  expect(overlay.queryByTestId('ink-position')).toBeNull();

  const previous = await render(<ProfilePage center={194} />);
  expect(overlay.getByTestId('ink-position')).toHaveTextContent('194');
  const current = await render(<ProfilePage center={212} />);
  expect(overlay.getByTestId('ink-position')).toHaveTextContent('212');

  await previous.unmount();
  expect(overlay.getByTestId('ink-position')).toHaveTextContent('212');
  await current.rerender(<ProfilePage center={212} visible={false} />);
  expect(overlay.queryByTestId('ink-position')).toBeNull();
});
