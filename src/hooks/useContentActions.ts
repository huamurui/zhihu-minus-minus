import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { hasAuthenticationCookie } from '@/api/client';
import { getAllContentCollectionStatus } from '@/api/zhihu/collection';
import type { ActionSheetOption } from '@/components/overlays/ActionSheet';
import { useThemeColor } from '@/components/Themed';
import {
  contentExportHref,
  EXPORT_CONTENT_LABELS,
  parseExportTarget,
} from '@/features/content-export/entry';
import {
  useCollectionAction,
  useCollectionActionPending,
} from '@/hooks/useCollectionAction';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { copyToClipboard } from '@/utils/clipboard';
import {
  buildContentShareText,
  type ContentShareData,
  type ContentShareType,
  resolveContentShareUrl,
  shareContent,
} from '@/utils/contentActions';
import { showToast } from '@/utils/toast';

interface ContentActionsOptions {
  type: ContentShareType;
  data: ContentShareData | null;
  enabled?: boolean;
  additionalOptions?: ActionSheetOption[];
}

/** One action list for the more sheet and the card's long-press preview. */
export function useContentActions({
  type,
  data,
  enabled = true,
  additionalOptions = [],
}: ContentActionsOptions) {
  const warning = useThemeColor({}, 'warning');
  const cookies = useAuthStore((state) => state.cookies);
  const authenticated = hasAuthenticationCookie(cookies);
  const actionSession = getAuthSessionVersion();
  const id = data ? String(data.id) : '';
  const storedCollected = useCollectionStore((state) =>
    id ? state.collectedStatusMap[id] : undefined,
  );
  const collectionType = type === 'answer' || type === 'article' ? type : null;
  const knownCollected = storedCollected ?? data?.isCollected;
  const { toggleCollect } = useCollectionAction();
  const collectionPending = useCollectionActionPending(
    actionSession,
    collectionType,
    id,
  );
  const collectionStatus = useQuery({
    queryKey: [
      collectionType
        ? `${collectionType}-collection-status`
        : 'content-menu-collection-status',
      id,
    ],
    queryFn: async () => {
      if (!collectionType) throw new Error('该内容不支持收藏');
      const session = getAuthSessionVersion();
      const status = await getAllContentCollectionStatus(id, collectionType);
      if (session !== getAuthSessionVersion())
        throw new Error('登录状态已改变');
      return status;
    },
    enabled:
      enabled &&
      !!id &&
      !!collectionType &&
      authenticated &&
      knownCollected === undefined,
    staleTime: 60 * 1000,
  });
  const fetchedCollected = collectionStatus.data?.data?.some(
    (folder) => folder.is_favorited,
  );
  const collected = knownCollected ?? fetchedCollected;
  const awaitingCollection = authenticated && collected === undefined;
  const link = data ? resolveContentShareUrl(type, data) : '';
  const actions: ActionSheetOption[] = [];

  if (data && collectionType) {
    actions.push({
      key: 'collection',
      icon: 'star',
      iconFamily: 'collection-star',
      iconSolid: collected === true,
      label: awaitingCollection
        ? collectionStatus.isError
          ? '重试获取收藏状态'
          : '正在读取收藏状态…'
        : collected
          ? '取消收藏'
          : '收藏',
      color: collected ? warning : undefined,
      disabled:
        collectionPending || (awaitingCollection && !collectionStatus.isError),
      onPress: () => {
        if (actionSession !== getAuthSessionVersion()) return;
        if (collectionPending) return;
        if (awaitingCollection) {
          void collectionStatus.refetch();
          return;
        }
        toggleCollect(data.id, collectionType, collected === true);
      },
    });
  }
  if (data) {
    const exportTarget = parseExportTarget(type, id, actionSession);
    if (exportTarget) {
      actions.push({
        key: 'export-content',
        icon: 'download-outline',
        label: `导出${EXPORT_CONTENT_LABELS[exportTarget.type]}…`,
        onPress: () => {
          if (actionSession !== getAuthSessionVersion()) return;
          router.push(contentExportHref(exportTarget));
        },
      });
    }
    actions.push(
      {
        key: 'system-share',
        icon: 'share-outline',
        label: '系统分享链接',
        disabled: !link,
        onPress: () => shareContent(type, data, 'link'),
      },
      {
        key: 'share-information',
        icon: 'share-outline',
        label: '分享标题与链接',
        disabled: !link,
        onPress: () => shareContent(type, data, 'information'),
      },
      {
        key: 'copy-link',
        icon: 'link-outline',
        label: '复制链接',
        disabled: !link,
        onPress: async () => {
          if (await copyToClipboard(link)) showToast('链接已复制');
        },
      },
      {
        key: 'copy-markdown',
        icon: 'logo-markdown',
        label: '复制信息（Markdown）',
        disabled: !link,
        onPress: async () => {
          if (
            await copyToClipboard(buildContentShareText(type, data, 'markdown'))
          )
            showToast('Markdown 已复制');
        },
      },
    );
  }
  return {
    actions: [...actions, ...additionalOptions],
    actionContextKey: `${type}:${id}:${actionSession}`,
  };
}
