import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text, useThemeColor } from './Themed';

export const LikeButton = ({ count }: { count: number }) => {
  const [liked, setLiked] = useState(false);
  const scale = useSharedValue(1);

  const tintColor = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'border');

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
    <Pressable
      onPress={handlePress}
      style={[
        styles.btn,
        { backgroundColor: liked ? tintColor : borderColor },
        liked && styles.likedBtn
      ]}
    >
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={liked ? "caret-up" : "caret-up-outline"}
          size={18}
          color={liked ? "#fff" : tintColor}
        />
      </Animated.View>
      <Text style={[styles.text, { color: liked ? "#fff" : tintColor }]}>
        {liked ? count + 1 : count} 赞同
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 10 },
  likedBtn: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  text: { marginLeft: 4, fontSize: 13, fontWeight: '600' },
});