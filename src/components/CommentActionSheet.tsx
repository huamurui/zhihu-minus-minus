import { ActionSheet } from '@/components/overlays/ActionSheet';
import { copyToClipboard } from '@/utils/clipboard';
import { parseCommentContent } from '@/utils/commentContent';
import { showToast } from '@/utils/toast';

interface CommentActionSheetProps {
  visible: boolean;
  htmlContent: string | null;
  authorName: string | null;
  canDelete?: boolean;
  onDelete?: () => void;
  onClose: () => void;
}

export function CommentActionSheet({
  visible,
  htmlContent,
  authorName,
  canDelete = false,
  onDelete,
  onClose,
}: CommentActionSheetProps) {
  const commentText = htmlContent
    ? parseCommentContent(htmlContent)
        .map((part) => part.text)
        .join('')
    : '';
  if (!htmlContent || !authorName || !commentText) return null;

  const options = [
    {
      key: 'copy',
      label: '复制评论',
      icon: 'copy-outline' as const,
      onPress: async () => {
        const copied = await copyToClipboard(commentText);
        if (copied) showToast(`已复制 @${authorName} 的评论`);
      },
    },
    ...(canDelete && onDelete
      ? [
          {
            key: 'delete',
            label: '删除评论',
            icon: 'trash-outline' as const,
            destructive: true,
            onPress: onDelete,
          },
        ]
      : []),
  ];

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={`@${authorName} 的评论`}
      subtitle={commentText}
      options={options}
    />
  );
}
