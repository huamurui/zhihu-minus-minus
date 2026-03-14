import { voteContent } from '@/api/zhihu';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text } from './Themed';
import { useColorScheme } from './useColorScheme';
import Colors from '@/constants/Colors';

export const LikeButton = ({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default'
}: {
  id: string | number;
  count: number;
  voted?: number;
  type?: 'answers' | 'articles' | 'questions' | 'pins' | 'comments';
  variant?: 'default' | 'ghost' | 'minimal';
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();

  const tintColor = Colors[colorScheme].tint;
  const borderColor = Colors[colorScheme].border;

  // 同步外部传入的初始值
  React.useEffect(() => { setCount(initialCount); }, [initialCount]);
  React.useEffect(() => { setVoted(initialVoted); }, [initialVoted]);

  const isUpvoted = voted === 1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePress = async () => {
    if (loading) return;

    scale.value = withSequence(
      withTiming(1.4, { duration: 100 }),
      withSpring(1)
    );

    const nextVoted = isUpvoted ? 0 : 1;

    setLoading(true);
    try {
      const voteType = type === 'pins'
        ? (nextVoted === 1 ? 'like' : 'unlike')
        : (nextVoted === 1 ? 'up' : 'neutral');

      await voteContent(id, type, voteType as any);

      setVoted(nextVoted);
      setCount(prev => isUpvoted ? prev - 1 : prev + 1);
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
          ? 'flex-row items-center px-3 py-1.5 rounded-md mr-2.5'
          : variant === 'ghost'
          ? 'flex-row items-center bg-transparent py-1'
          : 'flex-row items-center justify-center bg-transparent px-1'
      }
      style={[
        variant === 'default' && { backgroundColor: isUpvoted ? tintColor : borderColor },
        isUpvoted && variant === 'default' && styles.likedBtn,
        loading && { opacity: 0.7 }
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tintColor} style={{ marginRight: 4 }} />
      ) : (
        <Animated.View style={[animatedStyle, { flexDirection: 'row', alignItems: 'center' }]}>
          <Ionicons
            name={isUpvoted ? "caret-up" : "caret-up-outline"}
            size={variant === 'default' ? 18 : (variant === 'minimal' ? 28 : 16)}
            color={variant === 'minimal' ? (isUpvoted ? tintColor : '#888') : (isUpvoted ? (variant === 'default' ? "#fff" : tintColor) : (variant === 'default' ? tintColor : "#888"))}
          />
          {variant === 'minimal' && (
            <Text
              className="text-sm ml-0.5 font-bold"
              style={{ color: isUpvoted ? tintColor : '#888' }}
            >
              {count}
            </Text>
          )}
        </Animated.View>
      )}
      {variant !== 'minimal' && (
        <Text
          className={`ml-1 text-[13px] font-semibold ${variant === 'ghost' ? 'text-xs ml-0.5' : ''}`}
          style={{ color: isUpvoted ? (variant === 'default' ? "#fff" : tintColor) : (variant === 'default' ? tintColor : "#888") }}
        >
          {count > 0 ? count : (variant === 'default' ? '0 赞同' : '赞')}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  likedBtn: { elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
});
