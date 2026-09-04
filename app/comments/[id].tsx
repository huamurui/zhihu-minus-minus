import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type CommentItem,
  createAnswerComment,
  createArticleComment,
  createCommentReply,
  createPinComment,
  createQuestionComment,
  getAnswerComments,
  getArticleCommentsV5 as getArticleComments,
  getPinCommentsV5 as getPinComments,
  getQuestionCommentsV5 as getQuestionComments,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CommentActionSheet } from '@/components/CommentActionSheet';
import { CommentContent } from '@/components/CommentContent';
import { LikeButton } from '@/components/LikeButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { formatDate } from '@/utils/date';

export default function CommentScreen() {
  const { id, type, segmentId, count, text } = useLocalSearchParams<{
    id: string;
    type: string;
    segmentId?: string;
    count?: string;
    text?: string;
  }>();
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [commentAction, setCommentAction] = useState<{
    htmlContent: string;
    authorName: string;
  } | null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const _queryClient = useQueryClient();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;
  const tintColor = useThemeColor({}, 'primary');
  const { width: screenWidth } = useWindowDimensions();
  // 减去头像(32) + 间距(12) + 左右padding(30)
  const contentWidth = screenWidth - 32 - 12 - 30;
  const insets = _insets;

  // 键盘高度动画：解决键盘收起后输入框无法回到底部的 bug
  const keyboardHeight = useSharedValue(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardHeight.value = withTiming(e.endCoordinates.height, {
          duration: Platform.OS === 'ios' ? e.duration || 250 : 200,
        });
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        keyboardHeight.value = withTiming(0, {
          duration: Platform.OS === 'ios' ? e.duration || 250 : 200,
        });
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardHeight]);

  const inputBarAnimatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));

  // 输入框高度（居中估算，动态取实际高度应用 onLayout）
  const INPUT_BAR_HEIGHT = 60;

  const [orderBy, setOrderBy] = useState<'score' | 'ts'>('score');

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isFetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['comments', id, type, segmentId, orderBy],
    queryFn: async ({ pageParam = '' }) => {
      if (segmentId) {
        const { getSegmentComments } = await import('@/api/zhihu/answer');
        return getSegmentComments(id as string, segmentId as string);
      }
      if (type === 'question')
        return getQuestionComments(id as string, 20, pageParam, orderBy);
      if (type === 'article')
        return getArticleComments(id as string, 20, pageParam, orderBy);
      if (type === 'pin')
        return getPinComments(id as string, 20, pageParam, orderBy);
      return getAnswerComments(id as string);
    },
    getNextPageParam: (lastPage: any) => {
      if (!lastPage?.paging?.is_end && lastPage?.paging?.next) {
        const match = lastPage.paging.next.match(/offset=([^&]*)/);
        return match ? match[1] : undefined;
      }
      return undefined;
    },
    initialPageParam: '',
  });

  const comments = data?.pages.flatMap((page: any) => page.data || []) || [];

  const mutation = useMutation({
    mutationFn: (content: string) => {
      if (replyTo) return createCommentReply(replyTo.id, content);
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
    onError: (err: any) =>
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误'),
  });

  const goToProfile = (urlToken: string | number) => {
    if (urlToken) router.push(`/user/${urlToken}`);
  };

  const handleLongPressComment = (htmlContent: string, authorName: string) => {
    setCommentAction({ htmlContent, authorName });
  };

  const renderComment = ({ item }: { item: CommentItem }) => {
    return (
      <BouncyButton
        accessible={false}
        onLongPress={() =>
          handleLongPressComment(item.content, item.author.member.name)
        }
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
            <Image
              source={{ uri: item.author.member.avatar_url }}
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
                      JSON.stringify(item),
                    )}`,
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
                      <Image
                        source={{ uri: child.author?.member?.avatar_url }}
                        className="w-[18px] h-[18px] rounded-full mr-2"
                      />
                      <View className="flex-1 bg-transparent">
                        <CommentContent
                          htmlContent={`<a href="/user/${child.author?.member?.url_token || child.author?.member?.id}">${child.author?.member?.name}</a>：${child.content}`}
                          width={contentWidth - 26}
                        />
                      </View>
                    </View>
                  ))}
                <Text
                  type="secondary"
                  className="text-xs font-medium mt-1"
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
    <View className="flex-1" style={{ backgroundColor: surfaceColor }}>
      <Stack.Screen
        options={{
          title: `评论${count ? ` (${count})` : ''}`,
          headerRight: () => (
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
          {...({ estimatedItemSize: 120 } as any)}
          onRefresh={refetch}
          refreshing={isFetching && !isLoading}
          onEndReached={() =>
            hasNextPage && !isFetchingNextPage && fetchNextPage()
          }
          onEndReachedThreshold={0.3}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingBottom: INPUT_BAR_HEIGHT + insets.bottom + 20,
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
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
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
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
                <ActivityIndicator size="large" color={tintColor} />
              </View>
            ) : (
              <View className="flex-1 items-center justify-center mt-[100px] bg-transparent">
                <Text type="secondary">暂无评论 喵~</Text>
              </View>
            )
          }
        />
      </View>

      {/* 输入框：绝对定位 + 随键盘动画移动，避免 KAV 全屏占位导致收起后不归位的 bug */}
      <Reanimated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            paddingHorizontal: 15,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
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
            borderWidth: StyleSheet.hairlineWidth,
            borderColor,
            paddingHorizontal: 5,
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(26,26,26,0.85)'
                : 'rgba(255,255,255,0.9)',
          }}
        >
          {replyTo && (
            <View className="flex-row justify-between items-center px-[15px] pt-2.5 pb-0.5">
              <Text type="secondary" className="text-xs">
                正在回复 {replyTo.name}
              </Text>
              <BouncyButton
                onPress={() => setReplyTo(null)}
                style={{ borderRadius: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={Colors[colorScheme].textSecondary}
                />
              </BouncyButton>
            </View>
          )}
          <View className="flex-row items-end px-1 py-1">
            <TextInput
              ref={inputRef}
              className="flex-1 min-h-[40px] max-h-[100px] px-3 pt-2.5 pb-2.5"
              style={{ color: textColor, fontSize: 15 }}
              placeholder={
                replyTo
                  ? `回复 ${replyTo.name}...`
                  : '既然来了，就留下点什么吧...'
              }
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />
            <BouncyButton
              disabled={!inputText.trim() || mutation.isPending}
              onPress={() => mutation.mutate(inputText.trim())}
              style={{
                height: 40,
                justifyContent: 'center',
                paddingHorizontal: 15,
                borderRadius: 20,
              }}
            >
              {mutation.isPending ? (
                <ActivityIndicator size="small" color={tintColor} />
              ) : (
                <Text
                  className="font-semibold text-base"
                  style={{
                    color: tintColor,
                    opacity: inputText.trim() ? 1 : 0.5,
                  }}
                >
                  发布
                </Text>
              )}
            </BouncyButton>
          </View>
        </BlurView>
      </Reanimated.View>

      <CommentActionSheet
        visible={commentAction !== null}
        htmlContent={commentAction?.htmlContent ?? null}
        authorName={commentAction?.authorName ?? null}
        onClose={() => setCommentAction(null)}
      />
    </View>
  );
}
