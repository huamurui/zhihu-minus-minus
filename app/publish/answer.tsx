import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getInvitedQuestions, searchCreatorQuestions } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PublishAnswerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;
  const _backgroundColor = Colors[colorScheme].background;

  const [activeTab, setActiveTab] = useState<'search' | 'invite'>('search');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['creator-search', debouncedQuery],
    queryFn: () => searchCreatorQuestions(debouncedQuery),
    enabled: debouncedQuery.length > 0 && activeTab === 'search',
  });

  const { data: invitedResults, isLoading: isInvitedLoading } = useQuery({
    queryKey: ['invited-questions'],
    queryFn: () => getInvitedQuestions(),
    enabled: activeTab === 'invite',
  });

  const renderQuestionItem = ({ item }: { item: any }) => {
    // Check if it's an invitation item
    if (item.content?.text) {
      const {
        title: inviter,
        sub_title: inviteMsg,
        text: qTitle,
        target_link,
      } = item.content;
      const questionId = target_link?.split('/').pop();

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

    const question = item.question || item.target || item.extra?.data;
    if (!question) return null;

    const reaction = item.reaction || {};
    const subText = reaction.pv
      ? `${reaction.pv} 浏览 · ${reaction.follow_num} 关注 · ${reaction.answer_num} 回答`
      : item.target_source?.sub_text || `${question.follow_num || 0} 关注`;

    return (
      <BouncyButton
        onPress={() => router.push(`/question/write/${question.id}`)}
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
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <BouncyButton
          onPress={() => router.back()}
          className="p-2 rounded-full"
        >
          <Ionicons name="close" size={28} color={textColor} />
        </BouncyButton>
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
              {isSearching && (
                <ActivityIndicator
                  size="small"
                  color={tintColor}
                  className="ml-2"
                />
              )}
            </View>
          </View>
          <FlatList
            data={searchResults?.data || []}
            renderItem={renderQuestionItem}
            keyExtractor={(_item, index) => index.toString()}
            ListEmptyComponent={() => (
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
            )}
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
              data={invitedResults?.data || []}
              renderItem={renderQuestionItem}
              keyExtractor={(_item, index) => index.toString()}
              ListEmptyComponent={() => (
                <View className="flex-1 justify-center items-center mt-20 px-10">
                  <Ionicons name="mail-outline" size={64} color={borderCol} />
                  <Text
                    className="text-center mt-4"
                    style={{ color: secondaryColor }}
                  >
                    暂时没有收到回答邀请喵
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}
