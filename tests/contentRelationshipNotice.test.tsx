import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import {
  type ContentRelationshipTip,
  getContentRelationship,
} from '../api/zhihu/relationship';
import { ContentRelationshipNotice } from '../components/ContentRelationshipNotice';
import { useAuthStore } from '../store/useAuthStore';

jest.mock('../api/zhihu/relationship', () => ({
  getContentRelationship: jest.fn(),
}));
let mockSessionVersion = 1;
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: jest.requireActual('zustand').create(() => ({
    activeAccountIndex: 0,
  })),
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
}));
jest.mock('../components/VoterListModal', () => ({
  VoterListModal: ({
    visible,
    onClose,
    contentType,
    contentId,
    count,
  }: {
    visible: boolean;
    onClose: () => void;
    contentType: string;
    contentId: string;
    count?: number;
  }) => {
    if (!visible) return null;
    const { Text: MockText, Pressable } = jest.requireActual('react-native');
    return (
      <Pressable accessibilityRole="button" onPress={onClose}>
        <MockText>{`voters:${contentType}:${contentId}:${count}`}</MockText>
      </Pressable>
    );
  },
}));

function tip(
  contentType: 'answer' | 'pin' = 'answer',
  id = '101',
): ContentRelationshipTip {
  return {
    type: 'reaction_endorse',
    text:
      contentType === 'answer'
        ? '合成用户 等 8 人赞同了该回答'
        : '9 人赞同了该想法',
    action_url: `zhihu://hybrid?zh_url=${encodeURIComponent(`https://www.zhihu.com/appview/${contentType}/${id}/voters`)}&zh_hide_nav_bar=true`,
  };
}

function setupClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  jest.mocked(getContentRelationship).mockReset();
  mockSessionVersion = 1;
  useAuthStore.setState({ activeAccountIndex: 0 });
});

test('keeps one row before the body across inactive, loading and personalized states and opens current voters locally', async () => {
  let finish: ((value: ContentRelationshipTip) => void) | undefined;
  const relationship = {
    ...tip(),
    text: `${'合成关注者甲、合成关注者乙、'.repeat(12)}等 8 人赞同了该回答`,
  };
  jest.mocked(getContentRelationship).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, wrapper } = setupClient();
  const page = (enabled: boolean) => (
    <>
      <ContentRelationshipNotice
        contentType="answer"
        contentId="101"
        voteCount={8}
        enabled={enabled}
      />
      <Text>回答正文</Text>
    </>
  );
  const host = await render(page(false), { wrapper });
  const initialRow = host.getByText('8 人赞同了该回答').parent;
  expect(getContentRelationship).not.toHaveBeenCalled();
  expect(host.queryByRole('button')).toBeNull();
  await host.rerender(page(true));
  expect(host.getByText('8 人赞同了该回答').parent).toBe(initialRow);
  await act(() => finish?.(relationship));
  await waitFor(() => expect(host.getByText(relationship.text)).toBeTruthy());
  const notice = host.getByText(relationship.text);
  expect(notice.parent).toBe(initialRow);
  expect(notice.props.numberOfLines).toBe(1);
  expect(notice.props.accessibilityLabel).toBe(relationship.text);
  await fireEvent.press(host.getByRole('button', { name: relationship.text }));
  expect(host.getByText('voters:answer:101:8')).toBeTruthy();
  await host.rerender(page(false));
  expect(host.getByText(relationship.text).parent).toBe(initialRow);
  expect(host.queryByRole('button')).toBeNull();
  expect(host.queryByText('voters:answer:101:8')).toBeNull();
  expect(host.getByText('回答正文')).toBeTruthy();
  expect(getContentRelationship).toHaveBeenCalledTimes(1);
  await host.unmount();
  client.clear();
});

test('request failure preserves the count row and leaves the body readable', async () => {
  let fail: ((reason: Error) => void) | undefined;
  jest.mocked(getContentRelationship).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const { client, wrapper } = setupClient();
  const host = await render(
    <>
      <ContentRelationshipNotice
        contentType="answer"
        contentId="101"
        voteCount={8}
      />
      <Text>回答正文</Text>
    </>,
    { wrapper },
  );
  const fallback = '8 人赞同了该回答';
  const initialRow = host.getByText(fallback).parent;
  await act(() => fail?.(new Error('合成请求失败')));
  await waitFor(() =>
    expect(
      client.getQueryState(['content-relationship', 'answer', '101', 1])
        ?.status,
    ).toBe('error'),
  );
  expect(host.getByText(fallback).parent).toBe(initialRow);
  expect(host.getByText('回答正文')).toBeTruthy();
  expect(host.queryByText('合成请求失败')).toBeNull();
  await host.unmount();
  client.clear();
});

test('content and account changes close old voters and isolate relationship text', async () => {
  const firstPin = {
    ...tip('pin', '202'),
    text: '合成当前账号用户 等 9 人赞同了该想法',
  };
  const nextPin = { ...firstPin, text: '合成新账号用户 等 9 人赞同了该想法' };
  let finishNext: ((value: ContentRelationshipTip) => void) | undefined;
  jest
    .mocked(getContentRelationship)
    .mockResolvedValueOnce(tip())
    .mockResolvedValueOnce(firstPin)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNext = resolve;
        }),
    );
  const { client, wrapper } = setupClient();
  const host = await render(
    <ContentRelationshipNotice
      contentType="answer"
      contentId="101"
      voteCount={8}
    />,
    { wrapper },
  );
  await waitFor(() => expect(host.getByText(tip().text)).toBeTruthy());
  await fireEvent.press(host.getByRole('button', { name: tip().text }));
  await host.rerender(
    <ContentRelationshipNotice
      contentType="pin"
      contentId="202"
      voteCount={9}
    />,
  );
  await waitFor(() => expect(host.getByText(firstPin.text)).toBeTruthy());
  expect(host.queryByText('voters:answer:101:8')).toBeNull();
  await fireEvent.press(host.getByRole('button', { name: firstPin.text }));
  expect(host.getByText('voters:pin:202:9')).toBeTruthy();
  await act(() => {
    mockSessionVersion += 1;
    useAuthStore.setState({ activeAccountIndex: 1 });
  });
  await waitFor(() => expect(finishNext).toBeDefined());
  expect(host.queryByText(firstPin.text)).toBeNull();
  expect(host.queryByText('voters:pin:202:9')).toBeNull();
  await act(() => finishNext?.(nextPin));
  await waitFor(() => expect(host.getByText(nextPin.text)).toBeTruthy());
  expect(
    client.getQueryData(['content-relationship', 'pin', '202', 1]),
  ).toEqual(firstPin);
  expect(
    client.getQueryData(['content-relationship', 'pin', '202', 2]),
  ).toEqual(nextPin);
  await host.unmount();
  client.clear();
});

test('refreshes the relationship text after the current vote count changes', async () => {
  const updated = { ...tip(), text: '合成用户 等 9 人赞同了该回答' };
  jest
    .mocked(getContentRelationship)
    .mockResolvedValueOnce(tip())
    .mockResolvedValueOnce(updated);
  const { client, wrapper } = setupClient();
  const host = await render(
    <ContentRelationshipNotice
      contentType="answer"
      contentId="101"
      voteCount={8}
    />,
    { wrapper },
  );
  await waitFor(() => expect(host.getByText(tip().text)).toBeTruthy());
  await host.rerender(
    <ContentRelationshipNotice
      contentType="answer"
      contentId="101"
      voteCount={9}
    />,
  );
  await waitFor(() => expect(host.getByText(updated.text)).toBeTruthy());
  expect(getContentRelationship).toHaveBeenCalledTimes(2);
  await host.unmount();
  client.clear();
});
