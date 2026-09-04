import type React from 'react';
import { useCallback } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColor } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BouncyButtonProps extends PressableProps {
  children: React.ReactNode;
  hapticFeedback?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function BouncyButton({
  children,
  hapticFeedback = false,
  style,
  onPressIn,
  onPressOut,
  ...props
}: BouncyButtonProps) {
  const isAndroid = Platform.OS === 'android';
  const settings = useSettingsStore();
  const pressOpacity = settings.pressOpacity ?? 0.82;
  const pressScale = settings.pressScale ?? 0.98;
  const primaryColor = useThemeColor({}, 'primary');
  const androidFeedbackType = settings.androidFeedbackType ?? 'ripple';

  // 是否启用物理动画（缩放与不透明度）
  const enableAnimation = !isAndroid || androidFeedbackType === 'scale-opacity';
  // 是否启用 Android 水波纹效果
  const enableRipple = isAndroid && androidFeedbackType === 'ripple';

  // Android 水波纹颜色：跟随主题色，带透明度
  const rippleColor = `${primaryColor}1A`; // 10% opacity

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const handlePressIn = useCallback(
    (e: any) => {
      if (enableAnimation) {
        scale.value = withSpring(pressScale, { damping: 35, stiffness: 800 });
        opacity.value = withTiming(pressOpacity, { duration: 50 });
      }
      if (hapticFeedback) {
        void impactAsync(ImpactFeedbackStyle.Light);
      }
      if (onPressIn) onPressIn(e);
    },
    [
      pressScale,
      pressOpacity,
      enableAnimation,
      onPressIn,
      scale,
      opacity,
      hapticFeedback,
    ],
  );

  const handlePressOut = useCallback(
    (e: any) => {
      if (enableAnimation) {
        scale.value = withSpring(1, { damping: 35, stiffness: 800 });
        opacity.value = withTiming(1, { duration: 100 });
      }
      if (onPressOut) onPressOut(e);
    },
    [enableAnimation, onPressOut, scale, opacity],
  );

  if (enableAnimation) {
    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, style]}
        {...props}
      >
        {children}
      </AnimatedPressable>
    );
  }

  const flatStyle = StyleSheet.flatten(style) || {};
  const borderRadius = flatStyle.borderRadius ?? 8; // 保底默认圆角以避免水波纹变成大方块

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        enableRipple
          ? {
              overflow: 'hidden',
              backgroundColor: 'transparent',
              borderRadius,
            }
          : undefined,
        style,
      ]}
      android_ripple={{
        color: rippleColor,
        borderless: false,
        foreground: true, // 强制在前层绘制，避免被子组件背景色覆盖
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}
