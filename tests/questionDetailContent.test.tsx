import { render } from '@testing-library/react-native';
import {
  QUESTION_DETAIL_TEXT_STYLE,
  QuestionDetailContent,
} from '../src/components/QuestionDetailContent';
import type { ZhihuContentProps } from '../src/features/rich-content';
import { createRichContentMetrics } from '../src/features/rich-content/presentation';
import { useSettingsStore } from '../src/store/useSettingsStore';

const mockRichContent = jest.fn((_props: ZhihuContentProps) => null);

jest.mock('../src/features/rich-content', () => ({
  RICH_CONTENT_BODY_FONT_SIZE: jest.requireActual(
    '../src/features/rich-content/presentation',
  ).RICH_CONTENT_BODY_FONT_SIZE,
  ZhihuContent: (props: ZhihuContentProps) => mockRichContent(props),
}));

test('the expanded description renders its body text at the collapsed size', async () => {
  await render(
    <QuestionDetailContent content="<p>合成问题描述</p>" questionId="q1" />,
  );
  const props = mockRichContent.mock.calls.at(-1)?.[0];
  expect(props).toMatchObject({
    content: '<p>合成问题描述</p>',
    objectId: 'q1',
    type: 'question',
  });
  const { body } = createRichContentMetrics(
    props?.fontSizeScale ?? Number.NaN,
    props?.lineHeightScale ?? Number.NaN,
  );
  expect(body.fontSize).toBeCloseTo(QUESTION_DETAIL_TEXT_STYLE.fontSize);
  expect(body.lineHeight).toBeCloseTo(QUESTION_DETAIL_TEXT_STYLE.lineHeight);
});

test('the expanded description keeps the reading size and line height settings', async () => {
  const initial = useSettingsStore.getState();
  useSettingsStore.setState({ fontSizeScale: 1.2, lineHeightScale: 2 });
  try {
    await render(
      <QuestionDetailContent content="<p>合成问题描述</p>" questionId="q1" />,
    );
    const props = mockRichContent.mock.calls.at(-1)?.[0];
    const { body } = createRichContentMetrics(
      props?.fontSizeScale ?? Number.NaN,
      props?.lineHeightScale ?? Number.NaN,
    );
    // The collapsed summary goes through Themed.Text with the same settings.
    expect(body.fontSize).toBeCloseTo(
      QUESTION_DETAIL_TEXT_STYLE.fontSize * 1.2,
    );
    expect(body.lineHeight).toBeCloseTo(
      (QUESTION_DETAIL_TEXT_STYLE.lineHeight * 1.2 * 2) / 1.5,
    );
  } finally {
    useSettingsStore.setState({
      fontSizeScale: initial.fontSizeScale,
      lineHeightScale: initial.lineHeightScale,
    });
  }
});
