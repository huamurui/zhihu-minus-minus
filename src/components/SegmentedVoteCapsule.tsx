import { useEffect, useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { VoteContentType } from '@/api/zhihu/voters';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { DownvoteButton } from './DownvoteButton';
import { LikeButton } from './LikeButton';

export interface SegmentedVoteCapsuleProps {
  id: string | number;
  count: number | string;
  voted?: number;
  type?: VoteContentType;
  showDownvote?: boolean;
  allowCountShrink?: boolean;
  flatWhenNeutral?: boolean;
  onVoteChange?: (voted: number, count: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedVoteCapsule({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers',
  showDownvote = true,
  allowCountShrink = false,
  flatWhenNeutral = false,
  onVoteChange,
  style,
}: SegmentedVoteCapsuleProps) {
  const colors = useRuntimeThemeColors();
  const colorScheme = useColorScheme();
  const [currentVoted, setCurrentVoted] = useState(initialVoted);
  const [currentCount, setCurrentCount] = useState(initialCount);

  // biome-ignore lint/correctness/useExhaustiveDependencies: FlashList identity changes must reset local reaction state even when the next item has equal initial values.
  useEffect(() => {
    setCurrentVoted(initialVoted);
    setCurrentCount(initialCount);
  }, [id, initialVoted, initialCount]);

  const isVoted = currentVoted === 1 || currentVoted === -1;

  const primaryTint =
    colorScheme === 'dark' ? `${colors.primary}30` : `${colors.primary}18`;
  const primaryBorder =
    colorScheme === 'dark' ? `${colors.primary}48` : `${colors.primary}33`;
  const neutralBg =
    colorScheme === 'dark'
      ? 'rgba(255, 255, 255, 0.06)'
      : 'rgba(0, 0, 0, 0.035)';
  const neutralBorder = colors.contentBorder;
  const neutralDivider =
    colorScheme === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.06)';

  const showFill = isVoted || !flatWhenNeutral;
  const dividerColor = isVoted ? primaryBorder : neutralDivider;

  return (
    <View
      style={[
        styles.capsule,
        allowCountShrink && styles.shrinkable,
        // The border stays (transparent when flat) so voting never shifts layout.
        {
          backgroundColor: showFill
            ? isVoted
              ? primaryTint
              : neutralBg
            : 'transparent',
          borderColor: showFill
            ? isVoted
              ? primaryBorder
              : neutralBorder
            : 'transparent',
        },
        style,
      ]}
    >
      <LikeButton
        id={id}
        count={currentCount}
        voted={currentVoted}
        type={type}
        variant="segmented"
        allowCountShrink={allowCountShrink}
        onVoteChange={(nextVoted, nextCount) => {
          setCurrentVoted(nextVoted);
          setCurrentCount(nextCount);
          onVoteChange?.(nextVoted, nextCount);
        }}
      />
      {showDownvote ? (
        <>
          <View style={[styles.divider, { backgroundColor: dividerColor }]} />
          <DownvoteButton
            id={id}
            count={currentCount}
            voted={currentVoted}
            type={type}
            variant="segmented"
            onVoteChange={(nextVoted, nextCount) => {
              setCurrentVoted(nextVoted);
              if (nextCount !== undefined) {
                setCurrentCount(nextCount);
                onVoteChange?.(nextVoted, nextCount);
              }
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    alignSelf: 'center',
  },
  shrinkable: {
    flexShrink: 1,
    minWidth: 0,
  },
});
