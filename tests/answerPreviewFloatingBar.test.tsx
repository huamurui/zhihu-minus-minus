import { act, renderHook } from '@testing-library/react-native';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewInstance,
} from 'react-native';
import type {
  ZhihuAnswerPreviewItem,
  ZhihuPreviewAnswer,
} from '../src/api/zhihu/nextRender';
import { useAnswerPreviewFloatingBar } from '../src/hooks/useAnswerPreviewFloatingBar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 400,
    height: 800,
    scale: 1,
    fontScale: 1,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }),
}));

function answer(id: string, voteup_count = 1): ZhihuPreviewAnswer {
  return {
    id,
    type: 'answer',
    question: { id: 'synthetic-question', title: '合成问题' },
    author: { id: '', name: '', url_token: '', avatar_url: '', headline: '' },
    excerpt: '',
    voteup_count,
    comment_count: 2,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
    structuredContent: { segments: [], paging: '' },
  };
}

function scroll(y: number): NativeSyntheticEvent<NativeScrollEvent> {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSize: { width: 400, height: 2000 },
      layoutMeasurement: { width: 400, height: 800 },
      zoomScale: 1,
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

type MeasureCallback = Parameters<ViewInstance['measureInWindow']>[0];

test('switches actions to the answer below the header when the preceding footer scrolls past it', async () => {
  const a = answer('answer-a');
  const b = answer('answer-b');
  const host = await renderHook(useAnswerPreviewFloatingBar, {
    initialProps: {
      scope: 'same-screen',
      items: [a, b],
      expandedIds: new Set([a.id, b.id]),
      navigationHeight: 80,
    },
  });
  let firstFooterY = 15;
  const footerA = {
    measureInWindow: (callback: MeasureCallback) =>
      callback(0, firstFooterY, 350, 44),
  };
  const footerB = {
    measureInWindow: (callback: MeasureCallback) => callback(0, 950, 350, 44),
  };
  await act(() => {
    host.result.current.registerFooter(a.id, footerA);
    host.result.current.registerFooter(b.id, footerB);
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: a }, { item: b }],
    });
    host.result.current.onScrollEnd(scroll(600));
  });
  expect(host.result.current.activeAnswer).toBe(b);
  expect(host.result.current.visible).toBe(true);

  firstFooterY = 70; // Some of the preceding answer's own buttons are still visible.
  await act(() => host.result.current.onScrollEnd(scroll(545)));
  expect(host.result.current.visible).toBe(false);

  // FlashList may still report the previous row alone while the list moves.
  firstFooterY = -180;
  await act(() => {
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: a }],
    });
    host.result.current.onScrollEnd(scroll(795));
  });
  expect(host.result.current.visible).toBe(false);
});

test('uses the current answer and rejects old scope, recycled footer and superseded measurements', async () => {
  let now = 1000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const a = answer('answer-a');
  const b = answer('answer-b');
  const login = { id: 'login', type: 'login_prompt', description: '' } as const;
  const callbacksA: MeasureCallback[] = [];
  const callbacksB: MeasureCallback[] = [];
  const footerA = {
    measureInWindow: (callback: MeasureCallback) => callbacksA.push(callback),
  };
  const footerB = {
    measureInWindow: (callback: MeasureCallback) => callbacksB.push(callback),
  };
  const props = {
    scope: 'scope-a',
    items: [login, a, b] as readonly ZhihuAnswerPreviewItem[],
    expandedIds: new Set([a.id, b.id]),
    navigationHeight: 80,
  };
  const host = await renderHook(useAnswerPreviewFloatingBar, {
    initialProps: props,
  });
  await act(() => {
    host.result.current.registerFooter(a.id, footerA);
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: login }, { item: a }],
    });
    host.result.current.onScroll(scroll(400));
  });
  expect(host.result.current.activeAnswer).toBe(a);
  expect(host.result.current.visible).toBe(false);
  const staleTailMeasure = callbacksA.at(-1);
  await act(() => {
    now += 16;
    host.result.current.onScroll(scroll(416));
    staleTailMeasure?.(0, 900, 350, 44);
  });
  expect(host.result.current.visible).toBe(false);
  await act(() => host.result.current.onScrollEnd(scroll(416)));
  await act(() => callbacksA.at(-1)?.(0, 900, 350, 44));
  expect(host.result.current.visible).toBe(true);

  const freshA = answer(a.id, 99);
  await host.rerender({ ...props, items: [login, freshA, b] });
  expect(host.result.current.activeAnswer).toBe(freshA);
  const oldScopeCallback = callbacksA.at(-1);
  const oldScopeHandler = host.result.current.onViewableItemsChanged;
  await host.rerender({ ...props, scope: 'scope-b', items: [login, b] });
  await act(() => {
    oldScopeCallback?.(0, 900, 350, 44);
    oldScopeHandler({ viewableItems: [{ item: a }] });
  });
  expect(host.result.current.activeAnswer).toBeNull();
  expect(host.result.current.visible).toBe(false);

  await act(() => {
    now += 101;
    host.result.current.registerFooter(b.id, footerB);
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: b }],
    });
    host.result.current.onScroll(scroll(400));
  });
  const superseded = callbacksB.at(-1);
  await act(() => host.result.current.onFooterLayout());
  await act(() => superseded?.(0, 900, 350, 44));
  expect(host.result.current.visible).toBe(false);
  await act(() => callbacksB.at(-1)?.(0, 500, 350, 44));
  expect(host.result.current.visible).toBe(false);

  const recycledCallbacks: MeasureCallback[] = [];
  await act(() => {
    host.result.current.onFooterLayout();
    host.result.current.registerFooter(b.id, {
      measureInWindow: (callback) => recycledCallbacks.push(callback),
    });
  });
  await act(() => callbacksB.at(-1)?.(0, 900, 350, 44));
  expect(host.result.current.visible).toBe(false);
  await act(() => recycledCallbacks.at(-1)?.(0, 900, 350, 44));
  expect(host.result.current.activeAnswer).toBe(b);
  expect(host.result.current.visible).toBe(true);

  await act(() => {
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: login }],
    });
  });
  expect(host.result.current.activeAnswer).toBeNull();
  expect(host.result.current.visible).toBe(false);
  await act(() => {
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: b }],
    });
    host.result.current.registerFooter(b.id, null);
  });
  expect(host.result.current.visible).toBe(false);
  await host.unmount();
  clock.mockRestore();
});
