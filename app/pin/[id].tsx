import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { getPin } from '@/api/zhihu/pin';
import { LikeButton } from '@/components/LikeButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PinDetailScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const textColor = Colors[colorScheme].text;
  const borderColor = Colors[colorScheme].border;
  const backgroundColor = Colors[colorScheme].background;

  const { data: pin, isLoading } = useQuery({
    queryKey: ['pin-detail', id],
    queryFn: () => getPin(id as string),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (pin?.author?.is_following)
        return unfollowMember(pin.author.url_token || pin.author.id);
      return followMember(pin.author.url_token || pin.author.id);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['pin-detail', id] }),
  });

  const goToProfile = () => {
    const token = pin?.author?.url_token || pin?.author?.id;
    if (token) router.push(`/user/${token}`);
  };

  if (isLoading)
    return (
      <View type="default" className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#0084ff" />
        <Text type="secondary" className="mt-2.5">
          载入想法中...喵
        </Text>
      </View>
    );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor,
          borderBottomColor: borderColor,
          borderBottomWidth: StyleSheet.hairlineWidth,
        }}
        className="flex-row items-center justify-between px-2.5"
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center"
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </Pressable>
        <Text className="text-[17px] font-bold">想法详情</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* 作者信息栏 */}
        <View className="flex-row items-center p-5 justify-between">
          <Pressable
            onPress={goToProfile}
            className="flex-row items-center flex-1"
          >
            <Image
              source={{ uri: pin?.author?.avatar_url }}
              className="w-11 h-11 rounded-full"
            />
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold">{pin?.author?.name}</Text>
              <Text
                type="secondary"
                className="text-[13px] mt-0.5"
                numberOfLines={1}
              >
                {pin?.author?.headline}
              </Text>
            </View>
          </Pressable>
          <Pressable
            className="px-[15px] py-1.5 rounded-full"
            style={
              pin?.author?.is_following
                ? {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: '#eee',
                  }
                : { backgroundColor: '#0084ff15' }
            }
            onPress={() => followMutation.mutate()}
            disabled={followMutation.isPending}
          >
            <Text
              style={{
                color: pin?.author?.is_following ? '#999' : '#0084ff',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              {pin?.author?.is_following ? '已关注' : '关注'}
            </Text>
          </Pressable>
        </View>

        {/* 想法内容 */}
        <View className="px-5">
          <RenderHtml
            contentWidth={width - 40}
            source={{ html: pin?.content_html || '' }}
            tagsStyles={{
              div: { color: textColor, fontSize: 18, lineHeight: 28 },
              p: {
                color: textColor,
                fontSize: 18,
                lineHeight: 28,
                marginBottom: 15,
              },
              img: { borderRadius: 12, marginVertical: 10 },
              span: { color: textColor },
            }}
          />
          <Text type="secondary" className="text-[13px] mt-[30px] italic">
            发布于{' '}
            {pin?.created
              ? new Date(pin.created * 1000).toLocaleString()
              : '不久前'}
          </Text>
        </View>
      </ScrollView>

      {/* 底部交互栏 */}
      <View
        type="surface"
        className="absolute bottom-0 w-full flex-row items-center px-[15px]"
        style={{
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          height: 60 + (insets.bottom > 0 ? insets.bottom : 15),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: borderColor,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
        }}
      >
        <View className="flex-row items-center">
          <LikeButton
            id={pin?.id}
            count={pin?.like_count || 0}
            voted={pin?.relationship?.voting}
            type="pins"
          />
        </View>
        <View className="flex-1 flex-row justify-end items-center">
          <Pressable
            className="items-center ml-[22px] flex-row"
            onPress={() => router.push(`/comments/${id}?type=pin`)}
          >
            <Ionicons name="chatbubble-outline" size={22} color="#888" />
            <Text type="secondary" className="ml-1 text-[13px]">
              {pin?.comment_count}
            </Text>
          </Pressable>
          <Pressable className="items-center ml-[22px] flex-row">
            <Ionicons name="share-social-outline" size={22} color="#888" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
