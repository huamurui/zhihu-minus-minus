import { FlashList } from '@shopify/flash-list';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View as NativeView,
  StyleSheet,
  type TextInputInstance,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type CommentItem,
  type CommentResourceType,
  createCommentReply,
  createCommentV5,
  deleteComment,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CommentActionSheet } from '@/components/CommentActionSheet';
import {
  CommentComposer,
  type CommentDraft,
} from '@/components/CommentComposer';
import { CommentContent } from '@/components/CommentContent';
import { CommentIdentityBadges } from '@/components/CommentIdentityBadges';
import { LikeButton } from '@/components/LikeButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { usePaneDimensions } from '@/features/adaptive-layout/PaneContext';
import { useCommentKeyboardLayout } from '@/hooks/useCommentKeyboardLayout';
import { useCommentRepliesQuery } from '@/hooks/useCommentQueries';
import { useListPreload } from '@/hooks/useListPreload';
import { useParentComment } from '@/hooks/useParentComment';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { formatDate } from '@/utils/date';
import { buildZhihuContent, buildZhihuImageHtml } from '@/utils/zhihuContent';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function ReplyDetailScreen() {
  const { id, parent, resourceId, resourceType } = useLocalSearchParams<{
    id: string;
    parent?: string;
    resourceId?: string;
    resourceType?: string;
  }>();
  const [inputText, setInputText] = useState('');
  const listPreload = useListPreload(0.3);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [commentAction, setCommentAction] = useState<{
    id: string | number;
    htmlContent: string;
    authorName: string;
    canDelete: boolean;
    returnToParent: boolean;
    sessionVersion: number;
  } | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const textColor = Colors[colorScheme].text;
  const tintColor = useThemeColor({}, 'link');
  const { width: paneWidth } = usePaneDimensions();
  // 减去头像(32) + 间距(12) + 左右padding(30)
  const contentWidth = paneWidth - 32 - 12 - 30;
  const insets = _insets;
  const v5ResourceType: CommentResourceType | null =
    resourceType === 'answers' ||
    resourceType === 'questions' ||
    resourceType === 'articles' ||
    resourceType === 'pins'
      ? resourceType
      : null;

  const { containerRef, onContainerLayout, inputBarAnimatedStyle } =
    useCommentKeyboardLayout(insets.bottom);

  const [inputBarHeight, setInputBarHeight] = useState(80 + insets.bottom);

  const { parentComment, sessionVersion } = useParentComment(id, parent);
  const activeCommentAction =
    commentAction?.sessionVersion === sessionVersion ? commentAction : null;

  const {
    data: repliesData,
    comments: replies,
    isLoading,
    isError,
    isFetchNextPageError,
    refetch,
    refresh,
    refreshing,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCommentRepliesQuery(id);

  const totalCount =
    repliesData?.pages?.[0]?.counts?.total_counts ??
    parentComment?.child_comment_count ??
    0;

  const mutation = useMutation({
    mutationFn: async ({ text: commentText, images }: CommentDraft) => {
      const imageHtml = images.map(buildZhihuImageHtml).join('<br/>');
      const content = buildZhihuContent(commentText, imageHtml);
      if (resourceId && v5ResourceType) {
        return createCommentV5(
          v5ResourceType,
          resourceId,
          content,
          replyTo?.id || id,
        );
      }
      return createCommentReply(
        id as string,
        content,
        replyTo ? { reply_to_comment_id: replyTo.id } : {},
      );
    },
    onSuccess: () => {
      Alert.alert('发布成功喵！');
      setInputText('');
      setReplyTo(null);
      refetch();
    },
    onError: (err: unknown) =>
      Alert.alert('发布失败', getZhihuErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      commentId,
      returnToParent,
    }: {
      commentId: string | number;
      returnToParent: boolean;
    }) => {
      const response = await deleteComment(commentId);
      if (!response.success) throw new Error('知乎未确认评论删除成功');
      return { response, returnToParent };
    },
    onSuccess: ({ returnToParent }) => {
      setCommentAction(null);
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
      if (returnToParent) {
        // Remove this deleted thread without popping a newer visible list page.
        const target = navigation.getState()?.key;
        if (target) navigation.dispatch({ type: 'GO_BACK', target });
      } else {
        void refetch();
      }
      Alert.alert('删除成功', '评论已删除喵！');
    },
    onError: (err: unknown) =>
      Alert.alert('删除失败', getZhihuErrorMessage(err)),
  });

  const submitComment = async (draft: CommentDraft) => {
    await mutation.mutateAsync(draft);
  };

  const goToProfile = (urlToken: string | number) => {
    if (urlToken) router.push(`/user/${urlToken}`);
  };

  const canDeleteComment = (item: CommentItem) =>
    item.can_delete === true || item.allow_delete === true;

  const requestDelete = (
    commentId: string | number,
    returnToParent = false,
  ) => {
    if (sessionVersion !== getAuthSessionVersion()) return;
    Alert.alert('确认删除', '确定要删除这条评论吗？此操作不可撤销喵。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (sessionVersion !== getAuthSessionVersion()) return;
          deleteMutation.mutate({ commentId, returnToParent });
        },
      },
    ]);
  };

  const handleLongPressComment = (
    item: CommentItem,
    returnToParent = false,
  ) => {
    setCommentAction({
      id: item.id,
      htmlContent: item.content,
      authorName: item.author.member.name,
      canDelete: canDeleteComment(item),
      returnToParent,
      sessionVersion,
    });
  };

  const renderReply = ({ item }: { item: CommentItem }) => {
    return (
      <BouncyButton
        accessible={false}
        onLongPress={() => handleLongPressComment(item)}
        delayLongPress={400}
        style={{
          borderRadius: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <View className="flex-row p-[15px] bg-transparent">
          <BouncyButton
            onPress={() =>
              goToProfile(item.author.member.url_token || item.author.member.id)
            }
            style={{ borderRadius: 16 }}
          >
            <StableAvatar
              uri={item.author.member.avatar_url}
              className="w-8 h-8 rounded-full"
            />
          </BouncyButton>
          <View type="secondary" className="flex-1 ml-3 bg-transparent">
            <Text className="font-semibold text-[13px] mb-1">
              <Text
                onPress={() =>
                  goToProfile(
                    item.author.member.url_token || item.author.member.id,
                  )
                }
              >
                {item.author.member.name}
                <CommentIdentityBadges comment={item} />
              </Text>
              {item.reply_to_author && (
                <Text type="secondary">
                  {' '}
                  回复{' '}
                  <Text
                    type="primary"
                    onPress={() =>
                      goToProfile(
                        item.reply_to_author?.member.url_token ||
                          item.reply_to_author?.member.id ||
                          0,
                      )
                    }
                  >
                    {item.reply_to_author?.member.name}
                    <CommentIdentityBadges comment={item} target="reply" />
                  </Text>
                </Text>
              )}
            </Text>
            <View className="mt-1 bg-transparent">
              <CommentContent htmlContent={item.content} width={contentWidth} />
            </View>

            <View className="flex-row justify-between items-center bg-transparent">
              <Text
                style={{
                  fontSize: 12,
                  color: Colors[colorScheme].textSecondary,
                  opacity: 0.65,
                }}
              >
                {[
                  item.created_time ? formatDate(item.created_time) : null,
                  item.address_text ? item.address_text : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
              <View className="flex-row items-center bg-transparent">
                <LikeButton
                  id={item.id}
                  count={item.vote_count || 0}
                  voted={item.relationship?.voting || 0}
                  type="comments"
                  variant="ghost"
                />
                <BouncyButton
                  disabled={mutation.isPending}
                  onPress={() => {
                    setReplyTo({
                      id: item.id as string,
                      name: item.author.member.name,
                    });
                    inputRef.current?.focus();
                  }}
                  style={{ marginLeft: 15, borderRadius: 4 }}
                >
                  <Text type="secondary" className="text-xs font-medium py-1">
                    回复
                  </Text>
                </BouncyButton>
                {canDeleteComment(item) && (
                  <BouncyButton
                    disabled={deleteMutation.isPending}
                    onPress={() => requestDelete(item.id)}
                    style={{ marginLeft: 15, borderRadius: 4 }}
                  >
                    <Text
                      className="text-xs font-medium py-1"
                      style={{ color: Colors[colorScheme].danger }}
                    >
                      删除
                    </Text>
                  </BouncyButton>
                )}
              </View>
            </View>
          </View>
        </View>
      </BouncyButton>
    );
  };

  const renderHeader = () => {
    if (!parentComment) return null;
    return (
      <View
        key={sessionVersion}
        style={{
          borderBottomWidth: 8,
          borderBottomColor: colorScheme === 'dark' ? '#1A1A1A' : '#F5F5F5',
        }}
      >
        <BouncyButton
          accessible={false}
          className="flex-row p-[15px] bg-transparent"
          style={{ borderRadius: 0 }}
          onLongPress={() => handleLongPressComment(parentComment, true)}
          delayLongPress={400}
        >
          <BouncyButton
            onPress={() =>
              goToProfile(
                parentComment.author.member.url_token ||
                  parentComment.author.member.id,
              )
            }
            style={{ borderRadius: 18 }}
          >
            <StableAvatar
              uri={parentComment.author.member.avatar_url}
              className="w-8 h-8 rounded-full"
            />
          </BouncyButton>
          <View className="flex-1 ml-3 bg-transparent">
            <View className="flex-row items-center mb-1">
              <Text
                className="font-semibold text-sm mr-2"
                onPress={() =>
                  goToProfile(
                    parentComment.author.member.url_token ||
                      parentComment.author.member.id,
                  )
                }
              >
                {parentComment.author.member.name}
                <CommentIdentityBadges comment={parentComment} />
              </Text>
            </View>
            <View className="mt-1 bg-transparent">
              <CommentContent
                htmlContent={parentComment.content}
                width={contentWidth}
              />
            </View>

            <View className="flex-row justify-between items-center bg-transparent">
              <Text
                style={{
                  fontSize: 12,
                  color: Colors[colorScheme].textSecondary,
                  opacity: 0.65,
                }}
              >
                {[
                  parentComment.created_time
                    ? formatDate(parentComment.created_time)
                    : null,
                  parentComment.address_text
                    ? parentComment.address_text
                    : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
              <View className="flex-row items-center">
                <LikeButton
                  id={parentComment.id}
                  count={parentComment.vote_count || 0}
                  voted={parentComment.relationship?.voting || 0}
                  type="comments"
                  variant="ghost"
                />
                <BouncyButton
                  disabled={mutation.isPending}
                  onPress={() => {
                    setReplyTo({
                      id: parentComment.id as string,
                      name: parentComment.author.member.name,
                    });
                    inputRef.current?.focus();
                  }}
                  style={{ marginLeft: 15, borderRadius: 4 }}
                >
                  <Text type="secondary" className="text-xs font-medium py-1">
                    回复
                  </Text>
                </BouncyButton>
                {canDeleteComment(parentComment) && (
                  <BouncyButton
                    disabled={deleteMutation.isPending}
                    onPress={() => requestDelete(parentComment.id, true)}
                    style={{ marginLeft: 15, borderRadius: 4 }}
                  >
                    <Text
                      className="text-xs font-medium py-1"
                      style={{ color: Colors[colorScheme].danger }}
                    >
                      删除
                    </Text>
                  </BouncyButton>
                )}
              </View>
            </View>
          </View>
        </BouncyButton>
        <View
          className="px-[15px] py-2.5 bg-transparent"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: borderColor,
          }}
        >
          <Text className="text-xs font-semibold" style={{ color: tintColor }}>
            共 {totalCount} 条回复
          </Text>
        </View>
      </View>
    );
  };

  return (
    <NativeView
      ref={containerRef}
      collapsable={false}
      onLayout={onContainerLayout}
      className="flex-1"
      style={{ backgroundColor: Colors[colorScheme].backgroundSecondary }}
    >
      <Stack.Screen options={{ title: '所有回复' }} />
      <View style={StyleSheet.absoluteFill}>
        <FlashList
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item: CommentItem) => item.id.toString()}
          ListHeaderComponent={renderHeader}
          {...({ estimatedItemSize: 100 } as object)}
          contentContainerStyle={{
            paddingBottom: inputBarHeight + 20,
          }}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          onEndReached={() =>
            hasNextPage &&
            !isFetching &&
            !isFetchNextPageError &&
            fetchNextPage()
          }
          {...listPreload}
          keyboardDismissMode="on-drag"
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center bg-transparent">
                <ActivityIndicator size="small" color={tintColor} />
              </View>
            ) : isFetchNextPageError ? (
              <QueryErrorView
                compact
                message="更多回复加载失败"
                onRetry={() => void fetchNextPage()}
              />
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="flex-1 items-center justify-center mt-[50px] bg-transparent">
                <ActivityIndicator color={tintColor} />
              </View>
            ) : isError ? (
              <QueryErrorView
                message="回复加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <View className="flex-1 items-center justify-center mt-[50px] bg-transparent">
                <Text type="secondary">暂无回复喵~</Text>
              </View>
            )
          }
        />
      </View>

      {/* 输入框：按页面与键盘的实际重叠定位，兼容 Android 窗口缩放。 */}
      <Reanimated.View
        onLayout={(event) => setInputBarHeight(event.nativeEvent.layout.height)}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            paddingHorizontal: 15,
            paddingTop: 8,
          },
          inputBarAnimatedStyle,
        ]}
        pointerEvents="box-none"
      >
        <BlurView
          intensity={100}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={{
            borderRadius: 30,
            overflow: 'hidden',
          }}
        >
          <CommentComposer
            colorScheme={colorScheme}
            borderColor={borderColor}
            inputRef={inputRef}
            inputText={inputText}
            isSubmitting={mutation.isPending}
            onChangeText={setInputText}
            onSubmit={submitComment}
            onCancelReply={() => setReplyTo(null)}
            placeholder={replyTo ? `回复 ${replyTo.name}...` : '说点什么吧...'}
            replyToName={replyTo?.name}
            textColor={textColor}
            tintColor={tintColor}
          />
        </BlurView>
      </Reanimated.View>

      <CommentActionSheet
        visible={activeCommentAction !== null}
        htmlContent={activeCommentAction?.htmlContent ?? null}
        authorName={activeCommentAction?.authorName ?? null}
        canDelete={activeCommentAction?.canDelete ?? false}
        onDelete={() => {
          if (activeCommentAction) {
            requestDelete(
              activeCommentAction.id,
              activeCommentAction.returnToParent,
            );
          }
        }}
        onClose={() => setCommentAction(null)}
      />
    </NativeView>
  );
}
