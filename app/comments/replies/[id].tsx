import { createCommentReply, getChildComments } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ReplyDetailScreen() {
  const { id } = useLocalSearchParams(); // 根评论 ID
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string, name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');

  // 1. 获取回复列表
  const { data: replies, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['replies', id],
    queryFn: async () => {
      const data = await getChildComments(id as string);
      return data.data;
    }
  });

  // 2. 发布回复 Mutation
  const mutation = useMutation({
    mutationFn: (content: string) => {
      // 统一发送到根评论下
      return createCommentReply(id as string, content, replyTo ? { reply_to_comment_id: replyTo.id } : {});
    },
    onSuccess: () => {
      Alert.alert('发布成功喵！');
      setInputText('');
      setReplyTo(null);
      refetch();
    },
    onError: (err: any) => {
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
    }
  });

  const renderReply = ({ item }: { item: any }) => {
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';

    return (
      <View style={[styles.replyRow, { borderBottomColor: borderColor, backgroundColor: 'transparent' }]}>
        <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
        <View style={[styles.contentBox, { backgroundColor: 'transparent' }]}>
          <Text style={styles.authorName}>
            {item.author.member.name}
            {item.reply_to_author && (
              <Text type="secondary" style={styles.replyToText}> 回复 {item.reply_to_author.member.name}</Text>
            )}
          </Text>
          <Text style={styles.content}>
            {cleanContent}
          </Text>

          <View style={styles.footerRow}>
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
                <Text style={styles.replyActionText}>回复</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '所有回复' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.flex}
        keyboardVerticalOffset={90}
      >
        <FlashList
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item: any) => item.id.toString()}
          {...({ estimatedItemSize: 100 } as any)}
          onRefresh={refetch}
          refreshing={isFetching}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.center}><ActivityIndicator color="#0084ff" /></View>
            ) : (
              <View style={styles.center}><Text type="secondary">暂无回复喵~</Text></View>
            )
          }
        />

        {/* 输入栏环境提示 */}
        {replyTo && (
          <View type="surface" style={[styles.replyHeaderTip, { borderTopColor: borderColor }]}>
            <Text type="secondary" style={styles.replyHintText}>正在回复 {replyTo.name}</Text>
            <Pressable onPress={() => setReplyTo(null)}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </Pressable>
          </View>
        )}

        {/* 输入框 */}
        <View type="surface" style={[
          styles.inputBar,
          {
            borderTopColor: replyTo ? 'transparent' : borderColor,
            paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 15
          }
        ]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { backgroundColor: borderColor, color: textColor }]}
            placeholder={replyTo ? `回复 ${replyTo.name}...` : "说点什么吧..."}
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
  replyRow: { flexDirection: 'row', padding: 15, borderBottomWidth: 0.5 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  contentBox: { flex: 1, marginLeft: 12 },
  authorName: { fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  replyToText: { fontWeight: 'normal', color: '#999' },
  content: { fontSize: 15, lineHeight: 22, color: '#333' },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  time: { fontSize: 12, color: '#999' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  replyBtn: { marginLeft: 15 },
  replyActionText: { fontSize: 12, color: '#888', paddingVertical: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 15,
    paddingTop: 10,
    borderTopWidth: 0.5
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
  replyHeaderTip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10 },
  replyHintText: { fontSize: 12 }
});