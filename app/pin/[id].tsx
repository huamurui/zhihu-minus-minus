import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { getPin } from '@/api/zhihu/pin';
import { BouncyButton } from '@/components/BouncyButton';
import { LikeButton } from '@/components/LikeButton';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuPin } from '@/types/zhihu';
import { formatDateTime } from '@/utils/date';

export default function PinDetailScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const _queryClient = useQueryClient();
  const textColor = Colors[colorScheme].text;
  const borderColor = Colors[colorScheme].border;
  const backgroundColor = Colors[colorScheme].background;

  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const [isSharing, setIsSharing] = React.useState(false);

  const {
    data: pin,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['pin-detail', id],
    queryFn: () => getPin(id as string),
    retry: (failureCount, err: any) =>
      err?.response?.status === 404 ? false : failureCount < 2,
  });

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && pin?.id) {
      addReadHistory({ content_token: String(pin.id), content_type: 'pin' });
    }
  }, [enableBrowseHistory, pin?.id]);

  const followMutation = useOptimisticToggle<Pick<ZhihuPin, 'author'>>({
    queryKey: ['pin-detail', id],
    mutationFn: async () => {
      const author = pin?.author;
      if (!author) throw new Error('想法尚未加载');
      if (author.is_following)
        return unfollowMember(author.url_token || author.id);
      return followMember(author.url_token || author.id);
    },
    isActive: pin?.author?.is_following,
    onUpdateCache: (old) => ({
      ...old,
      author: {
        ...old.author,
        is_following: !old.author.is_following,
      },
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });

  const goToProfile = useCallback(() => {
    const token = pin?.author?.url_token || pin?.author?.id;
    if (token) router.push(`/user/${token}`);
  }, [pin?.author, router]);

  if (isLoading)
    return (
      <View type="default" className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={primaryColor} />
        <Text type="secondary" className="mt-2.5">
          载入想法中...喵
        </Text>
      </View>
    );

  if (!pin)
    return (
      <View type="default" className="flex-1 justify-center items-center px-6">
        <Ionicons
          name="compass-outline"
          size={48}
          color={Colors[colorScheme].textSecondary}
        />
        <Text className="text-base font-bold mt-4 mb-2">
          你似乎来到了没有知识存在的荒原
        </Text>
        <Text type="secondary" className="text-xs text-center mb-6">
          该想法可能已被删除、失效或暂不可见 喵~
        </Text>
        <BouncyButton
          onPress={() => router.back()}
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: primaryTransparent }}
        >
          <Text className="text-xs font-bold" style={{ color: primaryColor }}>
            返回上一页
          </Text>
        </BouncyButton>
      </View>
    );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen
        options={{
          headerTitle: '想法详情',
          headerShadowVisible: false,
          headerStyle: { backgroundColor },
          headerTintColor: textColor,
          headerRight: () => (
            <BouncyButton
              className="p-2 rounded-full"
              onPress={() => setIsSharing(true)}
              style={{ marginRight: 10 }}
            >
              <ThemedIcon name="share-outline" size={24} colorType="default" />
            </BouncyButton>
          ),
        }}
      />

      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="pin"
        data={
          pin
            ? {
                id: pin.id,
                author: pin.author?.name,
                authorHeadline: pin.author?.headline,
                url: `https://www.zhihu.com/pin/${id}`,
              }
            : null
        }
      />

      <ScrollView
        className="flex-1"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* 作者信息栏 */}
        <View className="flex-row items-center p-5 justify-between bg-transparent">
          <BouncyButton
            onPress={goToProfile}
            className="flex-row items-center flex-1 bg-transparent"
          >
            <Image
              source={{ uri: pin?.author?.avatar_url }}
              className="w-11 h-11 rounded-full"
            />
            <View className="ml-3 flex-1 bg-transparent">
              <Text className="text-base font-bold">{pin?.author?.name}</Text>
              <Text
                type="secondary"
                className="text-[13px] mt-0.5"
                numberOfLines={1}
              >
                {pin?.author?.headline}
              </Text>
            </View>
          </BouncyButton>
          <BouncyButton
            className="px-[15px] py-1.5 rounded-[20px]"
            style={[
              !pin?.author?.is_following
                ? { backgroundColor: primaryTransparent }
                : {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: borderColor,
                  },
            ]}
            onPress={() => followMutation.mutate()}
            disabled={followMutation.isPending}
          >
            <Text
              className="text-sm font-bold"
              style={[
                pin?.author?.is_following
                  ? { color: Colors[colorScheme].textSecondary }
                  : { color: primaryColor },
              ]}
            >
              {pin?.author?.is_following ? '已关注' : '关注'}
            </Text>
          </BouncyButton>
        </View>

        {/* 想法内容 */}
        <View className="px-5 bg-transparent">
          <ZhihuContent
            contentArray={pin?.content}
            objectId={id as string}
            type="pin"
            onRefresh={refetch}
          />
          <Text
            type="secondary"
            className="text-[#bbb] text-[13px] mt-[30px] italic pb-5"
          >
            发布于 {pin?.created ? formatDateTime(pin.created) : '不久前'}{' '}
          </Text>
        </View>
      </ScrollView>

      {/* 底部交互栏 */}
      <View
        className="absolute left-5 right-5 z-[1000] shadow-black/10 shadow-[0_10px_20px] elevation-10"
        style={{ bottom: insets.bottom > 0 ? insets.bottom : 15 }}
      >
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          className="rounded-[32px] overflow-hidden h-16"
          style={{
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(26,26,26,0.8)'
                : 'rgba(255,255,255,0.85)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(150,150,150,0.1)',
          }}
        >
          <View className="flex-row items-center px-5 h-full bg-transparent">
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={pin?.id}
                count={pin?.like_count || 0}
                voted={pin?.relationship?.voting}
                type="pins"
                variant="minimal"
              />
            </View>
            <View className="flex-1 flex-row justify-end items-center bg-transparent">
              <BouncyButton
                className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                onPress={() => router.push(`/comments/${id}?type=pin`)}
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={24}
                  colorType="secondary"
                />
                {pin?.comment_count > 0 && (
                  <Text
                    type="secondary"
                    className="ml-1 text-[13px] font-medium"
                  >
                    {pin?.comment_count}
                  </Text>
                )}
              </BouncyButton>
              <BouncyButton
                className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                onPress={() => setIsSharing(true)}
              >
                <ThemedIcon
                  name="share-social-outline"
                  size={24}
                  colorType="secondary"
                />
              </BouncyButton>
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
}
