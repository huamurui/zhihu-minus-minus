import { getDailyDetail, getArticle } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { ZhihuContent } from '@/components/ZhihuContent';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function ArticleDetail() {
  const colorScheme = useColorScheme();
  const { id, source } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const surfaceColor = Colors[colorScheme].surface;
  const router = useRouter();

  // 1. 获取日报详情
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily-article', id],
    queryFn: () => getDailyDetail(id as string),
    enabled: source === 'daily',
  });

  // 2. 获取知乎普通文章详情
  const { data: zhihuData, isLoading: zhihuLoading } = useQuery({
    queryKey: ['zhihu-article', id],
    queryFn: () => getArticle(id as string),
    enabled: source !== 'daily',
  });

  const isLoading = source === 'daily' ? dailyLoading : zhihuLoading;
  const data = source === 'daily' ? dailyData : zhihuData;

  if (isLoading)
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
        <Text className="mt-3">正赶往知识的荒原...喵</Text>
      </View>
    );

  if (!data)
    return (
      <View className="flex-1 justify-center items-center">
        <Text>加载失败喵</Text>
      </View>
    );

  const isDaily = source === 'daily';

  return (
    <ScrollView className="flex-1">
      <Stack.Screen options={{ title: isDaily ? '知乎日报' : '文章' }} />

      {/* 顶部展示模块 */}
      {isDaily ? (
        <View className="w-full h-[300px] relative">
          <Image source={{ uri: data.image }} className="w-full h-full" />
          <View
            className="absolute bottom-0 p-5 w-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <Text className="text-white text-[22px] font-bold">
              {data.title}
            </Text>
            {data.image_source && (
              <Text
                className="text-right mt-2 text-[10px]"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {data.image_source}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View className="p-5 pt-[30px]">
          <Text className="text-2xl font-bold leading-8 mb-5">
            {data.title}
          </Text>
          <View className="flex-row items-center">
            <Image
              source={{ uri: data.author?.avatar_url }}
              className="w-11 h-11 rounded-full"
            />
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold">{data.author?.name}</Text>
              <Text
                type="secondary"
                className="text-[13px] mt-0.5"
                numberOfLines={1}
              >
                {data.author?.headline}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 内容渲染 */}
      <View className="px-[15px] bg-transparent">
        <ZhihuContent
          content={isDaily ? data.body : data.content}
          objectId={id as string}
          type="article"
        />
      </View>

      {/* 底部信息 (针对普通文章) */}
      {!isDaily && (
        <View
          className="p-5 mt-5"
          style={{ borderTopWidth: StyleSheet.hairlineWidth }}
        >
          <Text type="secondary" className="text-sm mb-[15px]">
            {data.voteup_count || 0} 赞同 · {data.comment_count || 0} 评论
          </Text>
          <Pressable
            className="flex-row items-center justify-center p-[15px] rounded-xl"
            style={{ backgroundColor: surfaceColor }}
            onPress={() => router.push(`/comments/${id}?type=article`)}
          >
            <Ionicons
              name="chatbubble-outline"
              size={18}
              color={Colors[colorScheme].primary}
            />
            <Text type="primary" className="font-bold ml-2 text-[15px]">
              查看全部 {data.comment_count || 0} 条评论
            </Text>
          </Pressable>
        </View>
      )}

      <View className="h-[100px] bg-transparent" />
    </ScrollView>
  );
}
