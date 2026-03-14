import { deleteAnswer, getAnswer } from '@/api/zhihu';
import {
  fastCollectAnswer,
  getAnswerCollectionStatus,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { ZhihuContent } from '@/components/ZhihuContent';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton } from '@/components/LikeButton';
import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showToast } from '@/utils/toast';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AlertButton,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Reanimated, { SharedTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';

import Colors from '@/constants/Colors';
const slowTransition = SharedTransition.duration(600);

export default function AnswerDetailScreen() {
  const { id, title: initialTitle, questionId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const backgroundColor = Colors[colorScheme].background;

  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);

  const [isLiked, setIsLiked] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState(false);

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    if (currentY > 300) {
      if (diff < -15 && !isHeaderShowRef.current) {
        isHeaderShowRef.current = true;
        Animated.timing(headerVisible, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      } else if (diff > 5 && isHeaderShowRef.current) {
        isHeaderShowRef.current = false;
        Animated.timing(headerVisible, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    } else if (currentY <= 100 && isHeaderShowRef.current) {
      isHeaderShowRef.current = false;
      Animated.timing(headerVisible, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    lastScrollY.current = currentY;
    scrollY.setValue(currentY);
  };

  const {
    data: answer,
    isLoading: queryLoading,
    refetch,
  } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id as string),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (answer?.author?.is_following)
        return unfollowMember(answer.author.url_token || answer.author.id);
      return followMember(answer.author.url_token || answer.author.id);
    },
    onSuccess: () => {
      showToast(answer?.author?.is_following ? '已取消关注' : '已关注');
      queryClient.invalidateQueries({ queryKey: ['answer-detail', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(id as string),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      router.back();
    },
    onError: (err: any) =>
      Alert.alert(
        '删除失败',
        err.response?.data?.error?.message || '无法删除回答',
      ),
  });

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这个回答吗？此操作不可撤销喵！', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  const { data: collectionStatus, refetch: refetchCollectionStatus } = useQuery(
    {
      queryKey: ['answer-collection-status', id],
      queryFn: () => getAnswerCollectionStatus(id as string),
      enabled: !!id,
    },
  );

  const isCollected = collectionStatus?.data?.some(
    (item: any) => item.is_favorited,
  );
  const favoritedCollection = collectionStatus?.data?.find(
    (item: any) => item.is_favorited,
  );

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (isCollected && favoritedCollection)
        return removeFromCollection(favoritedCollection.id, id as string);
      return fastCollectAnswer(id as string);
    },
    onSuccess: (res) => {
      refetchCollectionStatus();
      if (!isCollected)
        showToast(`已收藏到「${res?.collection?.title || '我的收藏'}」`);
      else
        showToast('已取消收藏');
    },
    onError: (err: any) =>
      showToast(err.response?.data?.error?.message || '无法处理请求'),
  });

  const goToProfile = () => {
    const token = answer?.author?.url_token || answer?.author?.id;
    if (token) router.push(`/user/${token}`);
  };

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <Animated.View
        className="absolute left-0 right-0 z-10"
        style={[
          {
            backgroundColor,
            paddingTop: insets.top,
            opacity: headerVisible,
            transform: [
              {
                translateY: headerVisible.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-insets.top - 50, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View className="h-[50px] flex-row items-center px-[15px] justify-between bg-transparent">
          <View className="w-10 bg-transparent" />
          <Pressable
            onPress={goToProfile}
            className="flex-1 flex-row items-center justify-center bg-transparent"
          >
            <Image
              source={{ uri: answer?.author?.avatar_url }}
              className="w-6 h-6 rounded-full mr-2"
            />
            <Text className="text-[15px] font-semibold" numberOfLines={1}>
              {answer?.author?.name || '知乎用户'}
            </Text>
          </Pressable>
          <View className="w-10 bg-transparent" />
        </View>
      </Animated.View>

      <Pressable
        onPress={() => router.back()}
        className="absolute left-2.5 z-[100] w-10 h-10 justify-center items-center"
        style={{ top: insets.top + 8 }}
      >
        <Ionicons name="chevron-back" size={28} color={textColor} />
      </Pressable>

      <ScrollView
        className="flex-1"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        <View style={{ height: insets.top + 45 }} className="bg-transparent" />

        <Pressable
          className="mx-5 py-[15px] flex-row items-center justify-between bg-transparent"
          onPress={() =>
            router.push(`/question/${answer?.question?.id || questionId}`)
          }
        >
          <Reanimated.View
            sharedTransitionTag={`title-${questionId || id}`}
            sharedTransitionStyle={slowTransition}
            className="flex-1 mr-2.5 bg-transparent"
          >
            <Text className="text-[18px] font-bold leading-6">
              {answer?.question?.title || initialTitle || '加载中...'}
            </Text>
          </Reanimated.View>
          {!queryLoading && (
            <Ionicons name="chevron-forward" size={18} color="#999" />
          )}
        </Pressable>

        {queryLoading ? (
          <View className="h-[200px] justify-center items-center bg-transparent">
            <ActivityIndicator size="small" color="#0084ff" />
            <Text type="secondary" className="mt-[15px]">
              正在斟酌文字...喵
            </Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center p-5 justify-between bg-transparent">
              <Pressable
                onPress={goToProfile}
                className="flex-row items-center flex-1 bg-transparent"
              >
                <Image
                  source={{ uri: answer?.author?.avatar_url }}
                  className="w-11 h-11 rounded-full"
                />
                <View className="ml-3 flex-1 bg-transparent">
                  <Text className="text-base font-bold">
                    {answer?.author?.name}
                  </Text>
                  <Text
                    type="secondary"
                    className="text-[13px] text-[#999] mt-0.5"
                    numberOfLines={1}
                  >
                    {answer?.author?.headline}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                className="px-[15px] py-1.5 rounded-[20px]"
                style={[
                  !answer?.author?.is_following
                    ? { backgroundColor: '#0084ff15' }
                    : {
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: '#eee',
                      },
                ]}
                onPress={() => followMutation.mutate()}
                disabled={followMutation.isPending}
              >
                <Text
                  className="text-sm font-bold"
                  style={[
                    answer?.author?.is_following
                      ? { color: '#999' }
                      : { color: '#0084ff' },
                  ]}
                >
                  {answer?.author?.is_following ? '已关注' : '关注'}
                </Text>
              </Pressable>
            </View>

            <View className="px-5 bg-transparent">
              <ZhihuContent
                content={answer?.content || ''}
                segmentInfos={answer?.segment_infos}
                objectId={id as string}
                type="answer"
                onRefresh={refetch}
              />
              <Text
                type="secondary"
                className="text-[#bbb] text-[13px] mt-[30px] italic pb-5"
              >
                发布于{' '}
                {answer?.created_time
                  ? new Date(answer.created_time * 1000).toLocaleDateString()
                  : answer?.created_time_name || '不久前'}{' '}
                · 著作权归作者所有
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View
        className="absolute left-5 right-5 z-[1000] shadow-black/10 shadow-[0_10px_20px] elevation-10"
        style={{ bottom: insets.bottom + 20 }}
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
                id={answer?.id}
                count={answer?.voteup_count || '-'}
                voted={answer?.relationship?.voting}
                variant="minimal"
              />
              <View className="w-2.5 bg-transparent" />
              <DownvoteButton
                id={answer?.id}
                voted={answer?.relationship?.voting}
                variant="minimal"
              />
            </View>
            <View className="flex-1 flex-row justify-end items-center bg-transparent">
              <Pressable
                className="items-center ml-5 flex-row bg-transparent"
                onPress={() => router.push(`/comments/${id}?type=answer`)}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#888" />
                {answer?.comment_count > 0 && (
                  <Text
                    type="secondary"
                    className="ml-1 text-[13px] font-medium text-[#888]"
                  >
                    {answer?.comment_count}
                  </Text>
                )}
              </Pressable>
              <Pressable
                className="items-center ml-5 flex-row bg-transparent"
                onPress={() => setMenuVisible(true)}
              >
                <Ionicons name="ellipsis-horizontal" size={24} color="#888" />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setMenuVisible(false)}
        >
          <View
            className="rounded-t-[24px] px-5 pt-2.5"
            style={{
              backgroundColor: surfaceColor,
              paddingBottom: insets.bottom + 20,
            }}
          >
            <View className="items-center py-2.5 bg-transparent">
              <View className="w-10 h-1.5 rounded-[3px] bg-[#ddd]" />
            </View>
            <View className="py-2.5 bg-transparent">
              <MenuOption
                icon={isLiked ? 'heart' : 'heart-outline'}
                label={isLiked ? '取消喜欢' : '加入喜欢'}
                color={isLiked ? '#ff4d4f' : undefined}
                onPress={() => {
                  setIsLiked(!isLiked);
                  setMenuVisible(false);
                }}
              />
              <MenuOption
                icon={isCollected ? 'star' : 'star-outline'}
                label={isCollected ? '取消收藏' : '移至收藏'}
                color={isCollected ? '#ffb400' : undefined}
                onPress={() => {
                  collectMutation.mutate();
                  setMenuVisible(false);
                }}
              />
              <MenuOption
                icon="share-social-outline"
                label="分享回答"
                onPress={() => setMenuVisible(false)}
              />
              {answer?.relationship?.is_author && (
                <View className="h-px my-1.5 bg-[rgba(150,150,150,0.15)]" />
              )}
              {answer?.relationship?.is_author && (
                <MenuOption
                  icon="trash-outline"
                  label="删除回答"
                  color="#ff4d4f"
                  onPress={() => {
                    handleDelete();
                    setMenuVisible(false);
                  }}
                />
              )}
            </View>
            <Pressable
              className="py-[18px] mt-2.5 items-center"
              onPress={() => setMenuVisible(false)}
            >
              <Text className="text-base font-bold">取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuOption({ icon, label, onPress, color }: any) {
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme].text;
  return (
    <Pressable
      className="flex-row items-center py-[15px] px-2.5"
      onPress={onPress}
    >
      <View className="w-10 h-10 rounded-[20px] bg-[rgba(150,150,150,0.08)] justify-center items-center mr-[15px]">
        <Ionicons name={icon} size={26} color={color || textColor} />
      </View>
      <Text className="text-base font-medium" style={{ color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
}
