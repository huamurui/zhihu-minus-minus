import 'expo-router/testing-library';
import type { ViewStyle } from 'react-native';

// Expo Router's test preset may substitute an empty Reanimated module. Supply
// the UI operations used by the adaptive stack, including a live style getter.
Object.assign(jest.requireMock('react-native-reanimated'), {
  __esModule: true,
  default: {
    createAnimatedComponent: <Component>(component: Component) => component,
    View: jest.requireActual<typeof import('react-native')>('react-native')
      .View,
  },
  cancelAnimation: jest.fn(),
  makeMutable: (initial: number) => {
    let current = initial;
    return {
      get: () => current,
      set: (next: number) => {
        current = next;
      },
    };
  },
  withTiming: jest.fn((value: number) => value),
  useAnimatedStyle: (read: () => ViewStyle) => {
    const style = read();
    for (const key of Object.keys(style)) {
      Object.defineProperty(style, key, {
        enumerable: true,
        get: () => Reflect.get(read(), key),
      });
    }
    return style;
  },
});
