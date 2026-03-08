import { getNotifications } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';

export default function NotificationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const primaryColor = '#0084ff';
  const borderColor = useThemeColor({}, 'border');

  useEffect(() => {
    navigation.setOptions({ title: '消息通知' });
  }, [navigation]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam = '' }) => getNotifications(pageParam as string),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    }
  });

  const notifications = data?.pages.flatMap(page => page.data) || [];

  const renderIcon = (type: string) => {
    switch (type) {
      case 'MOMENT_VOTE_UP_ANSWER':
      case 'VOTE_UP_ANSWER':
      case 'VOTE_UP_ARTICLE':
        return <Ionicons name="heart" size={18} color="#f44336" />;
      case 'ANSWER_COMMENT':
      case 'ARTICLE_COMMENT':
      case 'COMMENT_REPLY':
        return <Ionicons name="chatbubble" size={18} color="#0084ff" />;
      case 'FOLLOW_USER':
        return <Ionicons name="person-add" size={18} color="#4caf50" />;
      default:
        return <Ionicons name="notifications" size={18} color="#888" />;
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const actor = item.actors?.[0] || {};
    const target = item.target || {};
    const time = new Date(item.created * 1000).toLocaleString();

    return (
      <Pressable
        style={({ pressed }) => [styles.card, { borderBottomColor: borderColor }, pressed && { opacity: 0.7 }]}
        onPress={() => {
          if (target.type === 'answer') {
            router.push(`/answer/${target.id}`);
          } else if (target.type === 'article') {
            router.push(`/article/${target.id}`);
          } else if (target.type === 'member') {
            router.push(`/user/${target.id}`);
          }
        }}
      >
        <Image source={{ uri: actor.avatar_url }} style={styles.avatar} />
        <View style={[styles.content, { backgroundColor: 'transparent' }]}>
          <View style={[styles.titleRow, { backgroundColor: 'transparent' }]}>
            <Text style={styles.actorName}>{actor.name}</Text>
            <View style={styles.badge}>{renderIcon(item.verb)}</View>
          </View>
          <Text style={styles.actionText}>
            {typeof item.content === 'string'
              ? item.content
              : (item.content?.text || item.content?.title || item.content?.sub_text || '新的动态')}
          </Text>
          <Text type="secondary" style={styles.time}>{time}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlashList
        data={notifications}
        renderItem={renderItem}
        {...({ estimatedItemSize: 100 } as any)}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Text type="secondary">暂无通知喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() => (
          isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={primaryColor} /> : null
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { flexDirection: 'row', padding: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  content: { marginLeft: 12, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actorName: { fontWeight: 'bold', fontSize: 16 },
  badge: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  time: { fontSize: 12, marginTop: 6 },
  empty: { flex: 1, padding: 100, alignItems: 'center' }
});