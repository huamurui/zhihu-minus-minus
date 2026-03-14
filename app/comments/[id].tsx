import {
  createAnswerComment,
  createQuestionComment,
  createArticleComment,
  createCommentReply,
  getAnswerComments,
  getArticleCommentsV5 as getArticleComments,
  getQuestionCommentsV5 as getQuestionComments
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
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
export default function CommentScreen() {
  const { id, type, segmentId, count } = useLocalSearchParams<{ id: string, type: string, segmentId?: string, count?: string }>(); // Content ID, Type, and optional Segment ID
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string, name: string } | null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const queryClient = useQueryClient();

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;
  const tintColor = Colors[colorScheme].tint;

  // 1. 获取评论数据
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['comments', id, type, segmentId],
    queryFn: async () => {
      if (segmentId) {
        const { getSegmentComments } = await import('@/api/zhihu/answer');
        return getSegmentComments(id as string, segmentId as string);
      }
      if (type === 'question') {
        return getQuestionComments(id as string);
      }
      if (type === 'article') {
        return getArticleComments(id as string);
      }
      return getAnswerComments(id as string);
    }
  });

  const comments = data?.data || [];

  // 2. 发布评论/回复 Mutation
  const mutation = useMutation({
    mutationFn: (content: string) => {
      if (replyTo) {
        // 回复评论
        return createCommentReply(replyTo.id, content);
      } else {
        // 发布根评论
        if (type === 'question') {
          return createQuestionComment(id as string, content);
        }
        if (type === 'article') {
          return createArticleComment(id as string, content);
        }
        return createAnswerComment(id as string, content);
      }
    },
    onSuccess: () => {
      Alert.alert(replyTo ? '回复成功喵！' : '发布成功喵！');
      setInputText('');
      setReplyTo(null);
      refetch(); // 刷新列表
    },
    onError: (err: any) => {
      console.error(err.response?.data);
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
    }
  });

  const goToProfile = (urlToken: string | number) => {
    if (urlToken) {
      router.push(`/user/${urlToken}`);
    }
  };

  const renderComment = ({ item }: { item: any }) => {
    // 过滤 HTML 标签
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';

    return (
      <View style={[styles.commentBox, { borderBottomColor: borderColor, backgroundColor: 'transparent' }]}>
        <View style={[styles.mainRow, { backgroundColor: 'transparent' }]}>
          <Pressable onPress={() => goToProfile(item.author.member.url_token || item.author.member.id)}>
            <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
          </Pressable>
          <View style={[styles.right, { backgroundColor: 'transparent' }]}>
            <Pressable onPress={() => goToProfile(item.author.member.url_token || item.author.member.id)}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{item.author.member.name}</Text>
                {item.author.member.headline && (
                  <Text type="secondary" style={styles.headline} numberOfLines={1}>
                    {item.author.member.headline}
                  </Text>
                )}
              </View>
            </Pressable>
            <Text style={[styles.content, { color: textColor }]}>{cleanContent}</Text>

            {/* 子评论预览区域 */}
            {item.child_comment_count > 0 && (
              <Pressable
                style={[styles.replyPreview, { backgroundColor: surfaceColor }]}
                onPress={() => router.push(`/comments/replies/${item.id}`)}
              >
                {(item.child_comments || []).slice(0, 2).map((child: any) => (
                  <View key={child.id} style={styles.childCommentRow}>
                    <Image source={{ uri: child.author?.member?.avatar_url }} style={styles.childAvatar} />
                    <Text style={styles.replyText} numberOfLines={2}>
                      <Text type="secondary" style={styles.bold}>{child.author?.member?.name}：</Text>
                      {child.content?.replace(/<[^>]+>/g, '').trim()}
                    </Text>
                  </View>
                ))}
                <View style={[styles.moreRepliesBtn, { backgroundColor: borderColor }]}>
                  <Text type="secondary" style={styles.moreReplies}>查看全部 {item.child_comment_count} 条回复 {'>'}</Text>
                </View>
              </Pressable>
            )}

            <View style={styles.commentFooter}>
              <Text type="secondary" style={styles.time}>
                {item.created_time ? new Date(item.created_time * 1000).toLocaleDateString() : ''}
              </Text>

              <View style={styles.actionRow}>
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
                  style={styles.replyBtn}
                >
                  <Text type="secondary" style={styles.replyAction}>回复</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: surfaceColor }]}>
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
          contentContainerStyle={{ paddingBottom: 160, paddingTop: 10 }} // 预留底部空间
          ListEmptyComponent={
            isLoading ? (
              <View style={[styles.placeholder, { backgroundColor: 'transparent' }]}><ActivityIndicator size="large" color={tintColor} /></View>
            ) : (
              <View style={[styles.placeholder, { backgroundColor: 'transparent' }]}><Text type="secondary">暂无评论 喵~</Text></View>
            )
          }
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.floatingKAV}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        pointerEvents="box-none"
      >
        <View style={styles.floatingInputWrapper} pointerEvents="box-none">
          <BlurView 
            intensity={100} 
            tint={colorScheme === 'dark' ? 'dark' : 'light'} 
            style={[
              styles.capsuleWrapper, 
              { 
                borderColor,
                backgroundColor: colorScheme === 'dark' ? 'rgba(26,26,26,0.85)' : 'rgba(255,255,255,0.9)'
              }
            ]}
          >
            {replyTo && (
              <View style={styles.replyHeaderFloating}>
                <Text type="secondary" style={styles.replyHint}>正在回复 {replyTo.name}</Text>
                <Pressable onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={16} color={Colors[colorScheme].textSecondary} />
                </Pressable>
              </View>
            )}
            <View style={styles.inputPill}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: textColor }]}
                placeholder={replyTo ? `回复 ${replyTo.name}...` : "既然来了，就留下点什么吧..."}
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
              />
              <Pressable
                disabled={!inputText.trim() || mutation.isPending}
                onPress={() => mutation.mutate(inputText.trim())}
                style={styles.sendBtn}
              >
                {mutation.isPending ? (
                  <ActivityIndicator size="small" color={tintColor} />
                ) : (
                  <Text style={[styles.sendText, { color: tintColor, opacity: inputText.trim() ? 1 : 0.5 }]}>发布</Text>
                )}
              </Pressable>
            </View>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  mainRow: { flexDirection: 'row' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  floatingKAV: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  floatingInputWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  capsuleWrapper: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
  },
  replyHeaderFloating: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 2,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendBtn: { height: 40, justifyContent: 'center', paddingHorizontal: 15 },
  sendText: { fontWeight: 'bold', fontSize: 16 },
  commentBox: { padding: 15, borderBottomWidth: 0.5 },
  right: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  name: { fontWeight: 'bold', fontSize: 14, marginRight: 8 },
  headline: { fontSize: 12, flex: 1 },
  content: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 12 },
  replyBtn: { marginLeft: 15 },
  replyAction: { fontSize: 12, paddingVertical: 5 },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10 },
  replyHint: { fontSize: 12 },
  replyPreview: { marginTop: 10, padding: 10, borderRadius: 8 },
  replyText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  bold: { fontWeight: 'bold' },
  moreRepliesBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  moreReplies: { fontSize: 12, fontWeight: '500' },
  childCommentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, marginRight: 10, backgroundColor: 'transparent' },
  childAvatar: { width: 18, height: 18, borderRadius: 9, marginRight: 8 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 }
});
