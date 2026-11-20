import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CollapsibleRichContent } from '../components/CollapsibleRichContent';

let mockWindowHeight = 800;
let mockTogglePress: (() => void) | undefined;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 400,
    height: mockWindowHeight,
    scale: 1,
    fontScale: 1,
  }),
}));
jest.mock('@/components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    backgroundSecondary: '#ffffff',
    link: '#0055aa',
  }),
}));
jest.mock('@/components/ContentActionButton', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ContentActionButton: (
      props: import('react-native').PressableProps & { onPress: () => void },
    ) => {
      mockTogglePress = props.onPress;
      return react.createElement(native.Pressable, props);
    },
  };
});
jest.mock('expo-linear-gradient', () => ({
  LinearGradient:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));

function layout(height: number, width = 360): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  } as LayoutChangeEvent;
}

beforeEach(() => {
  mockWindowHeight = 800;
});

test('collapses a tall single paragraph by its measured height and keeps toggles outside the clipping', async () => {
  const onExpandedChange = jest.fn();
  const host = await render(
    <CollapsibleRichContent
      contentKey="one-long-paragraph"
      expanded={false}
      onExpandedChange={onExpandedChange}
      footer={<Text testID="body-footer">重新加载正文</Text>}
      footerContent={<Text>发布于 2026-10-18 · IP 属地天津</Text>}
    >
      <Text testID="complete-paragraph">{'长段落'.repeat(500)}</Text>
    </CollapsibleRichContent>,
  );
  const viewport = host.getByTestId('collapsible-rich-content-viewport');
  const body = host.getByTestId('collapsible-rich-content-body');
  await fireEvent(body, 'layout', layout(1200));

  expect(
    host.getByTestId('complete-paragraph', { includeHiddenElements: true }),
  ).toHaveTextContent('长段落'.repeat(500));
  expect(StyleSheet.flatten(viewport.props.style).maxHeight).toBeLessThan(1200);
  expect(host.getByTestId('body-footer')).toBeVisible();
  expect(host.getByText('发布于 2026-10-18 · IP 属地天津')).toBeVisible();
  expect(
    host.getByTestId('collapsible-rich-content-fade', {
      includeHiddenElements: true,
    }).props.pointerEvents,
  ).toBe('none');
  expect(body).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(body).toHaveProp('accessibilityElementsHidden', true);
  const toggle = host.getByTestId('collapsible-rich-content-toggle');
  expect(toggle).toHaveProp('accessibilityState', { expanded: false });
  await fireEvent.press(toggle);
  expect(onExpandedChange).toHaveBeenCalledWith(true);
  await host.unmount();
});

test('keeps several short paragraphs and a small remainder fully visible without a toggle', async () => {
  const host = await render(
    <CollapsibleRichContent
      contentKey="short-paragraphs"
      expanded={false}
      onExpandedChange={jest.fn()}
      footerContent={<Text>发布于 2026-10-18</Text>}
    >
      <Text>甲</Text>
      <Text>乙</Text>
      <Text>丙</Text>
      <Text>丁</Text>
    </CollapsibleRichContent>,
  );
  const viewport = host.getByTestId('collapsible-rich-content-viewport');
  const previewHeight = StyleSheet.flatten(viewport.props.style).maxHeight;
  await fireEvent(
    host.getByTestId('collapsible-rich-content-body'),
    'layout',
    layout(previewHeight + 24),
  );
  expect(host.getByText('丁')).toBeVisible();
  expect(host.getByText('发布于 2026-10-18')).toBeVisible();
  expect(
    StyleSheet.flatten(viewport.props.style).maxHeight,
  ).toBeGreaterThanOrEqual(previewHeight + 24);
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  expect(host.queryByTestId('collapsible-rich-content-fade')).toBeNull();
  await host.unmount();
});

test('keeps a collapsed row bounded while the renderer replaces a short placeholder with a tall body', async () => {
  const host = await render(
    <CollapsibleRichContent
      contentKey="async-body"
      expanded={false}
      onExpandedChange={jest.fn()}
    >
      <Text>正文</Text>
    </CollapsibleRichContent>,
  );
  const viewport = host.getByTestId('collapsible-rich-content-viewport');
  const body = host.getByTestId('collapsible-rich-content-body');
  const previewHeight = StyleSheet.flatten(viewport.props.style).maxHeight;
  await fireEvent(body, 'layout', layout(80));
  expect(host.queryByText('展开回答')).toBeNull();

  // Native layout applies the current viewport constraint to the new body
  // before JS receives its height. FlashList sees that first layout too.
  const loadedHeight = 2400;
  const beforeNotification = StyleSheet.flatten(viewport.props.style).maxHeight;
  expect(Math.min(loadedHeight, beforeNotification ?? Infinity)).toBe(
    previewHeight,
  );
  await fireEvent(body, 'layout', layout(loadedHeight));
  expect(StyleSheet.flatten(viewport.props.style).maxHeight).toBe(
    previewHeight,
  );
  expect(host.getByText('展开回答')).toBeVisible();
  await host.unmount();
});

test('keeps the body mounted and interactive through expansion and collapse', async () => {
  const mounted = jest.fn();
  const unmounted = jest.fn();
  const onLinkPress = jest.fn();
  function Body() {
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    return (
      <Pressable onPress={onLinkPress}>
        <Text selectable>完整正文链接</Text>
      </Pressable>
    );
  }
  function Host() {
    const [expanded, setExpanded] = useState(false);
    return (
      <CollapsibleRichContent
        contentKey="stable-body"
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <Body />
      </CollapsibleRichContent>
    );
  }
  const host = await render(<Host />);
  await fireEvent(
    host.getByTestId('collapsible-rich-content-body'),
    'layout',
    layout(1400),
  );
  await fireEvent.press(host.getByText('展开回答'));
  expect(
    StyleSheet.flatten(
      host.getByTestId('collapsible-rich-content-viewport').props.style,
    ).maxHeight,
  ).toBeUndefined();
  expect(host.getByTestId('collapsible-rich-content-body')).toHaveProp(
    'importantForAccessibility',
    'auto',
  );
  expect(host.getByText('完整正文链接')).toHaveProp('selectable', true);
  await fireEvent.press(host.getByText('完整正文链接'));
  expect(onLinkPress).toHaveBeenCalledTimes(1);
  await fireEvent.press(host.getByText('收起回答'));
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  await host.unmount();
});

test('keeps continuation controls available even when the loaded body is short', async () => {
  const onExpandedChange = jest.fn();
  const host = await render(
    <CollapsibleRichContent
      contentKey="more-pages"
      expanded={false}
      onExpandedChange={onExpandedChange}
      hasMore
      toggleTestID="answer-toggle"
      expandLabel="继续阅读"
      collapseLabel="收起正文"
    >
      <Text>已加载的一小段</Text>
    </CollapsibleRichContent>,
  );
  await fireEvent(
    host.getByTestId('collapsible-rich-content-body'),
    'layout',
    layout(50),
  );
  expect(host.getByText('已加载的一小段')).toBeVisible();
  expect(host.queryByTestId('collapsible-rich-content-fade')).toBeNull();
  await fireEvent.press(host.getByTestId('answer-toggle'));
  expect(onExpandedChange).toHaveBeenCalledWith(true);
  await host.unmount();
});

test('rejects invalid, recycled and old-width measurements while accepting later image heights', async () => {
  const onExpandedChange = jest.fn();
  const element = (contentKey: string) => (
    <CollapsibleRichContent
      contentKey={contentKey}
      expanded={false}
      onExpandedChange={onExpandedChange}
    >
      <Text>{contentKey}</Text>
    </CollapsibleRichContent>
  );
  const host = await render(element('first-answer'));
  const oldBodyLayout = host.getByTestId('collapsible-rich-content-body').props
    .onLayout;
  await fireEvent(
    host.getByTestId('collapsible-rich-content-body'),
    'layout',
    layout(1000),
  );
  const oldToggle = mockTogglePress;
  await host.rerender(element('next-answer'));
  await act(() => {
    oldBodyLayout(layout(1400));
    oldToggle?.();
  });
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  expect(onExpandedChange).not.toHaveBeenCalled();

  const body = host.getByTestId('collapsible-rich-content-body');
  for (const event of [
    layout(Number.NaN),
    layout(Number.POSITIVE_INFINITY),
    layout(-1),
    layout(0),
    layout(1000, 0),
  ]) {
    await fireEvent(body, 'layout', event);
  }
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  await fireEvent(body, 'layout', layout(80));
  expect(host.getByText('next-answer')).toBeVisible();
  await fireEvent(body, 'layout', layout(900));
  expect(host.getByTestId('collapsible-rich-content-toggle')).toBeTruthy();
  await fireEvent(
    host.getByTestId('collapsible-rich-content-viewport'),
    'layout',
    layout(300, 700),
  );
  await fireEvent(body, 'layout', layout(900, 360));
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  await fireEvent(body, 'layout', layout(200, 700));
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  expect(host.getByText('next-answer')).toBeVisible();
  await host.unmount();
});

test('accepts body measurements before viewport initialization and width changes', async () => {
  const host = await render(
    <CollapsibleRichContent
      contentKey="layout-order"
      expanded={false}
      onExpandedChange={jest.fn()}
    >
      <Text>正文</Text>
    </CollapsibleRichContent>,
  );
  const body = host.getByTestId('collapsible-rich-content-body');
  const viewport = host.getByTestId('collapsible-rich-content-viewport');
  await fireEvent(body, 'layout', layout(500, 360));
  await fireEvent(viewport, 'layout', layout(320, 360));
  expect(host.getByTestId('collapsible-rich-content-toggle')).toBeTruthy();

  await fireEvent(body, 'layout', layout(100, 700));
  await fireEvent(viewport, 'layout', layout(100, 700));
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  expect(host.getByText('正文')).toBeVisible();
  await fireEvent(body, 'layout', layout(500, 360));
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();

  await fireEvent(body, 'layout', layout(700, 320));
  await fireEvent(body, 'layout', layout(100, 700));
  await fireEvent(viewport, 'layout', layout(320, 320));
  expect(host.getByTestId('collapsible-rich-content-toggle')).toBeTruthy();
  await host.unmount();
});

test('re-evaluates the preview budget when the viewport height changes', async () => {
  const element = (
    <CollapsibleRichContent
      contentKey="responsive-preview"
      expanded={false}
      onExpandedChange={jest.fn()}
    >
      <View />
    </CollapsibleRichContent>
  );
  const host = await render(element);
  await fireEvent(
    host.getByTestId('collapsible-rich-content-body'),
    'layout',
    layout(300),
  );
  expect(host.queryByTestId('collapsible-rich-content-toggle')).toBeNull();
  mockWindowHeight = 450;
  await host.rerender(
    <CollapsibleRichContent
      contentKey="responsive-preview"
      expanded={false}
      onExpandedChange={jest.fn()}
    >
      <View />
    </CollapsibleRichContent>,
  );
  expect(host.getByTestId('collapsible-rich-content-toggle')).toBeTruthy();
  await host.unmount();
});
