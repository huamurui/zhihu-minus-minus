import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
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
import { createCommentReply, getChildComments } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function ReplyDetailScreen() {
  const { id } = useLocalSearchParams();
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const textColor = Colors[colorScheme].text;
  const tintColor = Colors[colorScheme].tint;

  const {
    data: replies,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['replies', id],
    queryFn: async () => {
      const data = await getChildComments(id as string);
      return data.data;
    },
  });

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

  const renderReply = ({ item }: { item: any }) => {
    const cleanContent = item.content?.replace(/<[^>]+>/g, '').trim() || '';
    return (
      <View
        type="secondary"
        className="flex-row p-[15px] bg-transparent"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
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
        <View type="secondary" className="flex-1 ml-3 bg-transparent">
          <Text className="font-bold text-[13px] mb-1">
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
                      item.reply_to_author.member.url_token ||
                        item.reply_to_author.member.id,
                    )
                  }
                >
                  {item.reply_to_author.member.name}
                </Text>
              </Text>
            )}
          </Text>
          <Text
            className="text-[15px] leading-[22px]"
            style={{ color: textColor }}
          >
            {cleanContent}
          </Text>

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
    );
  };

  return (
    <View type="secondary" className="flex-1">
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
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
                  replyTo ? `回复 ${replyTo.name}...` : '说点什么吧...'
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
