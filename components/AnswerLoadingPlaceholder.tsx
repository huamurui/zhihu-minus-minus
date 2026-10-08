import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Text, useThemeColor, View } from '@/components/Themed';
import type { RichContentLoadingPhase } from '@/features/rich-content';

type AnswerLoadingPhase = 'fetching-answer' | RichContentLoadingPhase;

const loadingMessages: Record<AnswerLoadingPhase, string> = {
  'fetching-answer': '正在获取回答…',
  'container-layout': '正在确认正文宽度…',
  'text-layout': '正在排版文字…',
  'content-layout': '正在布局正文内容…',
};

function LoadingIndicator({ message }: { message: string }) {
  const primaryColor = useThemeColor({}, 'primary');
  return (
    <View
      className="items-center bg-transparent"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <ActivityIndicator size="small" color={primaryColor} />
      <Text type="secondary" className="mt-[15px]">
        {message}
      </Text>
    </View>
  );
}

function LayoutLoadingIndicator({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <LoadingIndicator message={message} /> : null;
}

export function AnswerLoadingPlaceholder({
  phase,
}: {
  phase: AnswerLoadingPhase;
}) {
  const message = loadingMessages[phase];
  return (
    <View className="h-[200px] justify-center items-center bg-transparent">
      {phase === 'fetching-answer' ? (
        <LoadingIndicator message={message} />
      ) : (
        // Layout phases share one timer; entering from a fetch mounts a new wait.
        <LayoutLoadingIndicator message={message} />
      )}
    </View>
  );
}
