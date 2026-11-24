import { fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import type { ZhihuPlainPreviewAnswer } from '../src/api/zhihu/nextRender';
import { AnswerPreviewPlainBody } from '../src/components/AnswerPreviewPlainBody';
import type {
  CollapsibleRichContent,
  ZhihuContentProps,
} from '../src/features/rich-content';

let mockBodyProps: ZhihuContentProps;
type CollapseProps = ComponentProps<typeof CollapsibleRichContent>;
let mockCollapseProps: CollapseProps;

jest.mock('../src/features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollapsibleRichContent: (props: CollapseProps) => {
      mockCollapseProps = props;
      return react.createElement(
        native.View,
        null,
        props.children,
        props.footer,
        props.footerContent,
        react.createElement(
          native.Pressable,
          {
            testID: 'plain-toggle',
            onPress: () => props.onExpandedChange(!props.expanded),
          },
          react.createElement(
            native.Text,
            null,
            props.expanded ? '收起回答' : '展开回答',
          ),
        ),
      );
    },
    ZhihuContent: (props: ZhihuContentProps) => {
      mockBodyProps = props;
      return react.createElement(native.View, { testID: 'ordinary-body-host' });
    },
  };
});
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual<typeof import('react-native')>('react-native').Text,
}));

function answer(
  content: ZhihuPlainPreviewAnswer['content'],
): ZhihuPlainPreviewAnswer {
  return {
    id: '42',
    type: 'answer',
    question: { id: 'synthetic-question', title: '合成问题' },
    author: {
      id: 'synthetic-author',
      name: '合成作者',
      url_token: 'synthetic-author-token',
      avatar_url: '',
      headline: '',
    },
    excerpt: '',
    voteup_count: 0,
    comment_count: 0,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
    content,
    segmentInfos: [
      {
        pid: 'synthetic-duplicate-pid',
        text: '合成<&第一段加粗',
        marks: [
          {
            start_index: 0,
            end_index: 2,
            seg_info: {
              seg_ids: ['201'],
              is_like: false,
              like_count: 0,
              comment_count: 0,
            },
          },
        ],
      },
    ],
    linkCardInfo: {
      'https://example.invalid/card': {
        display: { title: '合成卡片标题', desc: '合成卡片说明' },
      },
    },
  };
}

test('collapses the selected HTML without replacing its renderer, metadata or interaction', async () => {
  const html = answer(
    '<p data-pid="synthetic-duplicate-pid">合成&lt;&amp;第一段<strong>加粗</strong></p>' +
      '<a class="LinkCard" href="https://example.invalid/card">卡片</a>' +
      '<p>第三段</p><p data-pid="synthetic-duplicate-pid">完整末段<a class="footnote-ref" data-numero="1">[1]</a></p>' +
      '<section class="footnotes"><ol><li data-numero="1"><p>完整脚注全文</p></li></ol></section>',
  );
  const original = JSON.stringify(html);
  const onRefresh = jest.fn();
  const onExpandedChange = jest.fn();
  const props = {
    item: html,
    scope: 'synthetic-session:42',
    expanded: true,
    onExpandedChange,
    onRefresh,
  };
  const host = await render(<AnswerPreviewPlainBody {...props} />);
  expect(mockCollapseProps).toMatchObject({
    contentKey: 'synthetic-session:42:42',
    expanded: true,
    onExpandedChange,
  });
  expect(mockBodyProps).toMatchObject({
    objectId: html.id,
    type: 'answer',
    selectable: true,
    progressive: true,
  });
  expect(mockBodyProps.content).toBe(html.content);
  expect(mockBodyProps.document).toBeUndefined();
  expect(mockBodyProps.renderer).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(html.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(html.linkCardInfo);
  mockBodyProps.onRefresh?.();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(host.getByText('收起回答')).toBeTruthy();
  await fireEvent.press(host.getByTestId('plain-toggle'));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  await host.rerender(<AnswerPreviewPlainBody {...props} expanded={false} />);
  expect(mockBodyProps.content).toBe(html.content);
  expect(mockBodyProps.segmentInfos).toBe(html.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(html.linkCardInfo);
  expect(mockCollapseProps.expanded).toBe(false);
  expect(host.getByText('展开回答')).toBeTruthy();
  await fireEvent.press(host.getByTestId('plain-toggle'));
  expect(onExpandedChange).toHaveBeenLastCalledWith(true);
  expect(JSON.stringify(html)).toBe(original);
  await host.unmount();
});

test('keeps every array segment and incomplete-body notices when collapsed', async () => {
  const array = answer([
    { type: 'text', content: '<p>数组原文&lt;&amp;</p>' },
    { type: 'image', url: 'https://example.invalid/image.png' },
    {
      type: 'link_card',
      url: 'https://example.invalid/card',
      title: '数组卡片',
    },
    { type: 'text', content: '<p>数组末段</p>' },
  ]);
  const props = {
    item: array,
    scope: 'synthetic-session:42',
    expanded: false,
    onExpandedChange: jest.fn(),
    onRefresh: jest.fn(),
  };
  const host = await render(<AnswerPreviewPlainBody {...props} />);
  expect(mockBodyProps.contentArray).toBe(array.content);
  expect(mockBodyProps.content).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(array.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(array.linkCardInfo);
  expect(mockBodyProps.selectable).toBe(true);
  expect(mockCollapseProps.expanded).toBe(false);
  expect(host.getByText('展开回答')).toBeTruthy();
  const partial = {
    ...answer('<p>短正文</p>'),
    contentNeedTruncated: true,
    answerType: 'PAID',
  };
  await host.rerender(<AnswerPreviewPlainBody {...props} item={partial} />);
  expect(host.getByText('当前仅展示部分正文')).toBeTruthy();
  expect(mockBodyProps.content).toBe(partial.content);
  expect(mockCollapseProps.expanded).toBe(false);
  expect(host.getByText('展开回答')).toBeTruthy();
  await host.unmount();
});
