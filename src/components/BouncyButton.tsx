import { cssInterop } from 'nativewind';
import type React from 'react';
import { useCallback } from 'react';
import {
  type GestureResponderEvent,
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
import {
  getPressFeedbackMode,
  useSettingsStore,
} from '@/store/useSettingsStore';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { getRippleButtonStyles } from './bouncyButtonStyles';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BouncyButtonProps extends PressableProps {
  ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
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
  android_ripple,
  ...props
}: BouncyButtonProps) {
  const primaryColor = useThemeColor({}, 'primary');
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
      <Pressable
        {...props}
        hitSlop={hitSlop}
        style={styles.content}
        android_ripple={{
          color: `${primaryColor}1A`,
          borderless: false,
          foreground: true,
          ...android_ripple,
        }}
      >
        {children}
      </Pressable>
    </View>
  );
}

// 先解析 className，使 rounded-full 等样式参与外层水波纹裁剪。
cssInterop(RippleButton, { className: 'style' });

function OpacityButton({ style, ...props }: BouncyButtonProps) {
  const pressOpacity = useSettingsStore((state) => state.pressOpacity ?? 0.82);
  const opacity = StyleSheet.flatten(style)?.opacity ?? 1;
  return (
    <Pressable
      {...props}
      cssInterop={false}
      style={({ pressed }) =>
        pressed && !props.disabled && typeof opacity === 'number'
          ? [style, { opacity: opacity * pressOpacity }]
          : style
      }
    />
  );
}

// Resolve className before passing the style callback to the native Pressable.
cssInterop(OpacityButton, { className: 'style' });

function ScaleOpacityButton({
  style,
  onPressIn,
  onPressOut,
  ...props
}: BouncyButtonProps) {
  const pressOpacity = useSettingsStore((state) => state.pressOpacity ?? 0.82);
  const pressScale = useSettingsStore((state) => state.pressScale ?? 0.98);
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
      scale.value = withSpring(pressScale, { damping: 35, stiffness: 800 });
      opacity.value = withTiming(pressOpacity, { duration: 50 });
      onPressIn?.(e);
    },
    [pressScale, pressOpacity, onPressIn, scale, opacity],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, { damping: 35, stiffness: 800 });
      opacity.value = withTiming(1, { duration: 100 });
      onPressOut?.(e);
    },
    [onPressOut, scale, opacity],
  );
  return (
    <AnimatedPressable
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
    />
  );
}

export function BouncyButton({
  hapticFeedback = false,
  onPressIn,
  android_ripple,
  ...props
}: BouncyButtonProps) {
  const feedback = useSettingsStore(getPressFeedbackMode);
  const hapticPressIn = useCallback(
    (event: GestureResponderEvent) => {
      void impactAsync(ImpactFeedbackStyle.Light);
      onPressIn?.(event);
    },
    [onPressIn],
  );
  const pressIn = hapticFeedback ? hapticPressIn : onPressIn;

  if (feedback === 'ripple') {
    return (
      <RippleButton
        {...props}
        onPressIn={pressIn}
        android_ripple={android_ripple}
      />
    );
  }
  if (feedback === 'scale-opacity') {
    return <ScaleOpacityButton {...props} onPressIn={pressIn} />;
  }
  if (feedback === 'opacity') {
    return <OpacityButton {...props} onPressIn={pressIn} />;
  }
  return <Pressable {...props} onPressIn={pressIn} />;
}
