import { cssInterop } from 'nativewind';
import type React from 'react';
import { useCallback } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
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
import { getRippleButtonStyles } from './bouncyButtonStyles';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BouncyButtonProps extends PressableProps {
  children: React.ReactNode;
  hapticFeedback?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

function RippleButton({
  children,
  style,
  hitSlop,
  onLayout,
  ...props
}: BouncyButtonProps) {
  const styles = getRippleButtonStyles(StyleSheet.flatten(style) ?? {});

  return (
    <View
      collapsable={false}
      accessible={false}
      pointerEvents="box-none"
      hitSlop={hitSlop}
      onLayout={onLayout}
      style={styles.container}
    >
      <Pressable {...props} hitSlop={hitSlop} style={styles.content}>
        {children}
      </Pressable>
    </View>
  );
}

// 先解析 className，使 rounded-full 等样式参与外层水波纹裁剪。
cssInterop(RippleButton, { className: 'style' });

export function BouncyButton({
  children,
  hapticFeedback = false,
  style,
  onPressIn,
  onPressOut,
  android_ripple,
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
    (e: GestureResponderEvent) => {
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
    (e: GestureResponderEvent) => {
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

  return (
    <RippleButton
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={style}
      android_ripple={{
        color: rippleColor,
        borderless: false,
        foreground: true,
        ...android_ripple,
      }}
    >
      {children}
    </RippleButton>
  );
}
