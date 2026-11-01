import { act, cleanup, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Platform, Text } from 'react-native';
import {
  InitialContentReveal,
  resetReduceMotionSubscriptionForTest,
  setCachedReduceMotionForTest,
} from '../src/components/InitialContentReveal';

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  resetReduceMotionSubscriptionForTest();
  setCachedReduceMotionForTest(false);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  resetReduceMotionSubscriptionForTest();
  setCachedReduceMotionForTest(false);
});

test('reveals content only on its first completed load and leaves later updates readable', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>加载中</Text>
    </InitialContentReveal>,
  );
  await act(async () => {});
  expect(host.getByText('加载中')).toBeVisible();
  await host.rerender(
    <InitialContentReveal ready>
      <Text>正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('正文')).toBeTruthy();
  expect(timing).toHaveBeenCalledTimes(1);
  await host.rerender(
    <InitialContentReveal ready={false}>
      <Text>重新排版</Text>
    </InitialContentReveal>,
  );
  await host.rerender(
    <InitialContentReveal ready>
      <Text>更新后的正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('更新后的正文')).toBeVisible();
  expect(timing).toHaveBeenCalledTimes(1);
});

test('reduced motion shows the content without starting a fade', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');
  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>加载中</Text>
    </InitialContentReveal>,
  );
  await act(async () => {});
  await host.rerender(
    <InitialContentReveal ready>
      <Text>正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('正文')).toBeVisible();
  expect(timing).not.toHaveBeenCalled();
});

test('reveals content with animation even when mounted with ready=true', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <InitialContentReveal ready>
      <Text>预热正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('预热正文')).toBeTruthy();
  expect(timing).toHaveBeenCalledTimes(1);
});

test('reduced motion shows content directly when mounted with ready=true', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  setCachedReduceMotionForTest(true);
  const timing = jest.spyOn(Animated, 'timing');
  const host = await render(
    <InitialContentReveal ready>
      <Text>无动画正文</Text>
    </InitialContentReveal>,
  );
  await act(async () => {});
  expect(host.getByText('无动画正文')).toBeVisible();
  expect(timing).not.toHaveBeenCalled();
});

test('reveals content on iOS with fade animation', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>iOS 加载中</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('iOS 加载中')).toBeVisible();
  await host.rerender(
    <InitialContentReveal ready>
      <Text>iOS 正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('iOS 正文')).toBeTruthy();
  expect(timing).toHaveBeenCalledTimes(1);
});

test('cleans up shared reduce motion listener when all instances unmount', async () => {
  const removeMock = jest.fn();
  const addListenerSpy = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: removeMock } as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);

  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>监听测试</Text>
    </InitialContentReveal>,
  );
  expect(addListenerSpy).toHaveBeenCalledWith(
    'reduceMotionChanged',
    expect.any(Function),
  );

  await host.unmount();
  expect(removeMock).toHaveBeenCalledTimes(1);
});

test('displays content directly without fade when reduce motion setting is not yet resolved', async () => {
  let resolveQuery!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        resolveQuery = resolve;
      }),
  );
  resetReduceMotionSubscriptionForTest();

  const timing = jest.spyOn(Animated, 'timing');
  const host = await render(
    <InitialContentReveal ready>
      <Text>未解析设置正文</Text>
    </InitialContentReveal>,
  );
  expect(host.getByText('未解析设置正文')).toBeVisible();
  expect(timing).not.toHaveBeenCalled();

  await act(async () => {
    resolveQuery(false);
  });
  expect(timing).not.toHaveBeenCalled();
  expect(host.getByText('未解析设置正文')).toBeVisible();
});

test('reduceMotionChanged event is not overwritten by a late resolving isReduceMotionEnabled query', async () => {
  let resolveQuery!: (value: boolean) => void;
  let eventCallback!: (enabled: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        resolveQuery = resolve;
      }),
  );
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event, cb) => {
      eventCallback = cb;
      return { remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  resetReduceMotionSubscriptionForTest();

  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });

  const host = await render(
    <InitialContentReveal ready={false}>
      <Text>竞态测试正文</Text>
    </InitialContentReveal>,
  );

  await act(async () => {
    eventCallback(true);
  });

  await act(async () => {
    resolveQuery(false);
  });

  await host.rerender(
    <InitialContentReveal ready>
      <Text>竞态测试正文</Text>
    </InitialContentReveal>,
  );

  expect(timing).not.toHaveBeenCalled();
  expect(host.getByText('竞态测试正文')).toBeVisible();
});
