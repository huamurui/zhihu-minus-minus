import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View as NativeView,
  Alert,
} from 'react-native';
import Reanimated, { SharedTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

import client from '@/api/client';
import { deleteAnswer } from '@/api/zhihu/answer';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import {
  followQuestion,
  getQuestion,
  unfollowQuestion,
} from '@/api/zhihu/question';
import { LikeButton } from '@/components/LikeButton';
import { Text, View } from '@/components/Themed';
import { ZhihuContent } from '@/components/ZhihuContent';
import { showToast } from '@/utils/toast';

const AnswerItem = forwardRef(
  (
    {
      item,
      isExpanded,
      onToggle,
    }: {
      item: any;
      isExpanded: boolean;
      onToggle: (id: string, expanded: boolean) => void;
    },
    ref,
  ) => {
    const colorScheme = useColorScheme();
    const router = useRouter();
    const textColor = Colors[colorScheme].text;
    const queryClient = useQueryClient();
    const footerRef = useRef<NativeView>(null);

    useImperativeHandle(ref, () => ({
      measureFooter: (cb: any) => footerRef.current?.measureInWindow(cb),
      id: item.id.toString(),
    }));

    const rawText = item.content?.replace(/<[^>]+>/g, '') || '';
    const isLongContent = rawText?.length > 120;
    const excerpt = isLongContent ? rawText.substring(0, 100) + '...' : rawText;

    const followMutation = useMutation({
      mutationFn: async () => {
        const pid = item.author.url_token || item.author.id;
        if (item.author?.is_following) return unfollowMember(pid);
        return followMember(pid);
      },
      onSuccess: () => {
        showToast(item.author?.is_following ? '已取消关注' : '已关注');
        queryClient.invalidateQueries({ queryKey: ['question-answers'] });
      },
    });

    const deleteMutation = useMutation({
      mutationFn: () => deleteAnswer(item.id),
      onSuccess: () => {
        Alert.alert('删除成功', '你的回答已删除喵！');
        queryClient.invalidateQueries({ queryKey: ['question-answers'] });
      },
    });

    const handleDelete = () => {
      Alert.alert('确认删除', '确定要删除这个回答吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]);
    };

    return (
      <View type="surface" className="p-[15px] mb-1.5">
        <View className="flex-row items-center mb-3 bg-transparent">
          <Pressable
            onPress={() =>
              item.author?.url_token &&
              router.push(`/user/${item.author.url_token}`)
            }
            className="flex-row flex-1 items-center bg-transparent"
          >
            <Image
              source={{ uri: item.author?.avatar_url }}
              className="w-[34px] h-[34px] rounded-[17px]"
            />
            <View className="flex-1 ml-2.5 bg-transparent">
              <Text className="text-[15px] font-bold">{item.author?.name}</Text>
              <Text
                type="secondary"
                className="text-xs mt-0.5"
                numberOfLines={1}
              >
                {item.author?.headline}
              </Text>
            </View>
          </Pressable>
          {!item.relationship?.is_author && (
            <Pressable
              className="px-3 py-1.5 rounded-[15px]"
              style={[
                !item.author?.is_following && {
                  backgroundColor: 'rgba(0,132,255,0.08)',
                },
                item.author?.is_following && {
                  backgroundColor: 'transparent',
                  borderColor: Colors[colorScheme].border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => followMutation.mutate()}
            >
              <Text
                className="text-[13px] font-bold"
                style={[
                  item.author?.is_following
                    ? { color: Colors[colorScheme].textSecondary }
                    : { color: '#0084ff' },
                ]}
              >
                {item.author?.is_following ? '已关注' : '关注'}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="my-1 bg-transparent">
          {isExpanded ? (
            <View className="flex-1 bg-transparent">
              <ZhihuContent
                objectId={item.id}
                type="answer"
                content={item.content}
                segmentInfos={item.segment_infos}
              />
              {isLongContent && (
                <Pressable
                  onPress={() => onToggle(item.id.toString(), false)}
                  className="flex-row items-center justify-center py-2.5 mt-1 bg-transparent"
                >
                  <Text
                    type="primary"
                    className="text-[13px] font-bold mr-1"
                    style={{ color: '#0084ff' }}
                  >
                    收起回答
                  </Text>
                  <Ionicons
                    name="chevron-up"
                    size={14}
                    color={Colors[colorScheme].primary}
                  />
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable
              onPress={() => onToggle(item.id.toString(), true)}
              className="flex-row flex-1"
            >
              <Text
                className="text-[15px] leading-6 flex-1"
                style={{ color: textColor }}
              >
                {excerpt}
                {isLongContent && (
                  <Text
                    type="primary"
                    className="font-medium"
                    style={{ color: '#0084ff' }}
                  >
                    {' '}
                    阅读全文
                  </Text>
                )}
              </Text>
              {item.thumbnail || item.content_img?.length > 0 ? (
                <Image
                  source={{ uri: item.thumbnail || item.content_img[0] }}
                  className="w-20 h-[60px] rounded ml-3"
                  resizeMode="cover"
                />
              ) : null}
            </Pressable>
          )}
        </View>

        <NativeView
          ref={footerRef}
          className="flex-row items-center mt-3 pt-2.5 px-1"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: Colors[colorScheme].border,
          }}
        >
          <View className="flex-row items-center bg-transparent">
            <LikeButton
              id={item.id}
              count={item.voteup_count}
              voted={item.relationship?.voting}
              type="answers"
              variant="minimal"
            />
          </View>
          <Pressable
            className="flex-row items-center ml-[25px]"
            onPress={() =>
              router.push({
                pathname: '/comments/[id]',
                params: {
                  id: item.id,
                  type: 'answer',
                  count: item.comment_count,
                },
              } as any)
            }
          >
            <Ionicons
              name="chatbubble-outline"
              size={18}
              color={Colors[colorScheme].textSecondary}
            />
            <Text type="secondary" className="ml-1 text-[13px] text-[#888]">
              {item.comment_count}
            </Text>
          </Pressable>
          {item.relationship?.is_author && (
            <Pressable className="ml-5 p-1" onPress={handleDelete}>
              <Ionicons
                name="trash-outline"
                size={18}
                color={Colors[colorScheme].danger}
              />
            </Pressable>
          )}
          <Ionicons
            name="share-social-outline"
            size={18}
            color={Colors[colorScheme].textSecondary}
            style={{ marginLeft: 'auto' }}
          />
        </NativeView>
      </View>
    );
  },
);

const slowTransition = SharedTransition.duration(600);

export default function QuestionDetail() {
  const { id, title: initialTitle } = useLocalSearchParams<{
    id: string;
    title?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;
  const queryClient = useQueryClient();
  const { height: screenHeight } = useWindowDimensions();

  const [sortBy, setSortBy] = useState<'default' | 'created'>('default');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<any>(null);

  const footerAnim = useRef(new Animated.Value(0)).current;
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);
  const isFloatingShown = useRef(false);

  const itemRefs = useRef(new Map<string, any>());
  const viewableIdsRef = useRef<string[]>([]);

  const toggleExpand = useCallback((id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 20,
  }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: any) => {
      viewableIdsRef.current = viewableItems.map((v: any) =>
        v.item.id.toString(),
      );
      const candidate = viewableItems[0]?.item;
      if (candidate && candidate.id !== activeItem?.id)
        setActiveItem(candidate);
    },
    [activeItem],
  );

  const lastCheckTime = useRef(0);

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const now = Date.now();

    if (currentY > 400) {
      const diff = currentY - (event.lastY || 0);
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
    event.lastY = currentY;

    if (now - lastCheckTime.current > 100) {
      lastCheckTime.current = now;
      const currentViewableIds = viewableIdsRef.current;
      let anyFooterVisible = false;
      const promises: Promise<boolean>[] = [];

      currentViewableIds.forEach((id) => {
        const ref = itemRefs.current.get(id);
        if (ref) {
          promises.push(
            new Promise((resolve) => {
              ref.measureFooter(
                (x: number, y: number, w: number, h: number) => {
                  const isVisible =
                    y > insets.top + 40 && y < screenHeight - 40;
                  resolve(isVisible);
                },
              );
            }),
          );
        }
      });

      Promise.all(promises).then((results) => {
        anyFooterVisible = results.some((r) => r === true);
        const shouldShow =
          !anyFooterVisible &&
          activeItem &&
          expandedIds.has(activeItem.id.toString()) &&
          currentY > 300;

        if (shouldShow !== isFloatingShown.current) {
          isFloatingShown.current = shouldShow;
          Animated.spring(footerAnim, {
            toValue: shouldShow ? 1 : 0,
            useNativeDriver: true,
            friction: 10,
            tension: 50,
          }).start();
        }
      });
    }
  };

  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => await getQuestion(id as string),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (question?.relationship?.is_following)
        return unfollowQuestion(id as string);
      return followQuestion(id as string);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['question', id] });
      const previous = queryClient.getQueryData(['question', id]);
      queryClient.setQueryData(['question', id], (old: any) => ({
        ...old,
        relationship: {
          ...old?.relationship,
          is_following: !old?.relationship?.is_following,
        },
        follower_count: old?.relationship?.is_following
          ? old.follower_count - 1
          : old.follower_count + 1,
      }));
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['question', id], context.previous);
      }
      showToast('操作失败，请稍后重试');
    },
    onSuccess: () => {
      showToast(question?.relationship?.is_following ? '已取消关注' : '已关注问题');
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['question', id] }),
  });

  const {
    data: answersData,
    isLoading: aLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['question-answers', id, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const include =
        'data[*].content,voteup_count,comment_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time,segment_infos';
      const res = await client.get(
        `/questions/${id}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`,
      );
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      if (!last || last.paging?.is_end) return undefined;
      const match = last.paging?.next?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const answers = useMemo(
    () => answersData?.pages.flatMap((p) => p.data) || [],
    [answersData],
  );

  const renderHeader = useMemo(
    () => (
      <View
        type="surface"
        className="p-5 mb-2"
        style={{ paddingTop: insets.top + 50 }}
      >
        <Reanimated.View
          sharedTransitionTag={`title-${id}`}
          sharedTransitionStyle={slowTransition}
          className="bg-transparent"
        >
          <Text className="text-[21px] font-bold leading-7">
            {question?.title || initialTitle || '加载中...'}
          </Text>
        </Reanimated.View>
        {qLoading ? (
          <View className="h-[100px] justify-center bg-transparent">
            <ActivityIndicator
              size="small"
              color={Colors[colorScheme].primary}
            />
          </View>
        ) : (
          <>
            {question?.topics && (
              <View className="flex-row flex-wrap mb-2.5 mt-2 bg-transparent">
                {question.topics.map((t: any) => (
                  <View
                    key={t.id}
                    className="px-2.5 py-1 rounded-[15px] mr-2 mb-1"
                    style={{ backgroundColor: 'rgba(0,132,255,0.1)' }}
                  >
                    <Text className="text-xs text-[#0084ff]">{t.name}</Text>
                  </View>
                ))}
              </View>
            )}
            {question?.excerpt && (
              <Text type="secondary" className="mt-2.5 text-sm leading-5">
                {question.excerpt.replace(/<[^>]+>/g, '')}
              </Text>
            )}
            <View className="mt-3 bg-transparent">
              <Text type="secondary" className="text-[13px]">
                {question?.follower_count || 0} 关注 ·{' '}
                {question?.visit_count || 0} 浏览
              </Text>
            </View>
            <View className="flex-row mt-[15px] gap-2.5 bg-transparent">
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={[
                  { backgroundColor: 'rgba(0,132,255,0.05)' },
                  question?.relationship?.is_following && {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: Colors[colorScheme].border,
                  },
                ]}
                onPress={() => followMutation.mutate()}
              >
                <Text
                  className="text-sm font-medium"
                  style={[
                    question?.relationship?.is_following
                      ? { color: Colors[colorScheme].textSecondary }
                      : { color: '#0084ff' },
                  ]}
                >
                  {question?.relationship?.is_following ? '已关注' : '关注问题'}
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={{ backgroundColor: 'rgba(0,132,255,0.05)' }}
                onPress={() =>
                  router.push({
                    pathname: '/comments/[id]',
                    params: {
                      id,
                      type: 'question',
                      count: question?.comment_count || 0,
                    },
                  } as any)
                }
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: '#0084ff' }}
                >
                  {question?.comment_count || 0} 条评论
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={{ backgroundColor: 'rgba(0,132,255,0.05)' }}
                onPress={() => router.push(`/question/write/${id}`)}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: '#0084ff' }}
                >
                  写回答
                </Text>
              </Pressable>
            </View>
            <View className="mt-[15px] pt-3 flex-row justify-between items-center bg-transparent">
              <Text className="font-medium text-[15px]">
                {question?.answer_count || 0} 个回答
              </Text>
              <View className="flex-row items-center bg-transparent">
                <Pressable
                  onPress={() => setSortBy('default')}
                  className="ml-[15px] px-1 py-0.5"
                  style={[
                    sortBy === 'default' && {
                      borderBottomWidth: 2,
                      borderBottomColor: Colors[colorScheme].primary,
                    },
                  ]}
                >
                  <Text
                    type={sortBy === 'default' ? 'primary' : 'secondary'}
                    className="text-[13px]"
                    style={[sortBy === 'default' && { fontWeight: 'bold' }]}
                  >
                    默认
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSortBy('created')}
                  className="ml-[15px] px-1 py-0.5"
                  style={[
                    sortBy === 'created' && {
                      borderBottomWidth: 2,
                      borderBottomColor: Colors[colorScheme].primary,
                    },
                  ]}
                >
                  <Text
                    type={sortBy === 'created' ? 'primary' : 'secondary'}
                    className="text-[13px]"
                    style={[sortBy === 'created' && { fontWeight: 'bold' }]}
                  >
                    时间
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    ),
    [
      qLoading,
      question,
      id,
      initialTitle,
      insets.top,
      sortBy,
      followMutation.isPending,
      colorScheme,
    ],
  );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* 顶部标题栏 */}
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
        <View className="h-[50px] flex-row items-center justify-center px-[15px] bg-transparent">
          <Text
            className="flex-1 text-base font-bold text-center"
            numberOfLines={1}
          >
            {question?.title || initialTitle}
          </Text>
        </View>
      </Animated.View>

      {/* 返回按钮 */}
      <Pressable
        onPress={() => router.back()}
        className="absolute left-2.5 z-[100] w-10 h-10 justify-center items-center"
        style={{ top: insets.top + 8 }}
      >
        <Ionicons name="chevron-back" size={28} color={textColor} />
      </Pressable>

      <FlashList
        onScroll={handleScroll}
        data={qLoading ? [] : answers}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <AnswerItem
            ref={(r) => {
              r
                ? itemRefs.current.set(item.id.toString(), r)
                : itemRefs.current.delete(item.id.toString());
            }}
            item={item}
            isExpanded={expandedIds.has(item.id.toString())}
            onToggle={toggleExpand}
          />
        )}
        keyExtractor={(item: any) => item.id.toString()}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() =>
          hasNextPage && !isFetchingNextPage && fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator
              style={{ marginVertical: 20 }}
              color={Colors[colorScheme].primary}
            />
          ) : answers?.length > 0 && !hasNextPage ? (
            <Text type="secondary" className="text-center my-5">
              — 没有更多回答了 —
            </Text>
          ) : null
        }
        onRefresh={refetch}
        refreshing={isRefetching}
      />

      <Animated.View
        className="absolute left-5 right-5 h-[54px] rounded-[27px] overflow-hidden z-[1000] shadow-black/20 shadow-lg elevation-10"
        style={[
          {
            bottom: insets.bottom + 15,
            transform: [
              {
                translateY: footerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [100, 0],
                }),
              },
            ],
            opacity: footerAnim,
          },
        ]}
      >
        <BlurView
          intensity={95}
          tint={colorScheme}
          className="flex-1"
          style={{
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(26,26,26,0.8)'
                : 'rgba(255,255,255,0.85)',
          }}
        >
          <View className="flex-1 flex-row items-center px-5 justify-between bg-transparent">
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={activeItem?.id}
                count={activeItem?.voteup_count || 0}
                voted={activeItem?.relationship?.voting}
                type="answers"
                variant="ghost"
              />
              <Pressable
                className="flex-row items-center ml-5 bg-transparent"
                onPress={() =>
                  router.push({
                    pathname: '/comments/[id]',
                    params: {
                      id: activeItem?.id,
                      type: 'answer',
                      count: activeItem?.comment_count,
                    },
                  } as any)
                }
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={Colors[colorScheme].primary}
                />
                <Text
                  type="primary"
                  className="ml-1.5 font-semibold text-sm"
                  style={{ color: '#0084ff' }}
                >
                  {activeItem?.comment_count || 0}
                </Text>
              </Pressable>
            </View>
            <View
              className="w-px h-5 mx-2.5"
              style={{
                backgroundColor: Colors[colorScheme].primaryTransparent,
              }}
            />
            <Pressable
              className="flex-row items-center bg-transparent"
              onPress={() =>
                activeItem && toggleExpand(activeItem.id.toString(), false)
              }
            >
              <Text
                type="primary"
                className="text-sm font-bold mr-1"
                style={{ color: '#0084ff' }}
              >
                收起回答
              </Text>
              <Ionicons
                name="chevron-up"
                size={16}
                color={Colors[colorScheme].primary}
              />
            </Pressable>
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}
