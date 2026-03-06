import apiClient from '@/api/client';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text, useThemeColor } from './Themed';

export const LikeButton = ({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers'
}: {
  id: string | number;
  count: number;
  voted?: number;
  type?: 'answers' | 'articles' | 'questions'
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const scale = useSharedValue(1);

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
    const voteType = nextVoted === 1 ? 'up' : 'neutral';

    setLoading(true);
    try {
      // 知乎投票接口：POST /api/v4/{type}/{id}/voters
      await apiClient.post(`/${type}/${id}/voters`, { type: voteType });

      // 更新状态
      setVoted(nextVoted);
      setCount(prev => isUpvoted ? prev - 1 : prev + 1);
    } catch (err) {
      console.error('投票失败:', err);
      // 如果报错是 401，通常需要登录，这里简单提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={[
        styles.btn,
        { backgroundColor: isUpvoted ? tintColor : borderColor },
        isUpvoted && styles.likedBtn,
        loading && { opacity: 0.7 }
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isUpvoted ? "#fff" : tintColor} style={{ marginRight: 4 }} />
      ) : (
        <Animated.View style={animatedStyle}>
          <Ionicons
            name={isUpvoted ? "caret-up" : "caret-up-outline"}
            size={18}
            color={isUpvoted ? "#fff" : tintColor}
          />
        </Animated.View>
      )}
      <Text style={[styles.text, { color: isUpvoted ? "#fff" : tintColor }]}>
        {count} 赞同
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 10 },
  likedBtn: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  text: { marginLeft: 4, fontSize: 13, fontWeight: '600' },
});