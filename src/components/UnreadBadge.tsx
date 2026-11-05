import { useSettingsStore } from '@/store/useSettingsStore';
import { Text, useThemeColor, View } from './Themed';

export function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

interface UnreadBadgeProps {
  count: number;
  /**
   * `corner` overlays an avatar and is positioned by `className`;
   * `inline` sits before a chevron in a menu row.
   */
  placement: 'corner' | 'inline';
  /** Corner badges are outlined with the surface behind the avatar. */
  borderColor?: string;
  /** Corner count badge diameter; existing screens use 18 or 20. */
  size?: number;
  className?: string;
}

/** Renders an unread count in the style chosen under 外观设置 → 未读角标. */
export function UnreadBadge({
  count,
  placement,
  borderColor,
  size = 20,
  className,
}: UnreadBadgeProps) {
  const style = useSettingsStore((state) => state.unreadBadgeStyle);
  const danger = useThemeColor({}, 'danger');
  const onDanger = useThemeColor({}, 'onDanger');
  const primary = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  if (count <= 0 || style === 'hidden') return null;

  const label = `${formatUnreadCount(count)} 条未读`;
  const tinted = style !== 'count';
  const backgroundColor = tinted ? primary : danger;
  const color = tinted ? onPrimary : onDanger;

  if (style === 'dot') {
    const dotSize = placement === 'corner' ? 12 : 8;
    return (
      <View
        accessibilityLabel={label}
        className={className}
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor,
          // A dot sits on the avatar's rim instead of the count's outer corner.
          ...(placement === 'corner' ? { top: 2, right: 2 } : {}),
          ...(placement === 'corner' && borderColor
            ? { borderWidth: 2, borderColor }
            : {}),
          ...(placement === 'inline' ? { marginRight: 6 } : {}),
        }}
      />
    );
  }

  if (placement === 'inline') {
    return (
      <Text
        accessibilityLabel={label}
        className={`text-xs font-bold px-1.5 py-0.5 rounded-[10px] overflow-hidden mr-1 ${className ?? ''}`}
        style={{ backgroundColor, color }}
      >
        {formatUnreadCount(count)}
      </Text>
    );
  }

  return (
    <View
      accessibilityLabel={label}
      className={`rounded-full justify-center items-center px-1 border-2 ${className ?? ''}`}
      style={{
        minWidth: size,
        // The count scales with the reading text settings; let it grow.
        minHeight: size,
        backgroundColor,
        borderColor,
      }}
    >
      <Text
        className="font-bold text-center"
        style={{ color, fontSize: 10, lineHeight: 12 }}
      >
        {formatUnreadCount(count)}
      </Text>
    </View>
  );
}
