import {
  createAnswerComment,
  createQuestionComment,
  createArticleComment,
  createCommentReply,
  getAnswerComments,
  getArticleCommentsV5 as getArticleComments,
  getQuestionCommentsV5 as getQuestionComments,
} from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';

export default function CommentScreen() {
  const { id, type, segmentId, count } = useLocalSearchParams<{
    id: string;
    type: string;
    segmentId?: string;
    count?: string;
  }>();
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const inputRef = React.useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;
  const tintColor = Colors[colorScheme].tint;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['comments', id, type, segmentId],
    queryFn: async () => {
      if (segmentId) {
        const { getSegmentComments } = await import('@/api/zhihu/answer');
        return getSegmentComments(id as string, segmentId as string);
      }
      if (type === 'question') return getQuestionComments(id as string);
      if (type === 'article') return getArticleComments(id as string);
      return getAnswerComments(id as string);
    },
  });

  const comments = data?.data || [];

  const mutation = useMutation({
    mutationFn: (content: string) => {
      if (replyTo) return createCommentReply(replyTo.id, content);
      if (type === 'question')
        return createQuestionComment(id as string, content);
      if (type === 'article')
        return createArticleComment(id as string, content);
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

  const renderComment = ({ item }: { item: any }) => {
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';
    return (
      <View
        className="p-[15px] bg-transparent"
        style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
      >
        <View className="flex-row bg-transparent">
          <Pressable
            onPress={() =>
              goToProfile(item.author.member.url_token || item.author.member.id)
            }
          >
            <Image
              source={{ uri: item.author.member.avatar_url }}
              className="w-8 h-8 rounded-full"
            />
          </Pressable>
          <View className="flex-1 ml-3 bg-transparent">
            <Pressable
              onPress={() =>
                goToProfile(
                  item.author.member.url_token || item.author.member.id,
                )
              }
            >
              <View className="flex-row items-center mb-1">
                <Text className="font-bold text-sm mr-2">
                  {item.author.member.name}
                </Text>
                {item.author.member.headline && (
                  <Text
                    type="secondary"
                    className="text-xs flex-1"
                    numberOfLines={1}
                  >
                    {item.author.member.headline}
                  </Text>
                )}
              </View>
            </Pressable>
            <Text
              className="text-[15px] leading-[22px] mt-1"
              style={{ color: textColor }}
            >
              {cleanContent}
            </Text>

            {item.child_comment_count > 0 && (
              <Pressable
                className="mt-2.5 p-2.5 rounded-lg"
                style={{ backgroundColor: surfaceColor }}
                onPress={() => router.push(`/comments/replies/${item.id}`)}
              >
                {(item.child_comments || []).slice(0, 2).map((child: any) => (
                  <View
                    key={child.id}
                    className="flex-row items-start mb-2 mr-2.5 bg-transparent"
                  >
                    <Image
                      source={{ uri: child.author?.member?.avatar_url }}
                      className="w-[18px] h-[18px] rounded-full mr-2"
                    />
                    <Text
                      className="text-sm leading-5 flex-1"
                      numberOfLines={2}
                    >
                      <Text type="secondary" className="font-bold">
                        {child.author?.member?.name}：
                      </Text>
                      {child.content?.replace(/<[^>]+>/g, '').trim()}
                    </Text>
                  </View>
                ))}
                <View
                  className="py-1 px-3 rounded-[14px] mt-2 self-start"
                  style={{ backgroundColor: borderColor }}
                >
                  <Text type="secondary" className="text-xs font-medium">
                    查看全部 {item.child_comment_count} 条回复 {'>'}
                  </Text>
                </View>
              </Pressable>
            )}

            <View className="flex-row justify-between items-center mt-2">
              <Text type="secondary" className="text-xs">
                {item.created_time
                  ? new Date(item.created_time * 1000).toLocaleDateString()
                  : ''}
              </Text>
              <View className="flex-row items-center">
                <LikeButton
                  id={item.id}
                  count={item.vote_count || 0}
                  voted={item.relationship?.voting || 0}
                  type="comments"
                  variant="ghost"
                />
                <Pressable
                  onPress={() => {
                    setReplyTo({ id: item.id, name: item.author.member.name });
                    inputRef.current?.focus();
                  }}
                  className="ml-[15px]"
                >
                  <Text type="secondary" className="text-xs py-1">
                    回复
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: surfaceColor }}>
      <Stack.Screen options={{ title: `评论${count ? ` (${count})` : ''}` }} />

      <View style={StyleSheet.absoluteFill}>
        <FlashList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item: any) => item.id.toString()}
          {...({ estimatedItemSize: 120 } as any)}
          onRefresh={refetch}
          refreshing={isFetching}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 160, paddingTop: 10 }}
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        pointerEvents="box-none"
      >
        <View
          className="flex-1 justify-end px-[15px] pb-5"
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
                <Pressable onPress={() => setReplyTo(null)}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={Colors[colorScheme].textSecondary}
                  />
                </Pressable>
              </View>
            )}
            <View className="flex-row items-end px-1 py-1">
              <TextInput
                ref={inputRef}
                className="flex-1 min-h-[40px] max-h-[100px] px-3 pt-2.5 pb-2.5"
                style={{ color: textColor }}
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
              <Pressable
                disabled={!inputText.trim() || mutation.isPending}
                onPress={() => mutation.mutate(inputText.trim())}
                className="h-10 justify-center px-[15px]"
              >
                {mutation.isPending ? (
                  <ActivityIndicator size="small" color={tintColor} />
                ) : (
                  <Text
                    className="font-bold text-base"
                    style={{
                      color: tintColor,
                      opacity: inputText.trim() ? 1 : 0.5,
                    }}
                  >
                    发布
                  </Text>
                )}
              </Pressable>
            </View>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
