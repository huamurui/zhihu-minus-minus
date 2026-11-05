import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { ProfileImage } from '../src/components/profile/ProfileImage';

const first = 'https://example.test/avatar-first.jpg';
const second = 'https://example.test/avatar-second.jpg';
const third = 'https://example.test/avatar-third.jpg';

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

test('keeps the loaded image until its replacement has loaded and completed its transition', async () => {
  let finish: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => {
      finish = callback;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  const host = await render(
    <ProfileImage uri={first} style={{ width: 80, height: 80 }} />,
  );
  await act(async () => {});
  let images = host.container.queryAll((node) => node.type === 'Image');
  await fireEvent(images[0], 'load');
  expect(timing).toHaveBeenCalledTimes(1);
  await act(() => finish?.({ finished: true }));

  await host.rerender(
    <ProfileImage uri={second} style={{ width: 80, height: 80 }} />,
  );
  images = host.container.queryAll((node) => node.type === 'Image');
  expect(images.map((image) => image.props.source.uri)).toEqual([
    first,
    second,
  ]);
  await fireEvent(images[1], 'load');
  expect(host.container.queryAll((node) => node.type === 'Image')).toHaveLength(
    2,
  );
  await act(() => finish?.({ finished: true }));
  images = host.container.queryAll((node) => node.type === 'Image');
  expect(images.map((image) => image.props.source.uri)).toEqual([second]);

  await host.rerender(
    <ProfileImage uri={second} style={{ width: 90, height: 90 }} />,
  );
  expect(timing).toHaveBeenCalledTimes(2);
});

test('an obsolete image load cannot replace a newer profile image', async () => {
  let finish: ((result: { finished: boolean }) => void) | undefined;
  jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => {
      finish = callback;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  const host = await render(<ProfileImage uri={first} style={{ width: 80 }} />);
  await act(async () => {});
  await fireEvent(
    host.container.queryAll((node) => node.type === 'Image')[0],
    'load',
  );
  await act(() => finish?.({ finished: true }));
  await host.rerender(<ProfileImage uri={second} style={{ width: 80 }} />);
  await fireEvent(
    host.container.queryAll((node) => node.type === 'Image')[1],
    'load',
  );
  const finishSecond = finish;
  await host.rerender(<ProfileImage uri={third} style={{ width: 80 }} />);
  await act(() => finishSecond?.({ finished: true }));
  expect(
    host.container
      .queryAll((node) => node.type === 'Image')
      .map((image) => image.props.source.uri),
  ).toEqual([first, third]);
});

test('a failed replacement reports the error and keeps the previous image', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const onError = jest.fn();
  const host = await render(
    <ProfileImage uri={first} style={{ width: 80 }} onError={onError} />,
  );
  await act(async () => {});
  await fireEvent(
    host.container.queryAll((node) => node.type === 'Image')[0],
    'load',
  );
  await host.rerender(
    <ProfileImage uri={second} style={{ width: 80 }} onError={onError} />,
  );
  const images = host.container.queryAll((node) => node.type === 'Image');
  await fireEvent(images[1], 'error', { nativeEvent: { error: 'synthetic' } });
  expect(onError).toHaveBeenCalledTimes(1);
  const remaining = host.container.queryAll((node) => node.type === 'Image');
  expect(remaining.map((image) => image.props.source.uri)).toEqual([first]);
});
