import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { type TextInputInstance, View } from 'react-native';
import { createAnswerSelectionComment } from '@/api/zhihu/comment';
import {
  CommentComposer,
  type CommentDraft,
} from '@/components/CommentComposer';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { buildZhihuContent, buildZhihuImageHtml } from '@/utils/zhihuContent';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import type { TextSelectionInfo } from '../bridge';

interface SelectionCommentSheetProps {
  answerId: string;
  selection: TextSelectionInfo;
  onClose: () => void;
  onPosted: () => void;
}

export function SelectionCommentSheet(props: SelectionCommentSheetProps) {
  const { answerId, selection } = props;
  // A different excerpt gets its own text, uploads and mutation observer.
  const key = JSON.stringify([
    answerId,
    selection.startParagraphId,
    selection.startOffset,
    selection.endParagraphId,
    selection.endOffset,
    selection.text,
  ]);
  return <SelectionCommentDraft key={key} {...props} />;
}

function SelectionCommentDraft({
  answerId,
  selection,
  onClose,
  onPosted,
}: SelectionCommentSheetProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInputInstance>(null);
  const colorScheme = useColorScheme();
  const colors = useRuntimeThemeColors();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ text, images }: CommentDraft) => {
      const content = buildZhihuContent(
        text,
        images.map(buildZhihuImageHtml).join('<br/>'),
      );
      return createAnswerSelectionComment(answerId, selection, content);
    },
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ['comments', answerId, 'answer'],
        predicate: ({ queryKey }) => typeof queryKey[3] === 'string',
        refetchType: 'none',
      }),
  });

  return (
    <BottomSheet
      visible
      keyboardAvoiding
      scrollable
      title="评论所选文字"
      subtitle={selection.text}
      onClose={onClose}
    >
      <View style={{ paddingHorizontal: 16 }}>
        {mutation.isError && (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.danger, marginBottom: 8 }}
          >
            发布失败，{getZhihuErrorMessage(mutation.error)}
          </Text>
        )}
        <CommentComposer
          autoFocus
          colorScheme={colorScheme}
          borderColor={colors.border}
          inputRef={inputRef}
          inputText={text}
          isSubmitting={mutation.isPending}
          onChangeText={setText}
          onSubmit={async (draft) => {
            await mutation.mutateAsync(draft, { onSuccess: onPosted });
          }}
          onCancelReply={onClose}
          placeholder="写下你的评论…"
          textColor={colors.text}
          tintColor={colors.link}
        />
      </View>
    </BottomSheet>
  );
}
