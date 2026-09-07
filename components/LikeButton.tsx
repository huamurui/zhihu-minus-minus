import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { voteContent } from '@/api/zhihu';
import Colors from '@/constants/Colors';
import { colors } from '@/constants/designTokens';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { Text, useThemeColor } from './Themed';
import { useColorScheme } from './useColorScheme';

export const LikeButton = ({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
  onVoteChange,
}: {
  id: string | number;
  count: number | string;
  voted?: number;
  type?: 'answers' | 'articles' | 'questions' | 'pins' | 'comments';
  variant?: 'default' | 'ghost' | 'minimal';
  onVoteChange?: (voted: number, count: number) => void;
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();

  const tintColor = useThemeColor({}, 'primary');
  const borderColor = Colors[colorScheme].border;

  // 同步外部传入的初始值
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);
  React.useEffect(() => {
    setVoted(initialVoted);
  }, [initialVoted]);

  const isUpvoted = voted === 1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (loading) return;

    scale.value = withSequence(
      withTiming(1.4, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isUpvoted ? 0 : 1;

    setLoading(true);
    try {
      const voteType =
        type === 'pins'
          ? nextVoted === 1
            ? 'like'
            : 'unlike'
          : nextVoted === 1
            ? 'up'
            : 'neutral';

      await voteContent(id, type, voteType);

      setVoted(nextVoted);
      // count 可能是占位符（如 '-'），仅在数字时增减并通知外部
      if (typeof count === 'number') {
        const newCount = isUpvoted ? count - 1 : count + 1;
        setCount(newCount);
        onVoteChange?.(nextVoted, newCount);
      }
      showToast(isUpvoted ? '已取消赞同' : '已赞同');
    } catch (error: unknown) {
      showToast(getZhihuErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BouncyButton
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'flex-row items-center px-2 py-1.5 rounded-md'
          : variant === 'ghost'
            ? 'flex-row items-center bg-transparent py-1 px-1 rounded-full'
            : 'flex-row items-center justify-center bg-transparent px-1.5 py-1 rounded-full'
      }
      style={[
        variant === 'default' && {
          backgroundColor: isUpvoted ? tintColor : borderColor,
        },
        (variant === 'ghost' || variant === 'minimal') && {
          borderRadius: 99,
        },
        loading && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={tintColor}
          style={{ marginRight: 4 }}
        />
      ) : (
        <Animated.View
          style={[
            animatedStyle,
            { flexDirection: 'row', alignItems: 'center' },
          ]}
        >
          <Ionicons
            name={isUpvoted ? 'caret-up' : 'caret-up-outline'}
            size={variant === 'default' ? 18 : variant === 'minimal' ? 28 : 16}
            color={
              variant === 'minimal'
                ? isUpvoted
                  ? tintColor
                  : colors[colorScheme].iconMuted
                : isUpvoted
                  ? variant === 'default'
                    ? colors[colorScheme].textInverse
                    : tintColor
                  : variant === 'default'
                    ? tintColor
                    : colors[colorScheme].iconMuted
            }
          />
          {variant === 'minimal' && (
            <Text
              className="text-sm ml-0.5 font-bold"
              style={{
                color: isUpvoted ? tintColor : colors[colorScheme].iconMuted,
              }}
            >
              {count}
            </Text>
          )}
        </Animated.View>
      )}
      {variant !== 'minimal' && (
        <Text
          className={`ml-1 text-[13px] font-semibold ${variant === 'ghost' ? 'text-xs ml-0.5' : ''}`}
          style={{
            color: isUpvoted
              ? variant === 'default'
                ? colors[colorScheme].textInverse
                : tintColor
              : variant === 'default'
                ? tintColor
                : colors[colorScheme].iconMuted,
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
