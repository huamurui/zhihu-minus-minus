import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  getVoteSuccessMessage,
  type VoteContentType,
  voteContent,
} from '@/api/zhihu';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { Text, useThemeColor } from './Themed';
import { VoteTriangle } from './VoteTriangle';

export const LikeButton = ({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
  allowCountShrink = false,
  onVoteChange,
}: {
  id: string | number;
  count: number | string;
  voted?: number;
  type?: VoteContentType;
  variant?: 'default' | 'ghost' | 'minimal' | 'segmented';
  allowCountShrink?: boolean;
  onVoteChange?: (voted: number, count: number) => void;
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const identity = `${type}:${id}`;
  const currentIdentityRef = useRef(identity);
  currentIdentityRef.current = identity;
  const pendingTargetsRef = useRef(new Set<string>());
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);
  const loading = pendingIdentity === identity;
  const queryClient = useQueryClient();
  const scale = useSharedValue(1);
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const borderColor = useThemeColor({}, 'border');
  const mutedColor = useThemeColor({}, 'textSecondary');

  // A recycled FlashList cell resets local reaction state while rendering, even
  // when the next item has equal initial values; see FeedCard for why this is
  // not an effect.
  const [synced, setSynced] = useState({
    identity,
    initialCount,
    initialVoted,
  });
  if (
    synced.identity !== identity ||
    synced.initialCount !== initialCount ||
    synced.initialVoted !== initialVoted
  ) {
    setSynced({ identity, initialCount, initialVoted });
    setCount(initialCount);
    setVoted(initialVoted);
  }

  const isUpvoted = voted === 1;
  const foregroundColor =
    variant === 'default'
      ? isUpvoted
        ? onPrimary
        : primaryColor
      : isUpvoted
        ? primaryColor
        : mutedColor;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (pendingTargetsRef.current.has(identity)) return;
    pendingTargetsRef.current.add(identity);

    scale.value = withSequence(
      withTiming(1.4, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isUpvoted ? 0 : 1;

    setPendingIdentity(identity);
    try {
      const voteType =
        type === 'pins'
          ? nextVoted === 1
            ? 'like'
            : 'unlike'
          : nextVoted === 1
            ? 'up'
            : 'neutral';

      const result = await voteContent(id, type, voteType);
      const resolvedCount =
        result.voteCount ??
        (typeof count === 'number'
          ? Math.max(
              0,
              count + Number(result.voted === 1) - Number(voted === 1),
            )
          : undefined);

      const isCurrent = currentIdentityRef.current === identity;
      if (isCurrent) setVoted(result.voted);
      // 响应计数优先；接口未返回计数时才按最终状态计算差值。
      if (resolvedCount !== undefined) {
        if (isCurrent) {
          setCount(resolvedCount);
          onVoteChange?.(result.voted, resolvedCount);
        }

        if (type !== 'comments') {
          updateContentInteractionCaches(queryClient, {
            type,
            id,
            voted: result.voted,
            voteCount: resolvedCount,
          });
        }
      } else if (type !== 'comments') {
        updateContentInteractionCaches(queryClient, {
          type,
          id,
          voted: result.voted,
        });
      }
      showToast(getVoteSuccessMessage(type, voted, result.voted));
    } catch (error: unknown) {
      showToast(getZhihuErrorMessage(error));
    } finally {
      pendingTargetsRef.current.delete(identity);
      setPendingIdentity((current) => (current === identity ? null : current));
    }
  };

  return (
    <BouncyButton
      accessibilityRole="button"
      accessibilityLabel={
        allowCountShrink
          ? `${isUpvoted ? '取消赞同' : '赞同'}，${count}`
          : undefined
      }
      accessibilityState={{ busy: loading, selected: isUpvoted }}
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'flex-row items-center px-2 py-1.5 rounded-md'
          : variant === 'ghost'
            ? 'flex-row items-center bg-transparent py-1 px-1 rounded-full'
            : variant === 'segmented'
              ? 'flex-row items-center justify-center bg-transparent py-1.5 px-3'
              : 'flex-row items-center justify-center bg-transparent px-1.5 py-1 rounded-full'
      }
      style={[
        allowCountShrink && { flexShrink: 1, minWidth: 0 },
        variant === 'default' && {
          backgroundColor: isUpvoted ? primaryColor : borderColor,
        },
        (variant === 'ghost' ||
          variant === 'minimal' ||
          variant === 'segmented') && {
          borderRadius: 99,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={foregroundColor}
          style={{ marginRight: 4 }}
        />
      ) : (
        <Animated.View
          style={[
            animatedStyle,
            { flexDirection: 'row', alignItems: 'center' },
            allowCountShrink && { flexShrink: 1, minWidth: 0 },
          ]}
        >
          <VoteTriangle
            active={isUpvoted}
            color={foregroundColor}
            direction="up"
            size={
              variant === 'default'
                ? 18
                : variant === 'minimal'
                  ? 24
                  : variant === 'segmented'
                    ? 15
                    : 16
            }
          />
          {variant === 'segmented' && (
            <Text
              className="text-xs ml-1 font-semibold"
              style={{
                color: foregroundColor,
                ...(allowCountShrink && { flexShrink: 1, minWidth: 0 }),
              }}
              numberOfLines={allowCountShrink ? 1 : undefined}
              ellipsizeMode={allowCountShrink ? 'tail' : undefined}
            >
              {typeof count === 'number' ? count : count || 0}
            </Text>
          )}
          {variant === 'minimal' && (
            <Text
              className="text-sm ml-0.5 font-bold"
              style={{
                color: foregroundColor,
              }}
            >
              {count}
            </Text>
          )}
        </Animated.View>
      )}
      {variant !== 'minimal' && variant !== 'segmented' && (
        <Text
          className={`ml-1 text-[13px] font-semibold ${variant === 'ghost' ? 'text-xs ml-0.5' : ''}`}
          style={{
            color: foregroundColor,
          }}
        >
          {typeof count === 'number' && count > 0
            ? count
            : variant === 'default'
              ? '0 赞同'
              : '0'}
        </Text>
      )}
    </BouncyButton>
  );
};
