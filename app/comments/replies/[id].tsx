import { createCommentReply, getChildComments } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ReplyDetailScreen() {
  const { id } = useLocalSearchParams(); // 根评论 ID
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string, name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');

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

  const goToProfile = (urlToken: string | number) => {
    if (urlToken) {
      router.push(`/user/${urlToken}`);
    }
  };

  const renderReply = ({ item }: { item: any }) => {
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';

    return (
      <View style={[styles.replyRow, { borderBottomColor: borderColor, backgroundColor: 'transparent' }]}>
        <Pressable onPress={() => goToProfile(item.author.member.url_token || item.author.member.id)}>
          <Image source={{ uri: item.author.member.avatar_url }} style={styles.avatar} />
        </Pressable>
        <View style={[styles.contentBox, { backgroundColor: 'transparent' }]}>
          <Text style={styles.authorName}>
            <Text onPress={() => goToProfile(item.author.member.url_token || item.author.member.id)}>
              {item.author.member.name}
            </Text>
            {item.reply_to_author && (
              <Text type="secondary" style={styles.replyToText}> 回复 <Text style={styles.replyTargetName} onPress={() => goToProfile(item.reply_to_author.member.url_token || item.reply_to_author.member.id)}>{item.reply_to_author.member.name}</Text></Text>
            )}
          </Text>
          <Text style={[styles.content, { color: textColor }]}>
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
      <View style={StyleSheet.absoluteFill}>
        <FlashList
          data={replies}
          renderItem={renderReply}
          keyExtractor={(item: any) => item.id.toString()}
          {...({ estimatedItemSize: 100 } as any)}
          contentContainerStyle={{ paddingBottom: 160 }}
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
      </View>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.floatingKAV}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        pointerEvents="box-none"
      >
        <View style={styles.floatingInputWrapper} pointerEvents="box-none">
          <BlurView intensity={80} tint={colorScheme} style={[styles.blurWrapper, { borderColor }]}>
            {replyTo && (
              <View style={styles.replyHeaderFloating}>
                <Text type="secondary" style={styles.replyHintText}>正在回复 {replyTo.name}</Text>
                <Pressable onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={16} color="#999" />
                </Pressable>
              </View>
            )}
            <View style={styles.inputPill}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: textColor }]}
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
  replyRow: { flexDirection: 'row', padding: 15, borderBottomWidth: 0.5 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  contentBox: { flex: 1, marginLeft: 12 },
  authorName: { fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  replyToText: { fontWeight: 'normal', color: '#999' },
  replyTargetName: { color: '#0084ff' },
  content: { fontSize: 15, lineHeight: 22 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  time: { fontSize: 12, color: '#999' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  replyBtn: { marginLeft: 15 },
  replyActionText: { fontSize: 12, color: '#888', paddingVertical: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  floatingKAV: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  floatingInputWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 20
  },
  blurWrapper: {
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
  replyHeaderTip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10 },
  replyHintText: { fontSize: 12 }
});