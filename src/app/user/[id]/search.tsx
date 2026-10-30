import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  TextInput,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type FeedItem, getMemberWithFallback } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { toProfileSearchFeedItem } from '@/components/profile/profileSearchResults';
import { useProfileSearch } from '@/components/profile/useProfileSearch';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import { useListPreload } from '@/hooks/useListPreload';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  type AnswerReadingContext,
  getProfileAnswerReadingContext,
} from '@/utils/answerReadingContext';

export default function UserSearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProfileSearchScreen key={id} id={id} />;
}

function ProfileSearchScreen({ id }: { id: string }) {
  const router = useRouter();
  const listPreload = useListPreload(0.5);
  const insets = useSafeAreaInsets();
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const inputRef = useRef<TextInputInstance>(null);
  const paginationPending = useRef(false);
  const refreshPending = useRef(false);
  const memberQuery = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
    enabled: Boolean(id),
  });
  const member = memberQuery.data;
  const search = useProfileSearch(member?.id);
  const hasQuery = search.query.trim().length > 0;
  const { items, answerContexts } = useMemo(() => {
    const answerContexts = new Map<string, AnswerReadingContext>();
    if (!member || search.pending || !hasQuery)
      return { items: [], answerContexts };
    const seen = new Set<string>();
    const items = (search.data?.pages || []).flatMap((page) =>
      page.data.flatMap((result) => {
        const item = toProfileSearchFeedItem(result, member, colors.link);
        if (!item) return [];
        const key = `${item.type}-${item.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        answerContexts.set(
          key,
          getProfileAnswerReadingContext(
            result.object.author ?? {},
            member,
            id,
          ),
        );
        return [item];
      }),
    );
    return { items, answerContexts };
  }, [colors.link, hasQuery, id, member, search.data, search.pending]);

  const loadMore = (retry = false) => {
    if (
      search.pending ||
      !hasQuery ||
      !search.hasNextPage ||
      search.isFetching ||
      search.refreshing ||
      refreshPending.current ||
      paginationPending.current ||
      (!retry && search.isFetchNextPageError)
    )
      return;
    paginationPending.current = true;
    void search
      .fetchNextPage()
      .catch(() => undefined)
      .finally(() => {
        paginationPending.current = false;
      });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false, title: '搜索用户创作' }} />
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 10,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        }}
      >
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="返回个人主页"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace({ pathname: '/user/[id]', params: { id } })
          }
          style={{ padding: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </BouncyButton>
        <View
          style={{
            flex: 1,
            minHeight: 42,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 22,
            paddingHorizontal: 12,
            backgroundColor: colors.backgroundTertiary,
          }}
        >
          <Ionicons name="search" size={17} color={colors.textTertiary} />
          <TextInput
            ref={inputRef}
            autoFocus
            accessibilityLabel="搜索此用户的创作"
            placeholder={`搜索 ${member?.name || '用户'} 的创作...`}
            placeholderTextColor={colors.textTertiary}
            value={search.query}
            onChangeText={search.setQuery}
            onSubmitEditing={() => {
              search.submit();
              Keyboard.dismiss();
            }}
            returnKeyType="search"
            style={{
              flex: 1,
              paddingHorizontal: 8,
              paddingVertical: 10,
              fontSize: 14 * fontSizeScale,
              color: colors.text,
              textAlignVertical: 'center',
            }}
          />
          {search.query.length > 0 && (
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel="清空搜索"
              onPress={() => {
                search.clear();
                inputRef.current?.focus();
              }}
              style={{ padding: 6 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </BouncyButton>
          )}
        </View>
      </View>
      {memberQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : !member ? (
        <QueryErrorView
          message="用户资料加载失败"
          onRetry={() => void memberQuery.refetch()}
        />
      ) : !hasQuery ? (
        <Text type="secondary" style={{ textAlign: 'center', marginTop: 48 }}>
          输入关键词，搜索这位用户的创作
        </Text>
      ) : (
        <FlashList<FeedItem>
          key={search.searchTerm}
          data={items}
          keyExtractor={(item) => `user-search-${item.type}-${item.id}`}
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              answerContext={answerContexts.get(`${item.type}-${item.id}`)}
            />
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onEndReached={() => loadMore()}
          {...listPreload}
          refreshing={search.refreshing}
          onRefresh={() => {
            if (search.pending || refreshPending.current) return;
            refreshPending.current = true;
            void search
              .refresh()
              .catch(() => undefined)
              .finally(() => {
                refreshPending.current = false;
              });
          }}
          ListEmptyComponent={
            search.pending || search.isLoading ? (
              <ActivityIndicator
                accessibilityLabel="正在搜索"
                style={{ marginTop: 48 }}
                color={colors.primary}
              />
            ) : search.isError ? (
              <QueryErrorView
                message="搜索失败，请重试"
                onRetry={() => void search.refetch()}
              />
            ) : (
              <Text
                type="secondary"
                style={{ textAlign: 'center', marginTop: 48 }}
              >
                没有找到相关创作
              </Text>
            )
          }
          ListFooterComponent={
            search.pending ? null : search.isFetchingNextPage ? (
              <ActivityIndicator
                style={{ margin: 20 }}
                color={colors.primary}
              />
            ) : search.isFetchNextPageError ? (
              <QueryErrorView
                message="更多结果加载失败"
                onRetry={() => loadMore(true)}
                compact
              />
            ) : items.length > 0 && !search.hasNextPage ? (
              <Text
                type="secondary"
                style={{ textAlign: 'center', padding: 20, fontSize: 12 }}
              >
                已显示全部结果
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}
