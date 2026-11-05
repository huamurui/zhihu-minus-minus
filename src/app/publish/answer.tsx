import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInvitedQuestions, searchCreatorQuestions } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { ZhihuQuestion } from '@/types/zhihu';
import {
  getPublishingQuestionId,
  type PublishingQuestionItem,
} from '@/utils/publishingQuestion';

export default function PublishAnswerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [activeTab, setActiveTab] = useState<'search' | 'invite'>('search');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const {
    data: searchResults,
    isLoading: isSearching,
    isError: searchError,
    refetch: retrySearch,
  } = useQuery({
    queryKey: ['creator-search', debouncedQuery],
    queryFn: () => searchCreatorQuestions(debouncedQuery),
    enabled: debouncedQuery.length > 0 && activeTab === 'search',
  });

  const {
    data: invitedResults,
    isLoading: isInvitedLoading,
    isError: invitedError,
    refetch: retryInvited,
  } = useQuery({
    queryKey: ['invited-questions'],
    queryFn: () => getInvitedQuestions(),
    enabled: activeTab === 'invite',
  });

  const searchPending = query.trim() !== debouncedQuery || isSearching;
  const searchItems =
    !query.trim() || searchPending
      ? []
      : (searchResults?.data.filter((item) => getPublishingQuestionId(item)) ??
        []);
  const invitedItems =
    invitedResults?.data.filter((item) => getPublishingQuestionId(item)) ?? [];

  const renderQuestionItem = ({ item }: { item: PublishingQuestionItem }) => {
    const questionId = getPublishingQuestionId(item);
    if (!questionId) return null;
    // Check if it's an invitation item
    if ('content' in item && item.content?.text) {
      const {
        title: inviter,
        sub_title: inviteMsg,
        text: qTitle,
      } = item.content;

      return (
        <BouncyButton
          onPress={() => router.push(`/question/write/${questionId}`)}
          className="px-5 py-4 border-b"
          style={{ borderBottomColor: borderCol }}
        >
          <View className="flex-row items-center mb-1 bg-transparent">
            <Text className="text-xs font-bold" style={{ color: tintColor }}>
              {inviter}
            </Text>
            <Text className="text-xs ml-1" style={{ color: secondaryColor }}>
              {inviteMsg}
            </Text>
          </View>
          <Text
            className="text-base font-bold mb-2 leading-6"
            style={{ color: textColor }}
          >
            {qTitle}
          </Text>
        </BouncyButton>
      );
    }

    const question:
      | Pick<ZhihuQuestion, 'id' | 'title' | 'follow_num'>
      | undefined =
      'id' in item && 'title' in item
        ? item
        : item.question || item.target || item.extra?.data;
    if (!question) return null;

    const reaction = 'reaction' in item ? item.reaction || {} : {};
    const subText = reaction.pv
      ? `${reaction.pv} 浏览 · ${reaction.follow_num} 关注 · ${reaction.answer_num} 回答`
      : ('target_source' in item ? item.target_source?.sub_text : undefined) ||
        `${question.follow_num || 0} 关注`;

    return (
      <BouncyButton
        onPress={() => router.push(`/question/write/${questionId}`)}
        className="px-5 py-4 border-b"
        style={{ borderBottomColor: borderCol }}
      >
        <Text
          className="text-base font-bold mb-2 leading-6"
          style={{ color: textColor }}
        >
          {question.title}
        </Text>
        <Text className="text-xs" style={{ color: secondaryColor }}>
          {subText}
        </Text>
      </BouncyButton>
    );
  };

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '写回答' }} />
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <GlassNavigationButton
          icon="close"
          accessibilityLabel="关闭"
          onPress={() => router.back()}
          size={40}
          color={textColor}
        />
        <Text className="text-lg font-bold">写回答</Text>
        <View className="w-10" />
      </View>

      {/* Tabs */}
      <View
        className="flex-row px-5 border-b"
        style={{ borderBottomColor: borderCol }}
      >
        <BouncyButton
          onPress={() => setActiveTab('search')}
          className="py-3 mr-6"
          style={{
            borderBottomWidth: 2,
            borderBottomColor:
              activeTab === 'search' ? tintColor : 'transparent',
          }}
        >
          <Text
            style={{
              color: activeTab === 'search' ? tintColor : secondaryColor,
              fontWeight: activeTab === 'search' ? 'bold' : 'normal',
            }}
          >
            搜索问题
          </Text>
        </BouncyButton>
        <BouncyButton
          onPress={() => setActiveTab('invite')}
          className="py-3"
          style={{
            borderBottomWidth: 2,
            borderBottomColor:
              activeTab === 'invite' ? tintColor : 'transparent',
          }}
        >
          <Text
            style={{
              color: activeTab === 'invite' ? tintColor : secondaryColor,
              fontWeight: activeTab === 'invite' ? 'bold' : 'normal',
            }}
          >
            邀请回答
          </Text>
        </BouncyButton>
      </View>

      {activeTab === 'search' ? (
        <View className="flex-1">
          <View className="px-5 py-3">
            <View
              className="flex-row items-center px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: `${borderCol}30` }}
            >
              <Ionicons name="search" size={18} color={secondaryColor} />
              <TextInput
                placeholder="搜索你想回答的问题..."
                placeholderTextColor={secondaryColor}
                className="flex-1 text-base ml-2"
                style={{ color: textColor }}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {query.trim() && searchPending ? (
                <ActivityIndicator
                  size="small"
                  color={tintColor}
                  className="ml-2"
                />
              ) : null}
            </View>
          </View>
          <FlatList
            data={searchItems}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            renderItem={renderQuestionItem}
            keyExtractor={(item) => getPublishingQuestionId(item) ?? ''}
            ListEmptyComponent={() =>
              query.trim() && searchPending ? null : query.trim() &&
                searchError ? (
                <QueryErrorView
                  message="问题搜索失败"
                  onRetry={() => void retrySearch()}
                />
              ) : (
                <View className="flex-1 justify-center items-center mt-20 px-10">
                  <Ionicons name="search-outline" size={64} color={borderCol} />
                  <Text
                    className="text-center mt-4"
                    style={{ color: secondaryColor }}
                  >
                    {query.trim()
                      ? '没有找到相关问题喵'
                      : '试着搜索一些你感兴趣的话题吧'}
                  </Text>
                </View>
              )
            }
          />
        </View>
      ) : (
        <View className="flex-1">
          {isInvitedLoading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color={tintColor} />
            </View>
          ) : (
            <FlatList
              data={invitedItems}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={renderQuestionItem}
              keyExtractor={(item) => getPublishingQuestionId(item) ?? ''}
              ListEmptyComponent={() =>
                invitedError ? (
                  <QueryErrorView
                    message="回答邀请加载失败"
                    onRetry={() => void retryInvited()}
                  />
                ) : (
                  <View className="flex-1 justify-center items-center mt-20 px-10">
                    <Ionicons name="mail-outline" size={64} color={borderCol} />
                    <Text
                      className="text-center mt-4"
                      style={{ color: secondaryColor }}
                    >
                      暂时没有收到回答邀请喵
                    </Text>
                  </View>
                )
              }
            />
          )}
        </View>
      )}
    </View>
  );
}
