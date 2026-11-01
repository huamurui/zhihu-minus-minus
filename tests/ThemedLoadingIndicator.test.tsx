import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { ThemedLoadingIndicator } from '../src/components/ThemedLoadingIndicator';

jest.mock('react-native-reanimated', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: {
      View: native.View,
      createAnimatedComponent: (c: unknown) => c,
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (animation: unknown) => animation,
    withTiming: (toValue: unknown) => toValue,
    cancelAnimation: jest.fn(),
    Easing: { linear: jest.fn() },
  };
});

jest.mock('react-native-svg', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => (
      <native.View {...props} testID="svg-root" />
    ),
    Circle: (props: Record<string, unknown>) => (
      <native.View {...props} testID="svg-circle" />
    ),
  };
});

jest.mock('../src/components/Themed', () => ({
  useThemeColor: (_props: unknown, colorName: string) =>
    colorName === 'primary' ? '#0084ff' : '#e0e0e0',
}));

describe('ThemedLoadingIndicator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders correctly with default props', async () => {
    const host = await render(<ThemedLoadingIndicator testID="spinner" />);
    expect(host.getByTestId('spinner')).toBeTruthy();
  });

  it('renders with custom size, strokeWidth, and colors', async () => {
    const host = await render(
      <ThemedLoadingIndicator
        testID="custom-spinner"
        size={36}
        strokeWidth={3}
        color="#0084ff"
        trackColor="#e0e0e0"
      />,
    );
    expect(host.getByTestId('custom-spinner')).toBeTruthy();
  });

  it('can be unmounted cleanly while animating', async () => {
    const reanimated = jest.requireMock('react-native-reanimated');
    const host = await render(<ThemedLoadingIndicator animating={true} />);
    expect(() => host.unmount()).not.toThrow();
    expect(reanimated.cancelAnimation).toHaveBeenCalled();
  });

  it('stops animation when animating is false', async () => {
    const host = await render(
      <ThemedLoadingIndicator animating={true} testID="spinner" />,
    );
    expect(() => {
      host.rerender(
        <ThemedLoadingIndicator animating={false} testID="spinner" />,
      );
    }).not.toThrow();
  });

  it('respects AccessibilityInfo reduce motion preference', async () => {
    let listener: ((enabled: boolean) => void) | undefined;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_event, cb) => {
        listener = cb as (enabled: boolean) => void;
        return { remove: jest.fn() } as unknown as ReturnType<
          typeof AccessibilityInfo.addEventListener
        >;
      });

    const host = await render(
      <ThemedLoadingIndicator animating={true} testID="spinner" />,
    );
    expect(host.getByTestId('spinner')).toBeTruthy();

    await act(async () => {
      listener?.(false);
    });
  });
});
