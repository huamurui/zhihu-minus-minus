import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Image, ScrollView, StyleSheet } from 'react-native';
import {
  type FeedItem,
  getAnswer,
  getArticle,
  getPin,
  getQuestion,
} from '@/api/zhihu';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  getRichContentQueryKey,
  hasInlineRichContent,
  RICH_CONTENT_STALE_TIME,
  ZhihuContent,
} from '@/features/rich-content';
import { Text, useThemeColor, View } from './Themed';

interface FeedCardPreviewProps {
  item: FeedItem;
}

function getResponseStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }
  const response = error.response;
  if (!response || typeof response !== 'object' || !('status' in response)) {
    return undefined;
  }
  return typeof response.status === 'number' ? response.status : undefined;
}

export function FeedCardPreview({ item }: FeedCardPreviewProps) {
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const isVideo = item.type === 'videos';
  const typeKey =
    item.type === 'answers'
      ? 'answer'
      : item.type === 'articles'
        ? 'article'
        : item.type === 'pins'
          ? 'pin'
          : 'question';
  const inlineContent = item.content as unknown;
  const hasInlineContent = hasInlineRichContent(inlineContent);
  const queryKey = isVideo
    ? ['video-preview', item.id]
    : getRichContentQueryKey(
        item.type as Exclude<typeof item.type, 'videos'>,
        item.id,
      );

  const { data: fullData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        if (item.type === 'answers') {
          return await getAnswer(item.id);
        }
        if (item.type === 'articles') {
          return await getArticle(item.id);
        }
        if (item.type === 'pins') {
          return await getPin(item.id);
        }
        if (item.type === 'questions') {
          return await getQuestion(item.id);
        }
        return null;
      } catch (error: unknown) {
        if (getResponseStatus(error) === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !isVideo && !hasInlineContent,
    placeholderData: hasInlineContent ? { content: inlineContent } : undefined,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: false,
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: Colors[colorScheme].backgroundSecondary,
        },
      ]}
    >
      {/* Author Profile */}
      <View className="flex-row items-center mb-3 bg-transparent">
        <Image
          source={{ uri: item.author.avatar }}
          className="w-7 h-7 rounded-full"
        />
        <View className="ml-2 bg-transparent flex-1">
          <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
            {item.author.name}
          </Text>
          {item.author.headline ? (
            <Text
              numberOfLines={1}
              className="text-[11px] text-tertiary dark:text-tertiary-dark mt-0.5"
            >
              {item.author.headline}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Content Title */}
      {item.title ? (
        <Text
          numberOfLines={2}
          className="text-base font-bold mb-2.5 text-foreground dark:text-foreground-dark leading-6"
        >
          {item.title}
        </Text>
      ) : null}

      {/* Scrollable Content Body */}
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
      >
        {isVideo ? (
          <Text type="secondary" className="leading-6">
            {item.excerpt || '点击卡片打开视频'}
          </Text>
        ) : isLoading ? (
          <View className="py-10 justify-center items-center bg-transparent">
            <ActivityIndicator size="small" color={primaryColor} />
            <Text className="mt-2 text-xs opacity-60">正在获取完整内容...</Text>
          </View>
        ) : (
          <View className="bg-transparent mb-2">
            <ZhihuContent
              content={
                typeof fullData?.content === 'string'
                  ? fullData.content
                  : undefined
              }
              contentArray={
                item.type === 'pins' && Array.isArray(fullData?.content)
                  ? fullData.content
                  : undefined
              }
              objectId={item.id}
              type={typeKey}
              useNative={true}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 320,
    maxHeight: 450,
    padding: 16,
    borderRadius: 16,
  },
  scrollContainer: {
    maxHeight: 330,
  },
});
