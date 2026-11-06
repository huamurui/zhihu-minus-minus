import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  View as RawView,
  ScrollView,
  type ScrollViewInstance,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recordReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { getPin } from '@/api/zhihu/pin';
import { getContentVoteCount, getContentVoteState } from '@/api/zhihu/voters';
import { ActionIconCount } from '@/components/ActionIconCount';
import { BouncyButton } from '@/components/BouncyButton';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  ContentActionBar,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { ContentActionButton } from '@/components/ContentActionButton';
import { ContentRelationshipNotice } from '@/components/ContentRelationshipNotice';
import { FollowButton } from '@/components/FollowButton';
import { InitialContentReveal } from '@/components/InitialContentReveal';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { PinPollCard } from '@/components/PinPollCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ReadingProgressNotice } from '@/components/ReadingProgressNotice';
import { SegmentedVoteCapsule } from '@/components/SegmentedVoteCapsule';
import { ShareMenu } from '@/components/ShareMenu';
import { RetainedAvatar } from '@/components/StableAvatar';
import { useIsLiquidGlassActive } from '@/components/surfaces/FloatingSurface';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import { useDoubleTapAction } from '@/hooks/useDoubleTapAction';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { usePinActions } from '@/hooks/usePinActions';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuPin } from '@/types/zhihu';
import {
  type ContentDetailPreview,
  getContentDetailPreviewKey,
} from '@/utils/contentDetailPreview';
import { formatDateTime } from '@/utils/date';
import { shouldRetryQuery } from '@/utils/query';

export default function PinDetailScreen() {
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const colorScheme = useColorScheme();
  const useGlass = useIsLiquidGlassActive();
  const { id } = useLocalSearchParams();
  const preview = queryClient.getQueryData<ContentDetailPreview>(
    getContentDetailPreviewKey('pin', String(id ?? ''), sessionVersion),
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actionBarBottom = getContentActionBarBottom(insets.bottom);
  const textColor = Colors[colorScheme].text;
  const backgroundColor = Colors[colorScheme].background;

  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const contentIdentity = `pin:${String(id ?? '')}`;
  const [openMenuIdentity, setOpenMenuIdentity] = React.useState<string | null>(
    null,
  );
  const menuVisible = openMenuIdentity === contentIdentity;

  useEffect(() => {
    setOpenMenuIdentity((opened) =>
      opened === contentIdentity ? opened : null,
    );
  }, [contentIdentity]);
  const scrollViewRef = React.useRef<ScrollViewInstance>(null);

  const {
    data: pin,
    isLoading: isQueryLoading,
    isPending,
    isPaused,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['pin-detail', id],
    queryFn: () => getPin(id as string),
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: shouldRetryQuery,
  });
  const isLoading = isQueryLoading || (isPending && isPaused);
  const pinActions = usePinActions(pin);
  const contentLayoutSource = useMemo(
    () => ({ id: String(id ?? ''), content: pin?.content }),
    [id, pin?.content],
  );
  const [readyLayoutSource, setReadyLayoutSource] = React.useState<
    typeof contentLayoutSource | null
  >(null);
  const latestLayoutSource = React.useRef(contentLayoutSource);
  useLayoutEffect(() => {
    latestLayoutSource.current = contentLayoutSource;
  }, [contentLayoutSource]);
  const handleContentLayoutReady = useCallback(() => {
    if (latestLayoutSource.current === contentLayoutSource) {
      setReadyLayoutSource(contentLayoutSource);
    }
  }, [contentLayoutSource]);

  const readingProgress = useReadingProgress({
    contentKey: `pin:${String(id ?? '')}`,
    enabled: Boolean(id),
    ready: Boolean(pin),
    scrollRef: scrollViewRef,
  });

  const poll = pin?.bottom_poll?.voting;
  const pinVoteCount = getContentVoteCount('pins', pin) ?? 0;
  const pinVoteState = getContentVoteState('pins', pin) ?? 0;
  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && pin?.id) {
      recordReadHistory({ content_token: String(pin.id), content_type: 'pin' });
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

  const previewAuthor = preview?.author;
  const author = pin?.author;
  const sameAuthor =
    !author ||
    (!!author.id && !!previewAuthor?.id && author.id === previewAuthor.id) ||
    (!!author.url_token &&
      !!previewAuthor?.urlToken &&
      author.url_token === previewAuthor.urlToken);
  const authorId = author?.id || (sameAuthor ? previewAuthor?.id : undefined);
  const authorToken =
    author?.url_token ||
    (sameAuthor ? previewAuthor?.urlToken : undefined) ||
    authorId;
  const authorAvatar =
    author?.avatar_url || (sameAuthor ? previewAuthor?.avatarUrl : undefined);
  const authorName =
    author?.name || (sameAuthor ? previewAuthor?.name : undefined);
  const authorHeadline =
    author?.headline ?? (sameAuthor ? previewAuthor?.headline : undefined);
  const avatarOwnerId = sameAuthor
    ? previewAuthor?.id || previewAuthor?.urlToken || authorId || authorToken
    : authorId || authorToken;
  const goToProfile = useCallback(() => {
    const token = authorToken;
    if (token) router.push(`/user/${token}`);
  }, [authorToken, router]);

  const { gesture: doubleTapVote, isDoubleTapEnabled } = useDoubleTapAction({
    id: String(id ?? ''),
    type: 'pins',
    commentType: 'pin',
    voted: pinVoteState,
    count: pinVoteCount,
    enabled: Boolean(id) && Boolean(pin),
  });

  if (isLoading && !pin && !previewAuthor)
    return (
      <View type="default" className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={primaryColor} />
        <Text type="secondary" className="mt-2.5">
          载入想法中...喵
        </Text>
      </View>
    );

  if (!pin && isError)
    return (
      <View type="default" className="flex-1 justify-center items-center px-6">
        <QueryErrorView message="想法加载失败" onRetry={() => void refetch()} />
      </View>
    );

  if (!pin && !isLoading)
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
          headerRight: pin
            ? () => (
                <MoreActionsButton
                  onPress={() => setOpenMenuIdentity(contentIdentity)}
                  style={{ marginRight: useGlass ? 0 : 10 }}
                />
              )
            : undefined,
        }}
      />

      <ShareMenu
        visible={menuVisible}
        onClose={() => setOpenMenuIdentity(null)}
        type="pin"
        additionalOptions={pinActions}
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

      <GestureDetector gesture={doubleTapVote}>
        <RawView collapsable={false} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollViewRef}
            className="flex-1"
            scrollEventThrottle={16}
            onScroll={(event) =>
              readingProgress.onScroll(event.nativeEvent.contentOffset.y)
            }
            onLayout={readingProgress.onLayout}
            onContentSizeChange={readingProgress.onContentSizeChange}
            onScrollEndDrag={readingProgress.commitProgress}
            onMomentumScrollEnd={readingProgress.commitProgress}
            contentContainerStyle={{
              paddingBottom: CONTENT_ACTION_BAR_HEIGHT + 36 + actionBarBottom,
            }}
          >
            {/* 作者信息栏 */}
            <View className="flex-row items-center p-5 justify-between bg-transparent">
              <BouncyButton
                onPress={goToProfile}
                disabled={!authorToken}
                className="flex-row items-center flex-1 bg-transparent"
              >
                <RetainedAvatar
                  uri={authorAvatar}
                  ownerId={avatarOwnerId}
                  className="w-11 h-11 rounded-full"
                />
                <View className="ml-3 flex-1 bg-transparent">
                  <Text className="text-base font-bold">{authorName}</Text>
                  {authorHeadline ? (
                    <Text
                      type="secondary"
                      className="text-[13px] mt-0.5"
                      numberOfLines={1}
                    >
                      {authorHeadline}
                    </Text>
                  ) : null}
                </View>
              </BouncyButton>
              {pin ? (
                <FollowButton
                  following={Boolean(pin.author?.is_following)}
                  loading={followMutation.isPending}
                  disabled={pin.author?.is_following === undefined}
                  onPress={() => followMutation.mutate()}
                />
              ) : (
                <View className="bg-transparent" style={{ width: 64 }} />
              )}
            </View>

            {pin ? (
              <>
                {/* 想法内容 */}
                <View className="px-5 bg-transparent">
                  <ContentRelationshipNotice
                    contentType="pin"
                    contentId={String(id)}
                    voteCount={pinVoteCount}
                  />
                  <InitialContentReveal
                    key={String(id)}
                    ready={readyLayoutSource === contentLayoutSource}
                  >
                    <ZhihuContent
                      suppressDoubleTapSelection={isDoubleTapEnabled}
                      contentArray={pin.content}
                      objectId={id as string}
                      type="pin"
                      onRefresh={refetch}
                      onLayoutReady={handleContentLayoutReady}
                    />
                  </InitialContentReveal>
                </View>
                {poll ? (
                  <RawView className="px-5 bg-transparent">
                    <PinPollCard
                      key={`${id}:${poll.id}`}
                      poll={poll}
                      contentId={String(id)}
                    />
                  </RawView>
                ) : null}
                <Text
                  type="secondary"
                  className="text-[#bbb] text-[13px] mt-[30px] italic pb-5 px-5"
                >
                  发布于 {pin.created
                    ? formatDateTime(pin.created)
                    : '不久前'}{' '}
                </Text>
              </>
            ) : (
              <ActivityIndicator
                size="large"
                color={primaryColor}
                style={{ marginTop: 24 }}
              />
            )}
          </ScrollView>
        </RawView>
      </GestureDetector>

      <ReadingProgressNotice
        visible={readingProgress.restoredOffset !== null}
        onBackToTop={readingProgress.scrollToTop}
        onDismiss={readingProgress.dismissRestoreNotice}
        bottomOffset={
          CONTENT_ACTION_BAR_HEIGHT + 24 + actionBarBottom - insets.bottom
        }
      />

      {/* 底部交互栏 */}
      {pin ? (
        <ContentActionBar
          bottomInset={insets.bottom}
          variant="islands"
          interactiveGlass
          shrinkLeading
          leading={
            <SegmentedVoteCapsule
              id={pin.id}
              count={pinVoteCount}
              voted={pinVoteState}
              type="pins"
              showDownvote={false}
              allowCountShrink
            />
          }
          trailing={
            <View className="flex-row items-center bg-transparent">
              <ContentActionButton
                accessibilityRole="button"
                accessibilityLabel="评论"
                accessibilityValue={{
                  text: `${pin.comment_count ?? 0} 条评论`,
                }}
                style={{
                  width: 44,
                  height: 44,
                  paddingHorizontal: 0,
                  paddingVertical: 0,
                }}
                onPress={() => router.push(`/comments/${id}?type=pin`)}
              >
                <ActionIconCount
                  count={pin.comment_count > 0 ? pin.comment_count : undefined}
                >
                  <ThemedIcon
                    name="chatbubble-outline"
                    size={20}
                    colorType="secondary"
                  />
                </ActionIconCount>
              </ContentActionButton>
              <MoreActionsButton
                onPress={() => setOpenMenuIdentity(contentIdentity)}
              />
            </View>
          }
        />
      ) : null}
    </View>
  );
}
