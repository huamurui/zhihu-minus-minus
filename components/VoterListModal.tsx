import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import type { ZhihuVoter, ZhihuVotersResponse } from '@/api/zhihu/voters';
import { getAnswerVoters, getPinVoters } from '@/api/zhihu/voters';
import { BouncyButton } from '@/components/BouncyButton';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface VoterListModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: 'answer' | 'pin';
  contentId: string | number;
  count?: number;
}

function getNextOffset(
  lastPage: ZhihuVotersResponse,
  pages: ZhihuVotersResponse[],
): number | undefined {
  if (lastPage.paging?.is_end) return undefined;
  const match = lastPage.paging?.next?.match(/offset=(\d+)/);
  if (match) return Number(match[1]);
  const loadedCount = pages.reduce(
    (total, page) => total + page.data.length,
    0,
  );
  return lastPage.data.length > 0 ? loadedCount : undefined;
}

export function VoterListModal({
  visible,
  onClose,
  contentType,
  contentId,
  count,
}: VoterListModalProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const query = useInfiniteQuery({
    queryKey: ['voters', contentType, String(contentId)],
    queryFn: ({ pageParam = 0 }) =>
      contentType === 'answer'
        ? getAnswerVoters(contentId, 20, pageParam)
        : getPinVoters(contentId, 20, pageParam),
    initialPageParam: 0,
    enabled: visible,
    getNextPageParam: (lastPage, pages) => getNextOffset(lastPage, pages),
  });

  const voters = query.data?.pages.flatMap((page) => page.data) ?? [];
  const uniqueVoters = voters.filter(
    (voter, index, list) =>
      list.findIndex((item) => String(item.id) === String(voter.id)) === index,
  );

  const renderVoter = ({ item }: { item: ZhihuVoter }) => {
    const userToken = item.url_token || item.id;
    return (
      <BouncyButton
        className="flex-row items-center px-5 py-3"
        onPress={() => {
          onClose();
          router.push(`/user/${userToken}`);
        }}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              { backgroundColor: Colors[colorScheme].border },
            ]}
          />
        )}
        <View className="flex-1 ml-3 bg-transparent">
          <Text className="font-semibold" numberOfLines={1}>
            {item.name}
          </Text>
          {item.headline ? (
            <Text type="secondary" className="text-xs mt-0.5" numberOfLines={1}>
              {item.headline}
            </Text>
          ) : null}
        </View>
      </BouncyButton>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="赞同者"
      subtitle={typeof count === 'number' ? `${count} 人赞同` : undefined}
      height="72%"
    >
      {query.isLoading ? (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : query.isError ? (
        <View className="items-center justify-center px-5 py-12">
          <Text type="secondary">赞同者暂时加载失败</Text>
          <BouncyButton
            className="mt-3 px-4 py-2 rounded-full"
            style={{ backgroundColor: Colors[colorScheme].primaryTransparent }}
            onPress={() => void query.refetch()}
          >
            <Text style={{ color: primaryColor }}>重试</Text>
          </BouncyButton>
        </View>
      ) : (
        <FlashList
          data={uniqueVoters}
          renderItem={renderVoter}
          keyExtractor={(item) => String(item.id)}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.45}
          ListEmptyComponent={
            <View className="items-center py-12">
              <Text type="secondary">还没有公开的赞同者</Text>
            </View>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator color={primaryColor} style={styles.footer} />
            ) : null
          }
          {...({ estimatedItemSize: 68 } as object)}
        />
      )}
      <Text type="tertiary" className="px-5 py-2 text-center text-xs">
        赞同者列表由知乎接口返回，可能受隐私设置影响
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  footer: {
    paddingVertical: 16,
  },
});
