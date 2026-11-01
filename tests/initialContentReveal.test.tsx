import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Platform, Text } from 'react-native';
import {
  InitialContentReveal,
  setCachedReduceMotionForTest,
} from '../src/components/InitialContentReveal';

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  setCachedReduceMotionForTest(false);
});
afterEach(() => {
  jest.restoreAllMocks();
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
