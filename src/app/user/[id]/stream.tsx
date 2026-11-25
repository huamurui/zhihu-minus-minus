import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import PagerView, { type PagerViewRef } from 'react-native-pager-view';
import type { RecentMomentsResponse } from '@/api/zhihu';
import { PublishedStreamHeader } from '@/components/profile/PublishedStreamHeader';
import { UserPublishedStream } from '@/components/profile/UserPublishedStream';
import { useMarkRecentMomentRead } from '@/hooks/useMarkRecentMomentRead';
import { createRecentMomentStream } from '@/utils/recentMomentStream';

type StreamParams = {
  id: string;
  unreadCount?: string;
  source?: string;
};

function UserStreamPager({ id, unreadCount, source }: StreamParams) {
  const queryClient = useQueryClient();
  // Keep the entry order stable while read receipts/refetches update the strip.
  const [stream] = useState(() =>
    createRecentMomentStream(
      id,
      unreadCount,
      source === 'recent-moments'
        ? queryClient.getQueryData<RecentMomentsResponse>(['recent-moments'])
            ?.data
        : undefined,
    ),
  );
  const [currentPage, setCurrentPage] = useState(stream.initialPage);
  const [visitedPages, setVisitedPages] = useState(
    () => new Set([stream.initialPage]),
  );
  const pagerRef = useRef<PagerViewRef>(null);
  const markRead = useMarkRecentMomentRead();
  const currentEntry = stream.entries[currentPage];

  useEffect(() => {
    if (currentEntry?.moment) markRead(currentEntry.moment);
  }, [currentEntry, markRead]);

  const goToPage = (index: number) => {
    if (stream.entries[index]) pagerRef.current?.setPage(index);
  };

  return (
    <View className="flex-1 bg-base">
      <Stack.Screen options={{ headerShown: false, title: '最近发布' }} />
      <PublishedStreamHeader
        id={currentEntry.id}
        actor={currentEntry.moment?.actor}
        page={currentPage}
        total={stream.entries.length}
        goToPage={goToPage}
      />
      <PagerView
        ref={pagerRef}
        testID="recent-moment-pager"
        style={{ flex: 1 }}
        initialPage={stream.initialPage}
        scrollEnabled={stream.entries.length > 1}
        offscreenPageLimit={1}
        onPageSelected={({ nativeEvent: { position } }) => {
          if (!Number.isInteger(position) || !stream.entries[position]) return;
          setCurrentPage(position);
          setVisitedPages((pages) => {
            if (pages.has(position)) return pages;
            return new Set(pages).add(position);
          });
        }}
      >
        {stream.entries.map((entry, index) => (
          <View
            key={entry.id}
            style={{ flex: 1 }}
            collapsable={false}
            accessibilityElementsHidden={index !== currentPage}
            importantForAccessibility={
              index === currentPage ? 'auto' : 'no-hide-descendants'
            }
          >
            {visitedPages.has(index) || Math.abs(index - currentPage) <= 1 ? (
              <UserPublishedStream
                id={entry.id}
                unreadCount={entry.unreadCount}
                isActive={index === currentPage}
                enabled={Math.abs(index - currentPage) <= 1}
              />
            ) : null}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

export default function UserStreamScreen() {
  const params = useLocalSearchParams<StreamParams>();
  return (
    <UserStreamPager key={`${params.source ?? ''}:${params.id}`} {...params} />
  );
}
