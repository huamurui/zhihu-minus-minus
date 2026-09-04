import { Ionicons } from '@expo/vector-icons';
import { BouncyButton } from '@/components/BouncyButton';

import { Text, useThemeColor, View } from '@/components/Themed';

interface QueryErrorViewProps {
  message?: string;
  onRetry: () => void;
  compact?: boolean;
}

export function QueryErrorView({
  message = '加载失败，请检查网络后重试',
  onRetry,
  compact = false,
}: QueryErrorViewProps) {
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textTertiary');

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
      <BouncyButton
        accessibilityRole="button"
        className="mt-3 px-5 py-2 rounded-full"
        style={{ backgroundColor: primaryColor }}
        onPress={onRetry}
      >
        <Text className="text-white font-bold text-sm">重新加载</Text>
      </BouncyButton>
    </View>
  );
}
