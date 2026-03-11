import { voteContent } from '@/api/zhihu';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text, useThemeColor, View } from './Themed';

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

  // 同步外部传入的初始值，解决 API 异步加载导致的数值不一致问题
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  React.useEffect(() => {
    setVoted(initialVoted);
  }, [initialVoted]);

  const tintColor = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'border');

  const isUpvoted = voted === 1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePress = async () => {
    if (loading) return;

    // 动画效果
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

      // 更新状态
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
      style={[
        variant === 'default' ? styles.btn : (variant === 'ghost' ? styles.ghostBtn : styles.minimalBtn),
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
            <Text style={[
              styles.text,
              { color: isUpvoted ? tintColor : '#888', fontSize: 14, marginLeft: 2, fontWeight: 'bold' }
            ]}>
              {count}
            </Text>
          )}
        </Animated.View>
      )}
      {variant !== 'minimal' && (
        <Text style={[
          styles.text,
          { color: isUpvoted ? (variant === 'default' ? "#fff" : tintColor) : (variant === 'default' ? tintColor : "#888") },
          variant === 'ghost' && { fontSize: 12, marginLeft: 2 }
        ]}>
          {count > 0 ? count : (variant === 'default' ? '0 赞同' : '赞')}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 10 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingVertical: 4 },
  minimalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', paddingHorizontal: 4 },
  likedBtn: { elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  text: { marginLeft: 4, fontSize: 13, fontWeight: '600' },
});
