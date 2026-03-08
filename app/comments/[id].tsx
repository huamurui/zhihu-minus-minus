import { createAnswerComment, createQuestionComment, createCommentReply, getAnswerComments, getQuestionComments } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CommentScreen() {
  const { id, type } = useLocalSearchParams(); // Content ID and Type ('question' or 'answer')
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string, name: string } | null>(null);
  const inputRef = React.useRef<TextInput>(null);
  const queryClient = useQueryClient();

  const insets = useSafeAreaInsets();
  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  const textColor = useThemeColor({}, 'text');

  // 1. 获取评论数据
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['comments', id, type],
    queryFn: () => {
      if (type === 'question') {
        return getQuestionComments(id as string);
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

  const renderComment = ({ item }: { item: any }) => {
    // 过滤 HTML 标签
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';

    return (
      <View style={[styles.commentBox, { borderBottomColor: borderColor, backgroundColor: 'transparent' }]}>
        <View style={[styles.mainRow, { backgroundColor: 'transparent' }]}>
          <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
          <View style={[styles.right, { backgroundColor: 'transparent' }]}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{item.author.member.name}</Text>
              {item.author.member.headline && (
                <Text type="secondary" style={styles.headline} numberOfLines={1}>
                  {item.author.member.headline}
                </Text>
              )}
            </View>
            <Text style={[styles.content, { color: textColor }]}>{cleanContent}</Text>

            {/* 子评论预览区域 */}
            {item.child_comment_count > 0 && (
              <Pressable
                style={[styles.replyPreview, { backgroundColor: surfaceColor }]}
                onPress={() => router.push(`/comments/replies/${item.id}`)}
              >
                {(item.child_comments || []).slice(0, 2).map((child: any) => (
                  <Text key={child.id} style={styles.replyText} numberOfLines={1}>
                    <Text style={styles.bold}>{child.author.member.name}：</Text>
                    {child.content?.replace(/<[^>]+>/g, '').trim()}
                  </Text>
                ))}
                <Text style={styles.moreReplies}>查看全部 {item.child_comment_count} 条回复 {'>'}</Text>
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
                  <Text style={styles.replyAction}>回复</Text>
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
      <Stack.Screen options={{ title: '评论' }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.flex}
        keyboardVerticalOffset={90}
      >
        <View style={styles.flex}>
          <FlashList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item: any) => item.id.toString()}
            {...({ estimatedItemSize: 120 } as any)}
            onRefresh={refetch}
            refreshing={isFetching}
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.placeholder}><ActivityIndicator size="large" color="#0084ff" /></View>
              ) : (
                <View style={styles.placeholder}><Text type="secondary">暂无评论 喵~</Text></View>
              )
            }
          />
        </View>

        {/* 输入栏环境提示 */}
        {replyTo && (
          <View type="surface" style={[styles.replyHeader, { borderTopColor: borderColor }]}>
            <Text type="secondary" style={styles.replyHint}>正在回复 {replyTo.name}</Text>
            <Pressable onPress={() => setReplyTo(null)}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </Pressable>
          </View>
        )}

        {/* 输入框外层容器，用于处理键盘弹起 */}
        <View type="surface" style={[
          styles.inputBar,
          {
            borderTopColor: replyTo ? 'transparent' : borderColor,
            paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 10
          }
        ]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: borderColor, color: textColor }]}
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
              <ActivityIndicator size="small" color="#0084ff" />
            ) : (
              <Text style={[styles.sendText, { opacity: inputText.trim() ? 1 : 0.5 }]}>发布</Text>
            )}
          </Pressable>
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 35 : 15,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 10
  },
  sendBtn: { height: 40, justifyContent: 'center', paddingHorizontal: 5 },
  sendText: { color: '#0084ff', fontWeight: 'bold', fontSize: 16 },
  commentBox: { padding: 15, borderBottomWidth: 0.5 },
  right: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  name: { fontWeight: 'bold', fontSize: 14, marginRight: 8 },
  headline: { fontSize: 12, flex: 1 },
  content: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 12, color: '#999' },
  replyBtn: { marginLeft: 15 },
  replyAction: { fontSize: 12, color: '#888', paddingVertical: 5 },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10 },
  replyHint: { fontSize: 12 },
  replyPreview: { marginTop: 10, padding: 10, borderRadius: 8 },
  replyText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  bold: { fontWeight: 'bold', color: '#666' },
  moreReplies: { color: '#0084ff', fontSize: 13, marginTop: 5, fontWeight: '500' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 }
});
