import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, {
  Extrapolate,
  interpolate,
  SharedTransition,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '@/api/client';
import { getAnswer } from '@/api/zhihu';
import { addReadHistory } from '@/api/zhihu/history';
import { AnswerDetailView } from '@/components/AnswerDetailView';
import { BouncyButton } from '@/components/BouncyButton';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  getNeighborAnswerIds,
  RICH_CONTENT_STALE_TIME,
} from '@/features/rich-content';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { useSettingsStore } from '@/store/useSettingsStore';

const slowTransition = SharedTransition.duration(600);

export default function AnswerDetailScreen() {
  const {
    id,
    title: initialTitle,
    questionId: propQuestionId,
    sortBy = 'default',
  } = useLocalSearchParams<{
    id: string;
    title?: string;
    questionId?: string;
    sortBy?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme].text;
  const primaryColor = useThemeColor({}, 'primary');

  // 锁定初始 ID，避免滑动时 URL 参数改变导致重新触发 top-level loading
  const [initialId] = useState(id as string);

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  const recordedIds = useRef(new Set<string>());

  useEffect(() => {
    if (enableBrowseHistory && initialId) {
      addReadHistory({ content_token: initialId, content_type: 'answer' });
      recordedIds.current.add(initialId);
    }
  }, [enableBrowseHistory, initialId]);

  // 1. 获取当前回答的基础信息（主要是为了拿到 questionId）
  const { data: initialAnswer, isLoading: loadingInitial } = useQuery({
    queryKey: ['answer-detail', initialId],
    queryFn: () => getAnswer(initialId),
    enabled: !!initialId,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err: any) =>
      err?.response?.status === 404 ? false : failureCount < 2,
  });

  const questionId = propQuestionId || initialAnswer?.question?.id;

  // 2. 获取该问题下的所有回答列表
  const {
    data: answersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useZhihuInfiniteQuery({
    queryKey: ['question-answers', questionId, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const include = 'data[*].id'; // 我们只需要 ID 来构建 Pager
      const res = await client.get(
        `/questions/${questionId}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`,
      );
      return res.data;
    },
    initialPageParam: 0,
    enabled: !!questionId,
  });

  // 3. 构建 ID 列表
  const answerIds = useMemo(() => {
    const listIds: string[] =
      answersData?.pages
        .flatMap((p: any) => p.data)
        .map((i: any) => i.id.toString()) || [];

    let combined = listIds;
    // 确保初始 ID 在列表中
    if (initialId && !listIds.includes(initialId)) {
      combined = [initialId, ...listIds];
    }

    // 使用 Set 去重
    return Array.from(new Set(combined));
  }, [answersData, initialId]);

  const initialPage = useMemo(() => {
    const index = answerIds.indexOf(initialId);
    return index >= 0 ? index : 0;
  }, [answerIds, initialId]);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isSharing, setIsSharing] = useState(false);
  const [shareData, setShareData] = useState<{
    id: string;
    title?: string;
    author?: string;
    authorHeadline?: string;
    url: string;
  } | null>(null);

  // Keep the pager header animation on the UI thread while preserving the
  // per-answer scroll position in JS for pager navigation.
  const scrollY = useSharedValue(0);
  const scrollPositions = useRef<{ [key: string]: number }>({});
  const isCollapsedRef = useRef(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 80], [1, 0], Extrapolate.CLAMP),
  }));
  const headerContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 80], [1, 0], Extrapolate.CLAMP),
  }));

  // 4. 这里的关键是：PagerView 在 Android 下如果动态改变 children 且没有重置 key，可能会导致页面错乱。
  // 但重置 key 又会导致 WebView 重新加载。
  // 我们使用一个更稳定的 key，仅在数据从“单条”变为“多条”时重置一次。
  const [pagerReady, setPagerReady] = useState(false);
  useEffect(() => {
    if (answerIds.length > 1 && !pagerReady) {
      setCurrentPage(initialPage);
      setPagerReady(true);
    }
  }, [answerIds.length, initialPage, pagerReady]);

  const pagerKey = `pager-${questionId}-${pagerReady ? 'ready' : 'pending'}`;

  const currentId = answerIds[currentPage];

  useEffect(() => {
    if (!pagerReady) return;

    const idleCallbackId = requestIdleCallback(
      () => {
        const neighborIds = getNeighborAnswerIds(answerIds, currentPage);

        for (const answerId of neighborIds) {
          void queryClient.prefetchQuery({
            queryKey: ['answer-detail', answerId],
            queryFn: () => getAnswer(answerId),
            staleTime: RICH_CONTENT_STALE_TIME,
          });
        }
      },
      { timeout: 1500 },
    );

    return () => cancelIdleCallback(idleCallbackId);
  }, [answerIds, currentPage, pagerReady, queryClient]);

  useEffect(() => {
    if (
      enableBrowseHistory &&
      currentId &&
      !recordedIds.current.has(currentId)
    ) {
      addReadHistory({ content_token: currentId, content_type: 'answer' });
      recordedIds.current.add(currentId);
    }
  }, [enableBrowseHistory, currentId]);

  const handleShareClick = () => {
    if (!currentId) return;
    const cachedAnswer = queryClient.getQueryData<any>([
      'answer-detail',
      currentId,
    ]);
    const actualQid = cachedAnswer?.question?.id || questionId;
    const url = `https://www.zhihu.com/question/${actualQid}/answer/${currentId}`;

    setShareData({
      id: currentId,
      title:
        cachedAnswer?.question?.title ||
        initialAnswer?.question?.title ||
        (initialTitle as string),
      author: cachedAnswer?.author?.name,
      authorHeadline: cachedAnswer?.author?.headline,
      url,
    });
    setIsSharing(true);
  };

  if (loadingInitial && !initialAnswer) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator color={primaryColor} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header Bar */}
      <View
        className="flex-row items-start px-2.5 absolute left-0 right-0 z-50"
        style={{
          top: 0,
          paddingTop: insets.top + 8,
          minHeight: 44 + insets.top + 8,
          paddingBottom: 8,
          backgroundColor: 'transparent',
        }}
        pointerEvents="box-none"
      >
        {/* Background (Animates to transparent on scroll) */}
        <Reanimated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(0,0,0,0.6)'
                  : 'rgba(255,255,255,0.6)',
            },
            headerBgStyle,
          ]}
          pointerEvents="none"
        />

        {/* 返回按钮 (Always Visible) */}
        <BouncyButton
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center z-50 rounded-full"
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </BouncyButton>

        {/* 可折叠/淡出的内容区域 (标题和分享按钮) */}
        <Reanimated.View
          className="flex-1 flex-row items-start"
          style={headerContentStyle}
          pointerEvents={isHeaderCollapsed ? 'none' : 'auto'}
        >
          {/* 标题区域 */}
          <BouncyButton
            className="flex-1 mx-2"
            onPress={() =>
              router.push(
                `/question/${initialAnswer?.question?.id || questionId}`,
              )
            }
            style={{ paddingTop: 8 }}
          >
            <Reanimated.View
              sharedTransitionTag={`title-${questionId || id}`}
              sharedTransitionStyle={slowTransition}
              className="bg-transparent"
            >
              <Text
                className="text-[18px] font-bold leading-6"
                numberOfLines={2}
              >
                {initialAnswer?.question?.title ||
                  (initialTitle as string) ||
                  '加载中...'}
              </Text>
            </Reanimated.View>
          </BouncyButton>

          {/* 分享按钮 */}
          <BouncyButton
            onPress={handleShareClick}
            className="w-10 h-10 justify-center items-center rounded-full"
          >
            <Ionicons name="share-outline" size={24} color={textColor} />
          </BouncyButton>
        </Reanimated.View>
      </View>

      <PagerView
        key={pagerKey}
        style={{ flex: 1 }}
        initialPage={initialPage}
        offscreenPageLimit={1}
        onPageSelected={(e) => {
          const newIndex = e.nativeEvent.position;
          setCurrentPage(newIndex);
          const newId = answerIds[newIndex];
          if (newId) {
            router.setParams({ id: newId });

            // Sync scroll position
            const lastY = scrollPositions.current[newId] || 0;
            scrollY.value = lastY;

            const shouldCollapse = lastY > 80;
            isCollapsedRef.current = shouldCollapse;
            setIsHeaderCollapsed(shouldCollapse);
          }

          // 如果滑到了最后几个，预加载下一页 ID
          if (
            newIndex >= answerIds.length - 3 &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            fetchNextPage();
          }
        }}
      >
        {answerIds.map((aid, index) => (
          <View key={aid} className="flex-1">
            <AnswerDetailView
              id={aid}
              initialTitle={aid === id ? (initialTitle as string) : undefined}
              questionId={questionId as string}
              isFocused={index === currentPage}
              scrollY={scrollY}
              onScroll={(y) => {
                scrollPositions.current[aid] = y;
                if (index === currentPage) {
                  const shouldCollapse = y > 80;
                  if (shouldCollapse !== isCollapsedRef.current) {
                    isCollapsedRef.current = shouldCollapse;
                    setIsHeaderCollapsed(shouldCollapse);
                  }
                }
              }}
            />
          </View>
        ))}
      </PagerView>

      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="answer"
        data={shareData}
      />
    </View>
  );
}
