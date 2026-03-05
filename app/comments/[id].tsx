import apiClient from '@/api/client';
import { useThemeStore } from '@/store/useThemeStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function CommentScreen() {
  const { id } = useLocalSearchParams(); // Answer ID
  const router = useRouter();
  const { isDark } = useThemeStore();
  const [inputText, setInputText] = useState('');
  const queryClient = useQueryClient();

  const theme = {
    bg: isDark ? '#121212' : '#fff',
    text: isDark ? '#fff' : '#1a1a1a',
    border: isDark ? '#333' : '#eee',
    card: isDark ? '#1e1e1e' : '#f6f6f6'
  };

  // 1. 获取根评论
  const { data: comments, isLoading, refetch } = useQuery({
    queryKey: ['comments', id],
    queryFn: async () => {
      const res = await apiClient.get(`/answers/${id}/root_comments?limit=20&include=data[*].author,content,child_comment_count,child_comments`);
      return res.data.data;
    }
  });

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

  const renderComment = ({ item }: any) => (
    <View style={[styles.commentBox, { borderBottomColor: theme.border }]}>
      <View style={styles.mainRow}>
        <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
        <View style={styles.right}>
          <Text style={[styles.name, { color: theme.text }]}>{item.author.member.name}</Text>
          <Text style={[styles.content, { color: theme.text }]}>{item.content}</Text>
          
          {/* 子评论预览区域 */}
          {item.child_comment_count > 0 && (
            <Pressable 
              style={[styles.replyPreview, { backgroundColor: theme.card }]}
              onPress={() => router.push(`/comments/replies/${item.id}`)}
            >
              {item.child_comments.slice(0, 2).map((child: any) => (
                <Text key={child.id} style={[styles.replyText, { color: theme.text }]} numberOfLines={1}>
                  <Text style={styles.bold}>{child.author.member.name}：</Text>{child.content}
                </Text>
              ))}
              <Text style={styles.moreReplies}>查看全部 {item.child_comment_count} 条回复 {'>'}</Text>
            </Pressable>
          )}
          
          <Text style={styles.time}>{item.created_time_name} · 赞 {item.vote_count}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        data={comments}
        renderItem={renderComment}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={isLoading ? <Text style={styles.center}>加载中...</Text> : null}
      />
      
      {/* 输入框 */}
      <View style={[styles.inputBar, { borderTopColor: theme.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
          placeholder="既然来了，就留下点什么吧..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
        />
        <Pressable 
          disabled={!inputText || mutation.isPending}
          onPress={() => mutation.mutate(inputText)}
        >
          <Text style={[styles.sendText, { opacity: inputText ? 1 : 0.5 }]}>
            {mutation.isPending ? '发送中...' : '发布'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// 样式部分省略，可参考之前的或自行微调
const styles = StyleSheet.create({
  container: { flex: 1 },
  commentItem: { padding: 15, borderBottomWidth: 0.5 },
  mainRow: { flexDirection: 'row' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  rightContent: { flex: 1, marginLeft: 12 },
  authorName: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  commentText: { fontSize: 15, lineHeight: 22 },
  commentAction: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' },
  timeText: { fontSize: 12, color: '#999' },
  likeBox: { flexDirection: 'row', alignItems: 'center' },
  likeCount: { fontSize: 12, color: '#999', marginLeft: 4 },
  childBox: { marginTop: 10, padding: 10, borderRadius: 8 },
  childText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  childName: { fontWeight: 'bold', color: '#0084ff' },
  moreText: { color: '#0084ff', fontSize: 13, marginTop: 5, fontWeight: '500' },
  centerText: { textAlign: 'center', marginTop: 50, color: '#999' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 35 },
  input: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 15, marginRight: 10 },
  sendBtn: { paddingHorizontal: 5 },
  sendText: { color: '#0084ff', fontWeight: 'bold', fontSize: 16 },
  commentBox: { padding: 15, borderBottomWidth: 0.5 },
  right: { flex: 1, marginLeft: 12 },
  name: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  content: { fontSize: 15, lineHeight: 22 },
  time: { fontSize: 12, color: '#999', marginTop: 10 },
  replyPreview: { marginTop: 10, padding: 10, borderRadius: 8 },
  replyText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  bold: { fontWeight: 'bold', color: '#0084ff' },
  moreReplies: { color: '#0084ff', fontSize: 13, marginTop: 5, fontWeight: '500' },
  center: { textAlign: 'center', marginTop: 50, color: '#999' }
});