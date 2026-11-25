import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useThemeColor } from '@/components/Themed';
import { calculateScrollIndicatorGeometry } from '@/utils/scrollIndicator';

interface ReadingScrollIndicatorProps {
  scrollY: SharedValue<number>;
  contentHeight: SharedValue<number>;
  /** Use the ScrollView's full onLayout height, before subtracting track insets. */
  viewportHeight: SharedValue<number>;
  edgePull?: SharedValue<number>;
  top?: number;
  bottom?: number;
  right?: number;
  visible?: boolean;
}

/** An unobtrusive, non-interactive scroll marker for a reading viewport. */
export function ReadingScrollIndicator({
  scrollY,
  contentHeight,
  viewportHeight,
  edgePull,
  top = 8,
  bottom = 8,
  right = 4,
  visible = true,
}: ReadingScrollIndicatorProps) {
  const color = useThemeColor({}, 'textSecondary');
  const trackHeight = useSharedValue(0);
  const geometry = useDerivedValue(() =>
    calculateScrollIndicatorGeometry(
      scrollY.value,
      contentHeight.value,
      viewportHeight.value,
      trackHeight.value,
      undefined,
      edgePull?.value,
    ),
  );
  const trackStyle = useAnimatedStyle(() => ({
    opacity: visible && geometry.value.visible ? 1 : 0,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    height: geometry.value.thumbHeight,
    transform: [{ translateY: geometry.value.thumbOffset }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => {
        trackHeight.value = nativeEvent.layout.height;
      }}
      style={[styles.track, { top, bottom, right }, trackStyle]}
    >
      <View style={[styles.rail, { backgroundColor: color }]} />
      <Animated.View
        style={[styles.thumb, { backgroundColor: color }, thumbStyle]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    width: 3,
    overflow: 'hidden',
    borderRadius: 2,
  },
  rail: {
    ...StyleSheet.absoluteFill,
    borderRadius: 2,
    opacity: 0.08,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: 3,
    borderRadius: 2,
    opacity: 0.45,
  },
});
