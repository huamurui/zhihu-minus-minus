import {
  RICH_CONTENT_BODY_FONT_SIZE,
  ZhihuContent,
} from '@/features/rich-content';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Text } from './Themed';

/** The line-height setting `Themed.Text` treats as unscaled. */
const THEMED_TEXT_BASE_LINE_HEIGHT_SCALE = 1.5;

/**
 * 问题描述的字号与行高。收起时的摘要和展开后的富文本共用这一组数值，
 * 展开、收起之间字号不跳变。
 */
export const QUESTION_DETAIL_TEXT_STYLE = { fontSize: 14, lineHeight: 22 };

/** 有正文可展开时，摘要最多显示三行。 */
export function QuestionDetailSummary({
  text,
  truncate = true,
}: {
  text: string;
  truncate?: boolean;
}) {
  return (
    <Text
      type="secondary"
      numberOfLines={truncate ? 3 : undefined}
      style={QUESTION_DETAIL_TEXT_STYLE}
    >
      {text}
    </Text>
  );
}

/**
 * 展开后的问题描述：按收起时的字号行高缩放富文本正文。收起时的摘要经
 * `Themed.Text` 套用阅读设置的字号与行高倍数，这里同样套用，展开前后一致。
 * 富文本刚挂载时要先测量排版，这期间继续显示收起时的摘要，不出现灰色占位条。
 */
export function QuestionDetailContent({
  content,
  questionId,
  summary,
}: {
  content: string;
  questionId: string;
  /** 收起时显示的摘要，排版测量期间沿用。 */
  summary?: string;
}) {
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  return (
    <ZhihuContent
      content={content}
      objectId={questionId}
      type="question"
      fontSizeScale={
        (QUESTION_DETAIL_TEXT_STYLE.fontSize * fontSizeScale) /
        RICH_CONTENT_BODY_FONT_SIZE
      }
      lineHeightScale={
        (QUESTION_DETAIL_TEXT_STYLE.lineHeight /
          QUESTION_DETAIL_TEXT_STYLE.fontSize) *
        (lineHeightScale / THEMED_TEXT_BASE_LINE_HEIGHT_SCALE)
      }
      renderPlaceholder={
        summary === undefined
          ? undefined
          : () => <QuestionDetailSummary text={summary} />
      }
    />
  );
}
