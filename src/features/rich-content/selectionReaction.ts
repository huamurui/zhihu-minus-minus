import { createSegmentReaction } from '@/api/zhihu/answer';
import type { TextSelectionInfo } from './bridge';
import type { RichContentObjectType } from './types';

interface SelectionReactionSource {
  readonly objectId: string;
  readonly type: RichContentObjectType;
}

interface SelectionReactionInput {
  source: SelectionReactionSource;
  selection: TextSelectionInfo;
}

interface SelectionReactionCallbacks {
  getSource: () => SelectionReactionSource | null;
  getSelection: () => TextSelectionInfo | null;
  clearSelection: () => void;
  refresh?: () => void;
  notifySuccess: () => void;
  notifyError: () => void;
}

/** Keep an in-flight reaction attached to the source and selection submitted. */
export function createSelectionReactionOptions(
  callbacks: SelectionReactionCallbacks,
) {
  return {
    mutationFn: async ({ source, selection }: SelectionReactionInput) => {
      if (source.type !== 'answer' || !/^\d+$/.test(source.objectId))
        throw new Error('回答缺少有效 ID');
      return createSegmentReaction(
        source.objectId,
        selection.text,
        selection.startParagraphId,
        selection.startOffset,
        selection.endParagraphId,
        selection.endOffset,
      );
    },
    onSuccess: (
      _result: Awaited<ReturnType<typeof createSegmentReaction>>,
      { source, selection }: SelectionReactionInput,
    ) => {
      if (callbacks.getSource() !== source) return;
      if (callbacks.getSelection() === selection) callbacks.clearSelection();
      callbacks.refresh?.();
      callbacks.notifySuccess();
    },
    onError: (_error: unknown, { source }: SelectionReactionInput) => {
      if (callbacks.getSource() === source) callbacks.notifyError();
    },
  };
}
