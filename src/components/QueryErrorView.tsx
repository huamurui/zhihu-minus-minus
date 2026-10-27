import Ionicons from '@expo/vector-icons/Ionicons';
import { BouncyButton } from '@/components/BouncyButton';

import { Text, useThemeColor, View } from '@/components/Themed';
import { describeZhihuError } from '@/utils/zhihuError';

interface QueryErrorViewProps {
  message?: string;
  /** The failed request's error; its reason is shown under the message. */
  error?: unknown;
  onRetry: () => void;
  compact?: boolean;
}

export function QueryErrorView({
  message = '加载失败，请检查网络后重试',
  error,
  onRetry,
  compact = false,
}: QueryErrorViewProps) {
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const mutedColor = useThemeColor({}, 'textTertiary');
  const reason = describeZhihuError(error);

  return (
    <View
      className={`items-center justify-center bg-transparent ${compact ? 'px-4 py-5' : 'px-8 py-16'}`}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={compact ? 26 : 40}
        color={mutedColor}
      />
      <Text type="secondary" className="text-center mt-2 text-sm">
        {message}
      </Text>
      {reason ? (
        <Text
          type="secondary"
          selectable
          className="text-center mt-1 text-xs"
          style={{ color: mutedColor }}
        >
          {reason}
        </Text>
      ) : null}
      <BouncyButton
        accessibilityRole="button"
        className="mt-3 px-5 py-2 rounded-full"
        style={{ backgroundColor: primaryColor }}
        onPress={onRetry}
      >
        <Text className="font-bold text-sm" style={{ color: onPrimary }}>
          重新加载
        </Text>
      </BouncyButton>
    </View>
  );
}
