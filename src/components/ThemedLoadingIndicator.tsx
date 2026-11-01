import { useEffect } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColor } from '@/components/Themed';

export interface ThemedLoadingIndicatorProps {
  /** Diameter of the indicator in points. Defaults to 24. */
  size?: number;
  /** Stroke width of the ring. Defaults to 2.5 for size <= 24, 3 otherwise. */
  strokeWidth?: number;
  /** Foreground spinner color. Defaults to current theme 'primary'. */
  color?: string;
  /** Background track color. Defaults to current theme 'border'. */
  trackColor?: string;
  /** Whether the indicator is actively animating. Defaults to true. */
  animating?: boolean;
  /** Additional container style. */
  style?: StyleProp<ViewStyle>;
  /** Test identifier. */
  testID?: string;
}

export function ThemedLoadingIndicator({
  size = 24,
  strokeWidth,
  color,
  trackColor,
  animating = true,
  style,
  testID,
}: ThemedLoadingIndicatorProps) {
  const themePrimary = useThemeColor({}, 'primary');
  const themeBorder = useThemeColor({}, 'border');
  const spinnerColor = color ?? themePrimary;
  const spinnerTrackColor = trackColor ?? themeBorder;

  const actualStrokeWidth = strokeWidth ?? (size <= 24 ? 2.5 : 3);
  const radius = (size - actualStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcOffset = circumference * 0.25;

  const rotation = useSharedValue(0);

  useEffect(() => {
    if (animating) {
      rotation.value = 0;
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 850,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
      return;
    }
    cancelAnimation(rotation);
    rotation.value = 0;
  }, [animating, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.container,
        { width: size, height: size },
        animatedStyle,
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={spinnerTrackColor}
          strokeWidth={actualStrokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={spinnerColor}
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={arcOffset}
          strokeLinecap="round"
          strokeWidth={actualStrokeWidth}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
