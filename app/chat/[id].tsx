import { Ionicons } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View as RNView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages, sendMessage } from '@/api/zhihu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { me } = useAuthStore();

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const primaryColor = useThemeColor({}, 'primary');
  const borderColor = Colors[colorScheme].border;
  const surfaceColor = Colors[colorScheme].surface;
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    navigation.setOptions({
      title: name || '聊天',
    });
  }, [navigation, name]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['chat', id],
      queryFn: ({ pageParam = '' }) => getMessages(id, pageParam as string),
      initialPageParam: '',
      getNextPageParam: (lastPage) => {
        if (!lastPage || lastPage.paging?.is_end) return undefined;
        return lastPage.paging?.next;
      },
      // Simple polling every 5 seconds
      refetchInterval: 5000,
    });

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMessage(id, text),
    onMutate: async (_newText) => {
      // Optimistic update logic could go here
      setInputText('');
      Keyboard.dismiss();
    },
    onSuccess: (_newMessage) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['chat', id] });
    },
    onError: (err) => {
      console.error('Failed to send message:', err);
    },
  });

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    sendMutation.mutate(text);
  };

  const messages = data?.pages.flatMap((page) => page.data) || [];

  const renderMessage = ({ item }: { item: any }) => {
    if (!item) return null;

    // The API might return the message structure slightly differently from the POST response.
    // If it's unwrapped, item.id exists instead of item.info.id.
    const messageInfo = item.info || item;

    if (!messageInfo || !messageInfo.id) {
      console.log('Unrecognized message format:', item);
      return null;
    }

    // `user_type: 'receiver'` actually means the message was sent by ME.
    // `user_type: 'sender'` means the message was sent by the OTHER person.
    const isMe = messageInfo.user_type === 'receiver';

    // In GET API, item.sender is the OTHER person, item.receiver is ME.
    // In POST API, item.sender is ME, item.receiver is the OTHER person.
    // So we use the `id` from params to reliably find the OTHER person's avatar.
    const myAvatar =
      me?.avatar_url ||
      (item.sender?.id !== id
        ? item.sender?.avatar_url
        : item.receiver?.avatar_url);
    const otherAvatar =
      item.sender?.id === id
        ? item.sender?.avatar_url
        : item.receiver?.avatar_url;

    const avatarUrl = isMe
      ? myAvatar
      : otherAvatar ||
        'https://picx.zhimg.com/v2-2ddc5cc683982648f6f123616fb4ec09_l.png';

    const time = new Date(
      (messageInfo.created_time || Date.now() / 1000) * 1000,
    ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View
        className={`flex-row px-4 py-2 ${isMe ? 'justify-end' : 'justify-start'} bg-transparent`}
      >
        {!isMe && (
          <Image
            source={{ uri: avatarUrl }}
            className="w-10 h-10 rounded-full bg-gray-200 mr-3"
          />
        )}

        <View
          className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} bg-transparent`}
        >
          <View
            className={`px-4 py-2.5 rounded-2xl ${
              isMe
                ? 'rounded-tr-sm'
                : isDark
                  ? 'bg-gray-800 rounded-tl-sm'
                  : 'bg-white rounded-tl-sm'
            }`}
            style={[
              isMe && { backgroundColor: primaryColor },
              !isMe && !isDark
                ? {
                    shadowColor: Colors.light.shadow,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 2,
                  }
                : {},
            ]}
          >
            {messageInfo.content_type === 0 ? (
              <Text
                className={`text-[15px] leading-6 ${isMe ? 'text-white' : ''}`}
                style={isMe ? { color: 'white' } : {}}
              >
                {messageInfo.text}
              </Text>
            ) : messageInfo.content_type === 1 ? (
              <Text type="secondary">[图片消息]</Text>
            ) : (
              <Text type="secondary">[未知消息类型]</Text>
            )}
          </View>
          <Text type="secondary" className="text-[10px] mt-1 mx-1">
            {time}
          </Text>
        </View>

        {isMe && (
          <Image
            source={{ uri: avatarUrl }}
            className="w-10 h-10 rounded-full bg-gray-200 ml-3"
          />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View
        className="flex-1"
        style={{
          backgroundColor: isDark
            ? Colors.light.shadow
            : Colors.light.backgroundTertiary,
        }}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) =>
            item?.info?.id || item?.id || index.toString()
          }
          renderItem={renderMessage}
          inverted={true}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          contentContainerStyle={{ paddingVertical: 20 }}
          ListFooterComponent={() =>
            isFetchingNextPage ? (
              <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
            ) : isLoading ? (
              <ActivityIndicator
                style={{ marginTop: '50%' }}
                color={primaryColor}
              />
            ) : null
          }
          ListEmptyComponent={() =>
            !isLoading ? (
              <View
                className="flex-1 items-center justify-center p-10 bg-transparent"
                style={{ transform: [{ scaleY: -1 }] }}
              >
                <Text type="secondary">开始你们的对话吧</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Input Area */}
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor,
          backgroundColor: surfaceColor,
        }}
        className="px-3 pt-3 flex-row items-end"
      >
        <RNView
          className="flex-1 flex-row items-center rounded-full px-4 min-h-[40px] max-h-[100px]"
          style={{ backgroundColor: Colors[colorScheme].chatBubble }}
        >
          <TextInput
            className="flex-1 text-[15px] py-2"
            style={{ color: Colors[colorScheme].text }}
            placeholder="发送私信..."
            placeholderTextColor={Colors[colorScheme].iconMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
        </RNView>

        <Pressable
          onPress={handleSend}
          disabled={!inputText.trim() || sendMutation.isPending}
          className="ml-3 w-10 h-10 rounded-full justify-center items-center"
          style={{
            backgroundColor: inputText.trim()
              ? primaryColor
              : isDark
                ? '#333'
                : '#e0e0e0',
          }}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator
              size="small"
              color={Colors[colorScheme].textInverse}
            />
          ) : (
            <Ionicons
              name="arrow-up"
              size={20}
              color={
                inputText.trim()
                  ? Colors[colorScheme].textInverse
                  : Colors[colorScheme].textTertiary
              }
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
