import { StyleSheet } from 'react-native';
import type { VoteContentType } from '@/api/zhihu/voters';
import {
  BouncyButton,
  type BouncyButtonProps,
} from '@/components/BouncyButton';
import { CollectionButton } from '@/components/CollectionButton';
import { CommentBubbleIcon } from '@/components/CommentBubbleIcon';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton, type VoteAction } from '@/components/LikeButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { Text, useThemeColor, View } from '@/components/Themed';

/** The row itself is pressable. Each inline action owns its touch and accessibility target. */
export function FeedTextTarget({
  onPress,
  onLongPress,
  disabled,
  style,
  ...props
}: BouncyButtonProps) {
  return (
    <BouncyButton
      accessibilityRole="button"
      {...props}
      style={[style, styles.textTarget]}
      onPress={(event) => {
        event?.stopPropagation();
        // Keep the touch responder while busy so taps can't open the card beneath it.
        if (!disabled) onPress?.(event);
      }}
      onLongPress={
        onLongPress &&
        ((event) => {
          event?.stopPropagation();
          if (!disabled) onLongPress(event);
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  textTarget: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    flexShrink: 1,
  },
});

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
  voteAction?: VoteAction;
  textOnly?: boolean;
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
  voteAction,
  textOnly = false,
  onComments,
  onMore,
  commentAccessibilityLabel = '评论',
}: FeedCardActionRowProps) {
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const collection =
    engagementType === 'answers' || engagementType === 'articles' ? (
      <CollectionButton
        id={id}
        type={engagementType === 'answers' ? 'answer' : 'article'}
        isCollected={isCollected}
        count={collectionCount}
        variant={textOnly ? 'text' : 'inline'}
      />
    ) : null;
  if (textOnly && voteAction) {
    return (
      <View className="flex-row flex-wrap items-center gap-x-3 bg-transparent">
        {engagementType && (
          <>
            <FeedTextTarget
              accessibilityLabel={voted === 1 ? '取消赞同' : '赞同'}
              accessibilityValue={{ text: String(voteCount) }}
              accessibilityState={{
                selected: voted === 1,
                busy: voteAction.pending,
                disabled: voteAction.pending,
              }}
              disabled={voteAction.pending}
              onPress={voteAction.onPress}
            >
              <Text type="caption">
                {voted === 1 ? '已赞同' : '赞同'} {voteCount}
              </Text>
            </FeedTextTarget>
            {collection}
            <FeedTextTarget
              accessibilityLabel={commentAccessibilityLabel}
              onPress={onComments}
            >
              <Text type="caption">评论 {commentCount}</Text>
            </FeedTextTarget>
          </>
        )}
        <FeedTextTarget
          accessibilityLabel="更多操作"
          onPress={onMore}
          style={{ marginLeft: 'auto' }}
        >
          <Text type="caption">更多</Text>
        </FeedTextTarget>
      </View>
    );
  }
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
            voteAction={voteAction}
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
          {collection ? (
            <View className="ml-2 bg-transparent">{collection}</View>
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
