import apiClient from '@/api/client';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CommentScreen() {
  const { id } = useLocalSearchParams(); // Answer ID
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const queryClient = useQueryClient();

  const insets = useSafeAreaInsets();
  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  const textColor = useThemeColor({}, 'text');

  // 1. 获取评论数据
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['comments', id],
    queryFn: async () => {
      // 增加 include 参数以获取更多信息
      const res = await apiClient.get(`/answers/${id}/root_comments?limit=20&include=data[*].author,content,child_comment_count,child_comments,vote_count,created_time`);
      return res.data;
    }
  });

  const comments = data?.data || [];

  // 2. 真实发布评论 Mutation
  const mutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiClient.post(`/answers/${id}/comments`, {
        content: content,
        type: 'comment'
      });
    },
    onSuccess: () => {
      Alert.alert('发布成功喵！');
      setInputText('');
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
            <Text style={styles.content}>{cleanContent}</Text>

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
                {item.created_time ? new Date(item.created_time * 1000).toLocaleDateString() : ''} · 赞 {item.vote_count || 0}
              </Text>
              <Pressable onPress={() => Alert.alert('提示', '回复功能开发中...')}>
                <Text style={styles.replyAction}>回复</Text>
              </Pressable>
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

        {/* 输入框外层容器，用于处理键盘弹起 */}
        <View type="surface" style={[
          styles.inputBar,
          {
            borderTopColor: borderColor,
            paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 10
          }
        ]}>
          <TextInput
            style={[styles.input, { backgroundColor: borderColor, color: textColor }]}
            placeholder="既然来了，就留下点什么吧..."
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
  content: { fontSize: 15, lineHeight: 22, color: '#333' },
  commentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  time: { fontSize: 12 },
  replyAction: { fontSize: 12, color: '#0084ff', paddingHorizontal: 10, paddingVertical: 5 },
  replyPreview: { marginTop: 10, padding: 10, borderRadius: 8 },
  replyText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  bold: { fontWeight: 'bold', color: '#666' },
  moreReplies: { color: '#0084ff', fontSize: 13, marginTop: 5, fontWeight: '500' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 }
});
