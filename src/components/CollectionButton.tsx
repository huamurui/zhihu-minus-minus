import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet } from 'react-native';
import { hasAuthenticationCookie } from '@/api/client';
import { getAllContentCollectionStatus } from '@/api/zhihu/collection';
import { ActionIconCount } from '@/components/ActionIconCount';
import { CollectionStarIcon } from '@/components/CollectionStarIcon';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { ContentActionButton } from '@/components/ContentActionButton';
import { Text, useThemeColor } from '@/components/Themed';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

interface CollectionButtonProps {
  id: string | number;
  type: 'answer' | 'article';
  isCollected?: boolean;
  count?: number;
  compact?: boolean;
  countDisplay?: 'inline' | 'corner';
  variant?: 'inline' | 'floating';
  disabled?: boolean;
}

/** Resolve unknown collection state on demand instead of querying every card. */
export function CollectionButton({
  id,
  type,
  isCollected,
  count,
  compact = false,
  countDisplay = 'inline',
  variant = 'floating',
  disabled = false,
}: CollectionButtonProps) {
  const queryClient = useQueryClient();
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const warningColor = useThemeColor({}, 'warning');
  const cookies = useAuthStore((state) => state.cookies);
  const sessionVersion = getAuthSessionVersion();
  const storedCollected = useCollectionStore(
    (state) => state.collectedStatusMap[String(id)],
  );
  const collected = storedCollected ?? isCollected;
  const collectionCount =
    typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? Math.floor(count)
      : undefined;
  const countLabel =
    collectionCount !== undefined && collectionCount >= 10000
      ? `${(collectionCount / 10000).toFixed(1).replace(/\.0$/, '')}万`
      : collectionCount;
  const color = useContentActionBarColor(
    collected ? warningColor : secondaryColor,
  );
  const { toggleCollect, isPending } = useCollectionAction();
  const identity = `${type}:${id}:${sessionVersion}`;
  const targetRef = useRef({ identity });
  if (targetRef.current.identity !== identity) targetRef.current = { identity };
  const target = targetRef.current;
  const inFlight = useRef<typeof target | null>(null);
  const [pendingTarget, setPendingTarget] = useState<typeof target | null>(
    null,
  );
  const mounted = useRef(true);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resolving = pendingTarget === target;
  const busy = resolving || isPending;
  const handlePress = async (event: GestureResponderEvent) => {
    event?.stopPropagation();
    if (
      !mounted.current ||
      disabledRef.current ||
      isPending ||
      inFlight.current === target ||
      targetRef.current !== target ||
      sessionVersion !== getAuthSessionVersion()
    )
      return;

    const latestCollected =
      useCollectionStore.getState().collectedStatusMap[String(id)] ??
      isCollected;
    if (!hasAuthenticationCookie(cookies)) {
      toggleCollect(id, type, latestCollected === true);
      return;
    }

    inFlight.current = target;
    const isCurrent = () =>
      mounted.current &&
      targetRef.current === target &&
      sessionVersion === getAuthSessionVersion() &&
      !disabledRef.current;
    try {
      let resolvedCollected = latestCollected;
      if (resolvedCollected === undefined) {
        setPendingTarget(target);
        const status = await queryClient.fetchQuery({
          queryKey: [`${type}-collection-status`, String(id)],
          queryFn: async () => {
            const result = await getAllContentCollectionStatus(id, type);
            if (sessionVersion !== getAuthSessionVersion())
              throw new Error('登录状态已改变');
            return result;
          },
          staleTime: 60 * 1000,
        });
        if (!isCurrent()) return;
        resolvedCollected =
          useCollectionStore.getState().collectedStatusMap[String(id)] ??
          status.data.some((folder) => folder.is_favorited);
        useCollectionStore.getState().setCollectedStatus(id, resolvedCollected);
      }
      if (!isCurrent()) return;
      // Keep the synchronous press guard until the mutation has been scheduled.
      await toggleCollect(id, type, resolvedCollected);
    } catch (error: unknown) {
      if (isCurrent())
        showToast(getZhihuErrorMessage(error) || '读取收藏状态失败');
    } finally {
      if (inFlight.current === target) inFlight.current = null;
      if (mounted.current)
        setPendingTarget((current) => (current === target ? null : current));
    }
  };

  return (
    <ContentActionButton
      accessibilityLabel={
        resolving ? '正在读取收藏状态…' : collected ? '取消收藏' : '收藏'
      }
      accessibilityState={{
        disabled: disabled || busy,
        busy,
        selected: collected === true,
      }}
      accessibilityValue={
        collectionCount === undefined
          ? undefined
          : { text: `${collectionCount} 次收藏` }
      }
      disabled={disabled || busy}
      onPress={(event) => void handlePress(event)}
      style={countDisplay === 'corner' ? styles.cornerButton : undefined}
    >
      {countDisplay === 'corner' ? (
        <ActionIconCount count={collectionCount} color={color}>
          <CollectionStarIcon
            filled={collected === true}
            size={24}
            color={color}
          />
        </ActionIconCount>
      ) : (
        <CollectionStarIcon
          filled={collected === true}
          size={variant === 'inline' ? 20 : 24}
          color={color}
        />
      )}
      {countDisplay === 'inline' &&
        !compact &&
        collectionCount !== undefined && (
          <Text
            style={[
              styles.count,
              variant === 'floating' && styles.floatingCount,
              { color },
            ]}
            numberOfLines={1}
          >
            {countLabel}
          </Text>
        )}
    </ContentActionButton>
  );
}

const styles = StyleSheet.create({
  cornerButton: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  count: { marginLeft: 4, fontSize: 13, fontWeight: '600' },
  floatingCount: { fontSize: 14 },
});
