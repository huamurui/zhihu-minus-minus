import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ZhihuPlainPreviewAnswer } from '@/api/zhihu/nextRender';
import { Text } from '@/components/Themed';
import { CollapsibleRichContent, ZhihuContent } from '@/features/rich-content';

export interface AnswerPreviewPlainBodyProps {
  item: ZhihuPlainPreviewAnswer;
  scope: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRefresh: () => void;
  footerContent?: ReactNode;
}

/** Keep the original renderer and metadata while clipping the collapsed preview. */
export function AnswerPreviewPlainBody({
  item,
  scope,
  expanded,
  onExpandedChange,
  onRefresh,
  footerContent,
}: AnswerPreviewPlainBodyProps) {
  const html = typeof item.content === 'string' ? item.content : undefined;
  const contentArray =
    typeof item.content === 'string' ? undefined : item.content;
  const incomplete =
    item.contentNeedTruncated || item.answerType?.toUpperCase() === 'PAID';

  return (
    <View>
      <CollapsibleRichContent
        key={`${scope}:${item.id}`}
        contentKey={`${scope}:${item.id}`}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        footerContent={footerContent}
        footer={
          incomplete ? (
            <Text type="secondary" className="text-xs mt-2">
              当前仅展示部分正文
            </Text>
          ) : undefined
        }
      >
        <View testID="answer-preview-plain-body">
          <ZhihuContent
            content={html}
            contentArray={contentArray}
            objectId={item.id}
            type="answer"
            segmentInfos={item.segmentInfos}
            linkCardInfo={item.linkCardInfo}
            selectable
            progressive
            onRefresh={onRefresh}
          />
        </View>
      </CollapsibleRichContent>
    </View>
  );
}
