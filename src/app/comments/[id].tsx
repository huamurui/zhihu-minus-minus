import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
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
  createAnswerComment,
  createAnswerSegmentComment,
  createArticleComment,
  createCommentV5,
  createPinComment,
  createQuestionComment,
  deleteComment,
  parseAnswerSegmentCommentContext,
  parseAnswerSegmentCommentTarget,
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
import { useCommentListQuery } from '@/hooks/useCommentQueries';
import { useListPreload } from '@/hooks/useListPreload';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { serializeParentComment } from '@/utils/commentRoute';
import { formatDate } from '@/utils/date';
import { buildZhihuContent, buildZhihuImageHtml } from '@/utils/zhihuContent';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function CommentScreen() {
  const { id, type, segmentId, count, text, pid, startOffset, endOffset } =
    useLocalSearchParams<{
      id: string;
      type: string;
      segmentId?: string;
      count?: string;
      text?: string;
      pid?: string;
      startOffset?: string;
      endOffset?: string;
    }>();
  const router = useRouter();
  const parentSessionVersion = React.useRef(getAuthSessionVersion()).current;
  const listPreload = useListPreload(0.3);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [commentAction, setCommentAction] = useState<{
    id: string | number;
    htmlContent: string;
    authorName: string;
    canDelete: boolean;
  } | null>(null);
  const inputRef = React.useRef<TextInputInstance>(null);
  const queryClient = useQueryClient();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;
  const tintColor = useThemeColor({}, 'link');
  const { width: paneWidth } = usePaneDimensions();
  // 减去头像(32) + 间距(12) + 左右padding(30)
  const contentWidth = paneWidth - 32 - 12 - 30;
  const insets = _insets;
  const commentResourceType: CommentResourceType =
    type === 'question'
      ? 'questions'
      : type === 'article'
        ? 'articles'
        : type === 'pin'
          ? 'pins'
          : 'answers';
  const isSegmentDiscussion = segmentId !== undefined;
  const segmentRoute = {
    id,
    type,
    segmentId,
    text,
    pid,
    startOffset,
    endOffset,
  };
  const segmentTarget = isSegmentDiscussion
    ? parseAnswerSegmentCommentTarget(segmentRoute)
    : null;
  const segmentContext = isSegmentDiscussion
    ? parseAnswerSegmentCommentContext(segmentRoute)
    : null;
  const canPostComment = !isSegmentDiscussion || segmentContext !== null;
  const segmentPostingHint = segmentTarget
    ? '这个知识点链接缺少完整的原文位置。可以查看评论，请返回正文重新选择知识点后发布。'
    : '这个知识点链接暂不支持评论。请返回正文重新选择知识点。';

  const { containerRef, onContainerLayout, inputBarAnimatedStyle } =
    useCommentKeyboardLayout(insets.bottom);

  const [inputBarHeight, setInputBarHeight] = useState(80 + insets.bottom);
  const [orderBy, setOrderBy] = useState<'score' | 'ts'>('score');
  const {
    comments,
    isLoading,
    isError,
    isFetchNextPageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isFetching,
    refetch,
    refresh,
    refreshing,
  } = useCommentListQuery({ id, type, segmentId, segmentTarget, orderBy });

  const mutation = useMutation({
    mutationFn: async ({ text: commentText, images }: CommentDraft) => {
      const imageHtml = images.map(buildZhihuImageHtml).join('<br/>');
      const content = buildZhihuContent(commentText, imageHtml);
      if (isSegmentDiscussion) {
        if (!segmentContext) throw new Error(segmentPostingHint);
        return createAnswerSegmentComment(segmentContext, content, replyTo?.id);
      }
      if (replyTo) {
        return createCommentV5(
          commentResourceType,
          id as string,
          content,
          replyTo.id,
        );
      }
      if (type === 'question')
        return createQuestionComment(id as string, content);
      if (type === 'article')
        return createArticleComment(id as string, content);
      if (type === 'pin') return createPinComment(id as string, content);
      return createAnswerComment(id as string, content);
    },
    onSuccess: () => {
      Alert.alert(replyTo ? '回复成功喵！' : '发布成功喵！');
      setInputText('');
      setReplyTo(null);
      refetch();
    },
    onError: (err: unknown) =>
      Alert.alert('发布失败', getZhihuErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string | number) => {
      const response = await deleteComment(commentId);
      if (!response.success) throw new Error('知乎未确认评论删除成功');
      return response;
    },
    onSuccess: () => {
      setCommentAction(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
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

  const requestDelete = (commentId: string | number) => {
    Alert.alert('确认删除', '确定要删除这条评论吗？此操作不可撤销喵。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(commentId),
      },
    ]);
  };

  const handleLongPressComment = (item: CommentItem) => {
    setCommentAction({
      id: item.id,
      htmlContent: item.content,
      authorName: item.author.member.name,
      canDelete: canDeleteComment(item),
    });
  };

  const renderComment = ({ item }: { item: CommentItem }) => {
    return (
      <BouncyButton
        accessible={false}
        onLongPress={() => handleLongPressComment(item)}
        delayLongPress={400}
        style={{
          paddingHorizontal: 15,
          paddingVertical: 13,
          borderRadius: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <View className="flex-row bg-transparent">
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
          <View className="flex-1 ml-3 bg-transparent">
            <BouncyButton
              onPress={() =>
                goToProfile(
                  item.author.member.url_token || item.author.member.id,
                )
              }
              style={{ alignSelf: 'flex-start', borderRadius: 4 }}
            >
              <Text className="font-semibold text-sm mb-1">
                {item.author.member.name}
                <CommentIdentityBadges comment={item} />
              </Text>
            </BouncyButton>
            <View className="mt-2 bg-transparent">
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
                  disabled={!canPostComment || mutation.isPending}
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

            {item.child_comment_count > 0 && (
              <BouncyButton
                style={{
                  marginTop: 8,
                  borderRadius: 8,
                  backgroundColor: surfaceColor,
                  overflow: 'hidden',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor,
                  padding: 10,
                }}
                onPress={() =>
                  router.push(
                    `/comments/replies/${item.id}?parent=${encodeURIComponent(
                      serializeParentComment(item, parentSessionVersion),
                    )}&resourceId=${encodeURIComponent(
                      String(id),
                    )}&resourceType=${encodeURIComponent(commentResourceType)}`,
                  )
                }
              >
                {(item.child_comments || [])
                  .slice(0, 2)
                  .map((child: CommentItem) => (
                    <View
                      key={child.id}
                      className="flex-row items-start mb-2 bg-transparent"
                    >
                      <StableAvatar
                        uri={child.author?.member?.avatar_url}
                        className="w-[18px] h-[18px] rounded-full mr-2"
                      />
                      <View className="flex-1 bg-transparent">
                        <Text className="text-xs">
                          <Text
                            onPress={() =>
                              goToProfile(
                                child.author.member.url_token ||
                                  child.author.member.id,
                              )
                            }
                            style={{ color: tintColor }}
                          >
                            {child.author.member.name}
                          </Text>
                          <CommentIdentityBadges comment={child} />
                        </Text>
                        <CommentContent
                          htmlContent={child.content}
                          width={contentWidth - 26}
                        />
                      </View>
                    </View>
                  ))}
                <Text
                  type="secondary"
                  className="text-xs font-medium"
                  style={{ color: tintColor }}
                >
                  查看全部 {item.child_comment_count} 条回复 →
                </Text>
              </BouncyButton>
            )}
          </View>
        </View>
      </BouncyButton>
    );
  };

  return (
    <NativeView
      ref={containerRef}
      collapsable={false}
      onLayout={onContainerLayout}
      className="flex-1"
      style={{ backgroundColor: surfaceColor }}
    >
      <Stack.Screen
        options={{
          title: `评论${count ? ` (${count})` : ''}`,
          headerRight: () =>
            !isSegmentDiscussion && (
              <BouncyButton
                onPress={() =>
                  setOrderBy((prev) => (prev === 'score' ? 'ts' : 'score'))
                }
                style={{
                  marginRight: 4,
                  borderRadius: 6,
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{ color: tintColor, fontSize: 14, fontWeight: '600' }}
                >
                  {orderBy === 'score' ? '默认' : '最新'}
                </Text>
              </BouncyButton>
            ),
        }}
      />

      <View style={StyleSheet.absoluteFill}>
        <FlashList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item: CommentItem) => item.id.toString()}
          {...({ estimatedItemSize: 120 } as object)}
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
          contentContainerStyle={{
            paddingBottom: inputBarHeight + 20,
            paddingTop: 8,
          }}
          ListHeaderComponent={
            text ? (
              <View
                style={{
                  backgroundColor: surfaceColor,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: borderColor,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 10,
                  borderRadius: 14,
                  marginHorizontal: 14,
                  marginTop: 6,
                }}
              >
                <View className="flex-row items-center mb-1 bg-transparent">
                  <Ionicons
                    name="chatbox-ellipses-outline"
                    size={14}
                    color={tintColor}
                  />
                  <Text
                    style={{
                      color: tintColor,
                      fontSize: 12,
                      fontWeight: '700',
                      marginLeft: 5,
                    }}
                  >
                    正在讨论
                  </Text>
                </View>
                <Text
                  numberOfLines={4}
                  style={{
                    fontSize: 13.5,
                    lineHeight: 19,
                    color: textColor,
                    opacity: 0.9,
                  }}
                >
                  "{text}"
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center bg-transparent">
                <ActivityIndicator size="small" color={tintColor} />
              </View>
            ) : isFetchNextPageError ? (
              <QueryErrorView
                compact
                message="更多评论加载失败"
                onRetry={() => void fetchNextPage()}
              />
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
                <ActivityIndicator size="large" color={tintColor} />
              </View>
            ) : isError ? (
              <QueryErrorView
                message="评论加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
                <Text type="secondary">
                  {isSegmentDiscussion && !segmentTarget
                    ? segmentPostingHint
                    : '暂无评论 喵~'}
                </Text>
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
          {canPostComment ? (
            <CommentComposer
              colorScheme={colorScheme}
              borderColor={borderColor}
              inputRef={inputRef}
              inputText={inputText}
              isSubmitting={mutation.isPending}
              onChangeText={setInputText}
              onSubmit={submitComment}
              onCancelReply={() => setReplyTo(null)}
              placeholder={
                replyTo
                  ? `回复 ${replyTo.name}...`
                  : '既然来了，就留下点什么吧...'
              }
              replyToName={replyTo?.name}
              textColor={textColor}
              tintColor={tintColor}
            />
          ) : (
            <Text
              type="secondary"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 14,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {segmentPostingHint}
            </Text>
          )}
        </BlurView>
      </Reanimated.View>

      <CommentActionSheet
        visible={commentAction !== null}
        htmlContent={commentAction?.htmlContent ?? null}
        authorName={commentAction?.authorName ?? null}
        canDelete={commentAction?.canDelete ?? false}
        onDelete={() => {
          if (commentAction) requestDelete(commentAction.id);
        }}
        onClose={() => setCommentAction(null)}
      />
    </NativeView>
  );
}
