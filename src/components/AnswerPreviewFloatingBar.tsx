import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ZhihuPreviewAnswerMetadata } from '@/api/zhihu/nextRender';
import { ActionIconCount } from '@/components/ActionIconCount';
import { CollectionButton } from '@/components/CollectionButton';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  ContentActionBar,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { ContentActionButton } from '@/components/ContentActionButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { SegmentedVoteCapsule } from '@/components/SegmentedVoteCapsule';
import { useIsLiquidGlassActive } from '@/components/surfaces/FloatingSurface';
import { ThemedIcon, useRuntimeThemeColors, View } from '@/components/Themed';
import { usePaneDimensions } from '@/features/adaptive-layout/PaneContext';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';

interface AnswerPreviewFloatingBarProps {
  answer: ZhihuPreviewAnswerMetadata | null;
  visible: boolean;
  bottomInset: number;
  canCollapse?: boolean;
  onCollapse: (answerId: string) => void;
  onMore: (answer: ZhihuPreviewAnswerMetadata) => void;
}

function CollapseIcon() {
  const colors = useRuntimeThemeColors();
  const color = useContentActionBarColor(colors.link);
  return <Ionicons name="chevron-up" size={22} color={color} />;
}

export function AnswerPreviewFloatingBar({
  answer,
  visible,
  bottomInset,
  canCollapse = true,
  onCollapse,
  onMore,
}: AnswerPreviewFloatingBarProps) {
  const router = useRouter();
  const { width, fontScale } = usePaneDimensions();
  const compact = width / fontScale < 400;
  const shown = visible && answer !== null;
  const isGlass = useIsLiquidGlassActive();
  const bottom = getContentActionBarBottom(bottomInset);
  const hideDistance = bottom + CONTENT_ACTION_BAR_HEIGHT + 24;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, { duration: 220 });
  }, [progress, shown]);
  const animatedStyle = useAnimatedStyle(() => {
    const translateY = (1 - progress.value) * (isGlass ? hideDistance : 100);
    return {
      opacity: isGlass ? 1 : progress.value,
      transform: [{ translateY }],
    };
  });
  const collapseAction =
    shown && answer && canCollapse ? (
      <ContentActionButton
        accessibilityRole="button"
        accessibilityLabel="收起当前回答"
        style={compact ? styles.collapseInline : styles.collapseCircle}
        onPress={() => {
          if (shown) onCollapse(answer.id);
        }}
      >
        <CollapseIcon />
      </ContentActionButton>
    ) : null;

  return (
    <ContentActionBar
      bottomInset={bottomInset}
      visible={shown}
      style={animatedStyle}
      variant="islands"
      interactiveGlass
      shrinkLeading
      leading={
        answer ? (
          <SegmentedVoteCapsule
            id={answer.id}
            count={answer.voteup_count}
            voted={answer.relationship.voting}
            type="answers"
            allowCountShrink
          />
        ) : null
      }
      trailing={
        answer ? (
          <View style={styles.trailingGroup}>
            <CollectionButton
              id={answer.id}
              type="answer"
              isCollected={answer.relationship.is_favorited}
              count={answer.favlists_count}
              countDisplay="corner"
              disabled={!shown}
            />
            <ContentActionButton
              accessibilityRole="button"
              accessibilityLabel={`${answer.comment_count} 条回答评论`}
              style={styles.action}
              onPress={() => {
                if (!shown) return;
                router.push({
                  pathname: '/comments/[id]',
                  params: {
                    id: answer.id,
                    type: 'answer',
                    count: answer.comment_count,
                  },
                });
              }}
            >
              <ActionIconCount
                count={
                  answer.comment_count > 0 ? answer.comment_count : undefined
                }
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={20}
                  colorType="secondary"
                />
              </ActionIconCount>
            </ContentActionButton>
            <MoreActionsButton
              accessibilityLabel="回答更多操作"
              onPress={() => {
                if (shown) onMore(answer);
              }}
            />
            {compact ? collapseAction : null}
          </View>
        ) : null
      }
      accessory={compact ? null : collapseAction}
    />
  );
}

const styles = StyleSheet.create({
  trailingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  action: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  collapseInline: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  collapseCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
