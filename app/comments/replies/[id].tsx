import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  createCommentReply,
  getChildCommentsV5 as getChildComments,
  getComment,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { CommentActionSheet } from '@/components/CommentActionSheet';
import { CommentContent } from '@/components/CommentContent';
import { LikeButton } from '@/components/LikeButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { formatDate } from '@/utils/date';

export default function ReplyDetailScreen() {
  const { id, parent } = useLocalSearchParams<{
    id: string;
    parent?: string;
  }>();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [commentAction, setCommentAction] = useState<{
    htmlContent: string;
    authorName: string;
  } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const _queryClient = useQueryClient();
  const _insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
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

  const INPUT_BAR_HEIGHT = 60;

  const initialParentComment = useMemo<CommentItem | null>(() => {
    if (!parent) return null;
    try {
      return JSON.parse(decodeURIComponent(parent));
    } catch (e) {
      console.error('Failed to parse parent comment:', e);
      return null;
    }
  }, [parent]);

  const { data: parentCommentFromApi } = useQuery({
    queryKey: ['parent-comment', id],
    queryFn: () => getComment(id as string),
    enabled: !initialParentComment && !!id,
  });

  const parentComment = initialParentComment || parentCommentFromApi;

  const {
    data: repliesData,
    isLoading,
    refetch,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['replies', id],
    queryFn: async ({ pageParam = '' }) => {
      return getChildComments(id as string, 20, pageParam);
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

  const replies =
    repliesData?.pages.flatMap((page: any) => page.data || []) || [];
  const totalCount =
    repliesData?.pages?.[0]?.counts?.total_counts ??
    parentComment?.child_comment_count ??
    0;

  const mutation = useMutation({
    mutationFn: (content: string) =>
      createCommentReply(
        id as string,
        content,
        replyTo ? { reply_to_comment_id: replyTo.id } : {},
      ),
    onSuccess: () => {
      Alert.alert('发布成功喵！');
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

  const renderReply = ({ item }: { item: CommentItem }) => {
    return (
      <BouncyButton
        accessible={false}
        onLongPress={() =>
          handleLongPressComment(item.content, item.author.member.name)
        }
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
            <Image
              source={{ uri: item.author.member.avatar_url }}
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
          </View>
        </View>
      </BouncyButton>
    );
  };

  const renderHeader = () => {
    if (!parentComment) return null;
    return (
      <View
        style={{
          borderBottomWidth: 8,
          borderBottomColor: colorScheme === 'dark' ? '#1A1A1A' : '#F5F5F5',
        }}
      >
        <BouncyButton
          accessible={false}
          className="flex-row p-[15px] bg-transparent"
          style={{ borderRadius: 0 }}
          onLongPress={() =>
            handleLongPressComment(
              parentComment.content,
              parentComment.author.member.name,
            )
          }
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
            <Image
              source={{ uri: parentComment.author.member.avatar_url }}
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
    <View type="secondary" className="flex-1">
      <Stack.Screen options={{ title: '所有回复' }} />
      <View style={StyleSheet.absoluteFill}>
        <FlashList
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item: CommentItem) => item.id.toString()}
          ListHeaderComponent={renderHeader}
          {...({ estimatedItemSize: 100 } as any)}
          contentContainerStyle={{
            paddingBottom: INPUT_BAR_HEIGHT + insets.bottom + 20,
          }}
          onRefresh={refetch}
          refreshing={isFetching && !isLoading}
          onEndReached={() =>
            hasNextPage && !isFetchingNextPage && fetchNextPage()
          }
          onEndReachedThreshold={0.3}
          keyboardDismissMode="on-drag"
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center bg-transparent">
                <ActivityIndicator size="small" color={tintColor} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View className="flex-1 items-center justify-center mt-[50px] bg-transparent">
                <ActivityIndicator color={tintColor} />
              </View>
            ) : (
              <View className="flex-1 items-center justify-center mt-[50px] bg-transparent">
                <Text type="secondary">暂无回复喵~</Text>
              </View>
            )
          }
        />
      </View>

      {/* 输入框：绝对定位 + 随键盘动画移动 */}
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
              className="flex-1 min-h-[35px] max-h-[100px] px-3 pt-2.5 pb-2.5"
              style={{ color: textColor, fontSize: 15 }}
              placeholder={
                replyTo ? `回复 ${replyTo.name}...` : '说点什么吧...'
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
