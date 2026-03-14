import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { voteContent } from '@/api/zhihu/voters';
import Colors from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

export const DownvoteButton = ({
  id,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
}: {
  id: string | number;
  voted?: number;
  type?: 'answers' | 'articles' | 'questions' | 'pins' | 'comments';
  variant?: 'default' | 'minimal';
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;

  React.useEffect(() => {
    setVoted(initialVoted);
  }, [initialVoted]);

  const isDownvoted = voted === -1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (loading) return;

    scale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isDownvoted ? 0 : -1;

    setLoading(true);
    try {
      const voteType = nextVoted === -1 ? 'down' : 'neutral';
      await voteContent(id, type, voteType);
      setVoted(nextVoted);
    } catch (err) {
      console.error('投票失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'w-9 h-9 rounded-lg justify-center items-center ml-1.5'
          : 'flex-row items-center justify-center bg-transparent px-1'
      }
      style={[
        variant === 'default' && {
          backgroundColor: isDownvoted ? tintColor : '#0084ff10',
        },
        loading && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            isDownvoted || variant === 'minimal'
              ? tintColor
              : variant === 'default'
                ? '#fff'
                : tintColor
          }
        />
      ) : (
        <Animated.View style={animatedStyle}>
          <Ionicons
            name={isDownvoted ? 'caret-down' : 'caret-down-outline'}
            size={variant === 'minimal' ? 28 : 20}
            color={
              variant === 'minimal'
                ? isDownvoted
                  ? tintColor
                  : '#888'
                : isDownvoted
                  ? '#fff'
                  : tintColor
            }
          />
        </Animated.View>
      )}
    </Pressable>
  );
};
