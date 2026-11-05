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
} from '@/api/zhihu/voters';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { useThemeColor } from './Themed';
import { VoteTriangle } from './VoteTriangle';

export const DownvoteButton = ({
  id,
  count,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
  onVoteChange,
}: {
  id: string | number;
  count?: number | string;
  voted?: number;
  type?: VoteContentType;
  variant?: 'default' | 'ghost' | 'minimal' | 'segmented';
  onVoteChange?: (voted: number, count?: number) => void;
}) => {
  const [voted, setVoted] = useState(initialVoted);
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
  const mutedColor = useThemeColor({}, 'textSecondary');

  // A recycled FlashList cell resets local reaction state while rendering, even
  // when the next item has equal initial values; see FeedCard for why this is
  // not an effect.
  const [synced, setSynced] = useState({ identity, initialVoted });
  if (synced.identity !== identity || synced.initialVoted !== initialVoted) {
    setSynced({ identity, initialVoted });
    setVoted(initialVoted);
  }

  const isDownvoted = voted === -1;
  const foregroundColor =
    variant === 'default'
      ? isDownvoted
        ? onPrimary
        : primaryColor
      : isDownvoted
        ? primaryColor
        : mutedColor;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (pendingTargetsRef.current.has(identity)) return;
    pendingTargetsRef.current.add(identity);

    scale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isDownvoted ? 0 : -1;

    setPendingIdentity(identity);
    try {
      const voteType = nextVoted === -1 ? 'down' : 'neutral';
      const result = await voteContent(id, type, voteType);
      const resolvedCount =
        result.voteCount ??
        (typeof count === 'number'
          ? Math.max(
              0,
              count + Number(result.voted === 1) - Number(voted === 1),
            )
          : undefined);
      if (currentIdentityRef.current === identity) {
        setVoted(result.voted);
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
      showToast(getVoteSuccessMessage(type, voted, result.voted));
    } catch (err) {
      showToast(getZhihuErrorMessage(err));
    } finally {
      pendingTargetsRef.current.delete(identity);
      setPendingIdentity((current) => (current === identity ? null : current));
    }
  };

  return (
    <BouncyButton
      accessibilityRole="button"
      accessibilityLabel={isDownvoted ? '取消反对' : '反对'}
      accessibilityState={{ busy: loading, selected: isDownvoted }}
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'w-9 h-9 rounded-lg justify-center items-center '
          : variant === 'ghost'
            ? 'flex-row items-center justify-center bg-transparent py-1 px-1 rounded-full'
            : variant === 'segmented'
              ? 'flex-row items-center justify-center bg-transparent py-1.5 px-2.5'
              : 'flex-row items-center justify-center bg-transparent p-2'
      }
      style={[
        variant === 'default' && {
          backgroundColor: isDownvoted ? primaryColor : `${primaryColor}1a`,
        },
        (variant === 'ghost' ||
          variant === 'minimal' ||
          variant === 'segmented') && {
          borderRadius: 99,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foregroundColor} />
      ) : (
        <Animated.View style={animatedStyle}>
          <VoteTriangle
            active={isDownvoted}
            color={foregroundColor}
            direction="down"
            size={
              variant === 'minimal'
                ? 24
                : variant === 'ghost'
                  ? 16
                  : variant === 'segmented'
                    ? 15
                    : 20
            }
          />
        </Animated.View>
      )}
    </BouncyButton>
  );
};
