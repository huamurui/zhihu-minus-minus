import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AnswerLoadingPlaceholder } from '../components/AnswerLoadingPlaceholder';
import type { RichContentLoadingPhase } from '../features/rich-content';

jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each<readonly [RichContentLoadingPhase, string]>([
  ['container-layout', '正在确认正文宽度…'],
  ['text-layout', '正在排版文字…'],
  ['content-layout', '正在布局正文内容…'],
])('delays the %s indicator and accessibility announcement until 120 ms', async (phase, message) => {
  const host = await render(<AnswerLoadingPlaceholder phase={phase} />);

  expect(host.toJSON()).toMatchObject({ children: [] });
  expect(host.queryByText(message)).toBeNull();
  expect(host.queryByRole('progressbar')).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(119));
  expect(host.queryByText(message)).toBeNull();
  expect(host.queryByRole('progressbar')).toBeNull();
  expect(host.toJSON()).toMatchObject({ children: [] });

  await act(() => jest.advanceTimersByTimeAsync(1));
  expect(host.getByText(message)).toBeTruthy();
  expect(host.getByRole('progressbar', { name: message })).toBeTruthy();
});

test('keeps one delay across native layout phases and shows the latest phase', async () => {
  const host = await render(
    <AnswerLoadingPlaceholder phase="container-layout" />,
  );
  await act(() => jest.advanceTimersByTimeAsync(80));
  await host.rerender(<AnswerLoadingPlaceholder phase="text-layout" />);
  await act(() => jest.advanceTimersByTimeAsync(39));
  expect(host.queryByRole('progressbar')).toBeNull();

  await act(() => jest.advanceTimersByTimeAsync(1));
  expect(host.getByText('正在排版文字…')).toBeTruthy();
  expect(host.queryByText('正在确认正文宽度…')).toBeNull();
  await host.rerender(<AnswerLoadingPlaceholder phase="content-layout" />);
  expect(host.getByText('正在布局正文内容…')).toBeTruthy();
  expect(host.queryByText('正在排版文字…')).toBeNull();
});

test('removes a fast wait and its timer immediately when the body becomes ready', async () => {
  const scheduleTimer = jest.spyOn(global, 'setTimeout');
  const cancelTimer = jest.spyOn(global, 'clearTimeout');
  const host = await render(<AnswerLoadingPlaceholder phase="text-layout" />);
  const scheduledIndex = scheduleTimer.mock.calls.findIndex(
    ([, delay]) => delay === 120,
  );
  expect(scheduledIndex).toBeGreaterThanOrEqual(0);
  const layoutTimer = scheduleTimer.mock.results[scheduledIndex].value;
  await act(() => jest.advanceTimersByTimeAsync(60));
  await host.rerender(<Text>已经就绪的正文</Text>);

  expect(host.getByText('已经就绪的正文')).toBeTruthy();
  expect(host.queryByRole('progressbar')).toBeNull();
  expect(cancelTimer).toHaveBeenCalledWith(layoutTimer);
  await act(() => jest.advanceTimersByTimeAsync(120));
  expect(host.queryByText('正在排版文字…')).toBeNull();
  expect(host.queryByRole('progressbar')).toBeNull();
});

test('does not impose a minimum display duration after the delayed indicator appears', async () => {
  const host = await render(<AnswerLoadingPlaceholder phase="text-layout" />);
  await act(() => jest.advanceTimersByTimeAsync(120));
  expect(host.getByText('正在排版文字…')).toBeTruthy();

  await host.rerender(<Text>已经就绪的正文</Text>);
  expect(host.getByText('已经就绪的正文')).toBeTruthy();
  expect(host.queryByRole('progressbar')).toBeNull();
});

test('starts a new delay when another layout wait mounts', async () => {
  const first = await render(<AnswerLoadingPlaceholder phase="text-layout" />);
  await act(() => jest.advanceTimersByTimeAsync(90));
  await first.unmount();

  const second = await render(<AnswerLoadingPlaceholder phase="text-layout" />);
  await act(() => jest.advanceTimersByTimeAsync(119));
  expect(second.queryByRole('progressbar')).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(1));
  expect(second.getByText('正在排版文字…')).toBeTruthy();
});

test('shows fetching immediately and starts a separate layout delay after the fetch', async () => {
  const host = await render(
    <AnswerLoadingPlaceholder phase="fetching-answer" />,
  );
  expect(host.getByText('正在获取回答…')).toBeTruthy();
  expect(host.getByRole('progressbar', { name: '正在获取回答…' })).toBeTruthy();
  await act(() => jest.advanceTimersByTimeAsync(300));

  await host.rerender(<AnswerLoadingPlaceholder phase="container-layout" />);
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(host.queryByRole('progressbar')).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(119));
  expect(host.queryByRole('progressbar')).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(1));
  expect(host.getByText('正在确认正文宽度…')).toBeTruthy();

  await host.rerender(<AnswerLoadingPlaceholder phase="fetching-answer" />);
  expect(host.getByText('正在获取回答…')).toBeTruthy();
  await host.rerender(<AnswerLoadingPlaceholder phase="text-layout" />);
  expect(host.queryByRole('progressbar')).toBeNull();
  await act(() => jest.advanceTimersByTimeAsync(120));
  expect(host.getByText('正在排版文字…')).toBeTruthy();
});
