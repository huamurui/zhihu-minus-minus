import Ionicons from '@expo/vector-icons/Ionicons';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';

interface MoreActionsButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Keep content-menu affordances and touch targets consistent across surfaces. */
export function MoreActionsButton({
  onPress,
  disabled,
  color,
  style,
  accessibilityLabel = '更多操作',
  testID,
}: MoreActionsButtonProps) {
  const foreground = useThemeColor({}, 'textSecondary');
  const actionBarForeground = useContentActionBarColor(foreground);
  return (
    <BouncyButton
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, style]}
      onPress={(event) => {
        event?.stopPropagation();
        onPress(event);
      }}
    >
      <Ionicons
        name="ellipsis-horizontal"
        size={22}
        color={color ?? actionBarForeground}
      />
    </BouncyButton>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
});
