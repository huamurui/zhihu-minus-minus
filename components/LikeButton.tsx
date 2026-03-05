import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

export const LikeButton = ({ count }: { count: number }) => {
  const [liked, setLiked] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const handlePress = () => {
    // 动画逻辑：先放大再弹回
    scale.value = withSequence(
      withTiming(1.4, { duration: 100 }),
      withSpring(1)
    );
    setLiked(!liked);
  };

  return (
    <Pressable onPress={handlePress} style={[styles.btn, liked && styles.likedBtn]}>
      <Animated.View style={animatedStyle}>
        <Ionicons 
          name={liked ? "caret-up" : "caret-up-outline"} 
          size={18} 
          color={liked ? "#fff" : "#0084ff"} 
        />
      </Animated.View>
      <Text style={[styles.text, liked && styles.likedText]}>
        {liked ? count + 1 : count} 赞同
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f7ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 10 },
  likedBtn: { backgroundColor: '#0084ff' },
  text: { marginLeft: 4, fontSize: 13, color: '#0084ff', fontWeight: '600' },
  likedText: { color: '#fff' }
});