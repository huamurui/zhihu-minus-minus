import { cssInterop } from 'nativewind';
import { type ColorValue, StyleSheet } from 'react-native';
import { ActionIconCount } from '@/components/ActionIconCount';
import {
  BouncyButton,
  type BouncyButtonProps,
} from '@/components/BouncyButton';

/** Shared capsule feedback for controls in content action rows. */
export function ContentActionButton({
  accessibilityRole = 'button',
  cornerCount,
  style,
  ...props
}: BouncyButtonProps & {
  cornerCount?: { value?: number; color?: ColorValue };
}) {
  const button = (
    <BouncyButton
      {...props}
      accessibilityRole={accessibilityRole}
      style={[styles.button, cornerCount && styles.cornerButton, style]}
    />
  );
  return cornerCount ? (
    <ActionIconCount count={cornerCount.value} color={cornerCount.color}>
      {button}
    </ActionIconCount>
  ) : (
    button
  );
}

cssInterop(ContentActionButton, { className: 'style' });

const styles = StyleSheet.create({
  button: {
    borderRadius: 99,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cornerButton: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
