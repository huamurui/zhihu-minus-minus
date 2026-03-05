import apiClient from '@/api/client';
import { Text, View, useThemeColor } from '@/components/Themed';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

export default function CommentScreen() {
  const { id } = useLocalSearchParams(); // Answer ID
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const queryClient = useQueryClient();

  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  const textColor = useThemeColor({}, 'text');

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

  const renderComment = ({ item }: { item: any }) => (
    <View style={[styles.commentBox, { borderBottomColor: borderColor, backgroundColor: 'transparent' }]}>
      <View style={[styles.mainRow, { backgroundColor: 'transparent' }]}>
        <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
        <View style={[styles.right, { backgroundColor: 'transparent' }]}>
          <Text style={styles.name}>{item.author.member.name}</Text>
          <Text style={styles.content}>{item.content}</Text>

          {/* 子评论预览区域 */}
          {item.child_comment_count > 0 && (
            <Pressable
              style={[styles.replyPreview, { backgroundColor: surfaceColor }]}
              onPress={() => router.push(`/comments/replies/${item.id}`)}
            >
              {item.child_comments.slice(0, 2).map((child: any) => (
                <Text key={child.id} style={styles.replyText} numberOfLines={1}>
                  <Text style={styles.bold}>{child.author.member.name}：</Text>{child.content}
                </Text>
              ))}
              <Text style={styles.moreReplies}>查看全部 {item.child_comment_count} 条回复 {'>'}</Text>
            </Pressable>
          )}

          <Text type="secondary" style={styles.time}>{item.created_time_name} · 赞 {item.vote_count}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <FlatList
        data={comments}
        renderItem={renderComment}
        keyExtractor={(item: any) => item.id.toString()}
        ListEmptyComponent={isLoading ? <View style={styles.center}><Text type="secondary">加载中...</Text></View> : null}
      />

      {/* 输入框 */}
      <View type="surface" style={[styles.inputBar, { borderTopColor: borderColor }]}>
        <TextInput
          style={[styles.input, { backgroundColor: borderColor, color: textColor }]}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainRow: { flexDirection: 'row' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: 35, borderTopWidth: 0.5 },
  input: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 15, marginRight: 10 },
  sendText: { color: '#0084ff', fontWeight: 'bold', fontSize: 16 },
  commentBox: { padding: 15, borderBottomWidth: 0.5 },
  right: { flex: 1, marginLeft: 12 },
  name: { fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  content: { fontSize: 15, lineHeight: 22 },
  time: { fontSize: 12, marginTop: 10 },
  replyPreview: { marginTop: 10, padding: 10, borderRadius: 8 },
  replyText: { fontSize: 14, lineHeight: 20, marginBottom: 5 },
  bold: { fontWeight: 'bold', color: '#0084ff' },
  moreReplies: { color: '#0084ff', fontSize: 13, marginTop: 5, fontWeight: '500' },
  center: { textAlign: 'center', marginTop: 50 }
});
