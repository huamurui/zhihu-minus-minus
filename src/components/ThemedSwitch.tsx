import { Switch, type SwitchProps } from 'react-native';
import { useRuntimeThemeColors } from '@/components/Themed';

/**
 * 统一的开关：主题色轨道 + 圆钮。Android 不传 thumbColor 时会用系统强调色，
 * 与主题色轨道撞色。打开时圆钮用 onPrimary，浅色主题色上也看得清。
 */
export function ThemedSwitch({ disabled, style, ...props }: SwitchProps) {
  const colors = useRuntimeThemeColors();
  return (
    <Switch
      trackColor={{ false: colors.textTertiary, true: colors.primary }}
      thumbColor={props.value ? colors.onPrimary : '#ffffff'}
      ios_backgroundColor={colors.textTertiary}
      disabled={disabled}
      style={[disabled ? { opacity: 0.45 } : null, style]}
      {...props}
    />
  );
}
