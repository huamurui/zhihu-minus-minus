import { StyleSheet, type TextStyle } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

export interface TopTabLabelProps {
  index: number;
  label: string;
  scrollX: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  style?: TextStyle;
}

export function TopTabLabel({
  index,
  label,
  scrollX,
  activeColor,
  inactiveColor,
  style,
}: TopTabLabelProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distanceFromSelection = Math.min(1, Math.abs(scrollX.value - index));
    return {
      color: interpolateColor(
        distanceFromSelection,
        [0, 1],
        [activeColor, inactiveColor],
      ),
    };
  });

  return (
    <Animated.Text style={[styles.navText, style, animatedStyle]}>
      {label}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  navText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
