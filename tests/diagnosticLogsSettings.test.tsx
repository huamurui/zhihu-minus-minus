import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import DiagnosticLogsScreen from '../src/app/settings/diagnostics';
import SettingsScreen from '../src/app/settings/index';
import { copyToClipboard } from '../src/utils/clipboard';
import {
  clearDiagnosticLogs,
  type DiagnosticLogSnapshot,
  formatDiagnosticLogsForExport,
  readDiagnosticLogs,
} from '../src/utils/diagnosticLogs';
import { showToast } from '../src/utils/toast';

const mockPush = jest.fn();

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => {
    jest.requireActual('react').useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  useThemeColor: () => '#123456',
  useRuntimeThemeColors: () => ({
    primary: '#123456',
    textTertiary: '#654321',
  }),
}));
jest.mock('../src/components/ThemeModeSelector', () => ({
  ThemeModeSelector: () => null,
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: (
    selector: (state: { resetSettings: () => void }) => unknown,
  ) => selector({ resetSettings: jest.fn() }),
}));
jest.mock('../src/store/useTelemetryStore', () => ({
  useTelemetryStore: (
    selector: (state: { enabled: boolean; setEnabled: () => void }) => unknown,
  ) => selector({ enabled: true, setEnabled: jest.fn() }),
}));
jest.mock('../src/utils/clipboard', () => ({ copyToClipboard: jest.fn() }));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/utils/diagnosticLogs', () => ({
  readDiagnosticLogs: jest.fn(),
  formatDiagnosticLogsForExport: jest.fn(),
  clearDiagnosticLogs: jest.fn(),
}));

const emptySnapshot: DiagnosticLogSnapshot = {
  entries: [],
  persistenceAvailable: true,
};
const snapshot: DiagnosticLogSnapshot = {
  entries: [
    {
      timestamp: '2026-10-20T00:00:00.000Z',
      source: 'react-render',
      errorType: 'TypeError',
      errorCode: 'application.unknown',
      message: 'Application failure',
      frames: [{ filename: 'RecentMoments.tsx', lineno: 43 }],
      platform: 'ios',
      environment: 'development',
      appVersion: '0.9.2',
      osVersion: '27',
    },
  ],
  persistenceAvailable: true,
};
const exportText = 'TypeError: Application failure\nRecentMoments.tsx:43';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readDiagnosticLogs).mockReturnValue(snapshot);
  jest.mocked(formatDiagnosticLogsForExport).mockReturnValue(exportText);
  jest.mocked(clearDiagnosticLogs).mockReturnValue(true);
  jest.mocked(copyToClipboard).mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('opens logs from settings and includes the route in search results', async () => {
  const host = await render(<SettingsScreen />);
  await fireEvent.press(host.getByText('报错日志'));
  expect(mockPush).toHaveBeenLastCalledWith('/settings/diagnostics');

  await fireEvent.changeText(host.getByPlaceholderText('搜索设置'), '闪退');
  await fireEvent.press(host.getByText('报错日志'));
  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(mockPush).toHaveBeenLastCalledWith('/settings/diagnostics');
});

test('previews and copies exactly the sanitized export without sharing on open', async () => {
  const host = await render(<DiagnosticLogsScreen />);
  expect(host.getByText('最近 1 条报错')).toBeTruthy();
  expect(host.getByText(exportText)).toBeTruthy();
  expect(formatDiagnosticLogsForExport).toHaveBeenLastCalledWith(snapshot);
  expect(copyToClipboard).not.toHaveBeenCalled();

  await fireEvent.press(host.getByRole('button', { name: '复制报错日志' }));
  expect(copyToClipboard).toHaveBeenCalledWith(exportText);
  expect(showToast).toHaveBeenCalledWith('报错日志已复制');
});

test('empty logs disable copy and clear, and refresh reads new records', async () => {
  jest.mocked(readDiagnosticLogs).mockReturnValue(emptySnapshot);
  const host = await render(<DiagnosticLogsScreen />);
  expect(host.getByText('暂无报错日志')).toBeTruthy();
  expect(host.getByRole('button', { name: '复制报错日志' })).toBeDisabled();
  expect(host.getByRole('button', { name: '清空报错日志' })).toBeDisabled();

  jest.mocked(readDiagnosticLogs).mockReturnValue(snapshot);
  await fireEvent.press(host.getByRole('button', { name: '刷新报错日志' }));
  expect(host.getByText('最近 1 条报错')).toBeTruthy();
  expect(host.getByRole('button', { name: '复制报错日志' })).toBeEnabled();
});

test('clear waits for confirmation and removes the visible records', async () => {
  const host = await render(<DiagnosticLogsScreen />);
  await fireEvent.press(host.getByRole('button', { name: '清空报错日志' }));
  expect(clearDiagnosticLogs).not.toHaveBeenCalled();
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  expect(buttons?.find((button) => button.text === '取消')).toBeTruthy();
  const confirm = buttons?.find((button) => button.text === '清空');
  expect(confirm?.onPress).toBeDefined();
  jest.mocked(readDiagnosticLogs).mockReturnValue(emptySnapshot);

  await act(() => confirm?.onPress?.());
  expect(clearDiagnosticLogs).toHaveBeenCalledTimes(1);
  expect(host.getByText('暂无报错日志')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('报错日志已清空');
});

test('failed persistent deletion does not claim all history was cleared', async () => {
  jest.mocked(clearDiagnosticLogs).mockReturnValue(false);
  const host = await render(<DiagnosticLogsScreen />);
  await fireEvent.press(host.getByRole('button', { name: '清空报错日志' }));
  const confirm = jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)?.[2]
    ?.find((button) => button.text === '清空');
  jest.mocked(readDiagnosticLogs).mockReturnValue({
    entries: [],
    persistenceAvailable: false,
  });
  await act(() => confirm?.onPress?.());
  expect(showToast).toHaveBeenCalledWith(
    '已清除本次运行的日志，但无法确认历史文件已清除，请稍后重试',
  );
  expect(showToast).not.toHaveBeenCalledWith('报错日志已清空');
  expect(host.getByRole('button', { name: '清空报错日志' })).toBeEnabled();
});

test('shows unavailable persistence while keeping the in-memory records copyable', async () => {
  jest.mocked(readDiagnosticLogs).mockReturnValue({
    ...snapshot,
    persistenceAvailable: false,
  });
  const host = await render(<DiagnosticLogsScreen />);
  expect(
    host.getByText('日志保存受限，部分记录可能仅保留于本次运行。'),
  ).toBeTruthy();
  expect(host.getByRole('button', { name: '复制报错日志' })).toBeEnabled();
});

test('read failures offer a retry without displaying the raw storage error', async () => {
  jest.mocked(readDiagnosticLogs).mockImplementationOnce(() => {
    throw new Error('synthetic-private-storage-detail');
  });
  const host = await render(<DiagnosticLogsScreen />);
  expect(host.getByText('读取日志失败')).toBeTruthy();
  expect(host.queryByText('synthetic-private-storage-detail')).toBeNull();
  await fireEvent.press(host.getByRole('button', { name: '刷新报错日志' }));
  expect(host.getByText('最近 1 条报错')).toBeTruthy();
});

test('a rejected clipboard operation never claims the logs were copied', async () => {
  jest.mocked(copyToClipboard).mockRejectedValueOnce(new Error('unavailable'));
  const host = await render(<DiagnosticLogsScreen />);
  await fireEvent.press(host.getByRole('button', { name: '复制报错日志' }));
  expect(showToast).toHaveBeenCalledWith('复制失败，请稍后重试');
  expect(showToast).not.toHaveBeenCalledWith('报错日志已复制');
  expect(host.getByRole('button', { name: '复制报错日志' })).toBeEnabled();
});

test('does not report success when the clipboard helper handles a copy failure', async () => {
  jest.mocked(copyToClipboard).mockResolvedValueOnce(false);
  const host = await render(<DiagnosticLogsScreen />);
  await fireEvent.press(host.getByRole('button', { name: '复制报错日志' }));
  expect(showToast).not.toHaveBeenCalledWith('报错日志已复制');
});
