import type { VoteContentType } from '@/api/zhihu/voters';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionButton } from '@/components/CollectionButton';
import { CommentBubbleIcon } from '@/components/CommentBubbleIcon';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton } from '@/components/LikeButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { Text, useThemeColor, View } from '@/components/Themed';

interface FeedCardActionRowProps {
  id: string | number;
  voteCount: number;
  voted: number;
  engagementType: Exclude<VoteContentType, 'comments'> | null;
  commentCount: number;
  isCollected?: boolean;
  collectionCount?: number;
  showDownvote?: boolean;
  onVoteChange?: (voted: number, count: number) => void;
  onComments: () => void;
  onMore: () => void;
  commentAccessibilityLabel?: string;
}

/** Shared inline actions for ordinary feed cards and answer preview cards. */
export function FeedCardActionRow({
  id,
  voteCount,
  voted,
  engagementType,
  commentCount,
  isCollected,
  collectionCount,
  showDownvote = false,
  onVoteChange,
  onComments,
  onMore,
  commentAccessibilityLabel = '评论',
}: FeedCardActionRowProps) {
  const secondaryColor = useThemeColor({}, 'textSecondary');
  return (
    <View className="flex-row items-center bg-transparent">
      {engagementType ? (
        <>
          <LikeButton
            id={id}
            count={voteCount}
            voted={voted}
            type={engagementType}
            variant="ghost"
            onVoteChange={onVoteChange}
          />
          {showDownvote && engagementType === 'answers' ? (
            <View className="ml-2 bg-transparent">
              <DownvoteButton
                id={id}
                voted={voted}
                type={engagementType}
                variant="ghost"
              />
            </View>
          ) : null}
          {engagementType === 'answers' || engagementType === 'articles' ? (
            <View className="ml-2 bg-transparent">
              <CollectionButton
                id={id}
                type={engagementType === 'answers' ? 'answer' : 'article'}
                isCollected={isCollected}
                count={collectionCount}
                variant="inline"
              />
            </View>
          ) : null}
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel={commentAccessibilityLabel}
            onPress={onComments}
            className="flex-row items-center bg-transparent ml-2 py-1 px-3 rounded-full"
          >
            <CommentBubbleIcon size={16} color={secondaryColor} />
            <Text type="secondary" className="ml-1 text-xs font-semibold">
              {commentCount > 0 ? commentCount : '0'}
            </Text>
          </BouncyButton>
        </>
      ) : null}
      <MoreActionsButton
        onPress={onMore}
        color={secondaryColor}
        style={{ marginLeft: 'auto', marginRight: -8 }}
      />
    </View>
  );
}
