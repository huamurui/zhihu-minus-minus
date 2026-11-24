import {
  type MutationFilters,
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { hasAuthenticationCookie } from '@/api/client';
import {
  fastCollectAnswer,
  fastCollectArticle,
  getAllContentCollectionStatus,
  removeArticleFromCollection,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast as baseShowToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

function collectionMutationKey(session: number) {
  return ['content-collection-action', session] as const;
}

function collectionMutationFilters(
  session: number,
  type: 'answer' | 'article' | null,
  id: string | number,
): MutationFilters {
  return {
    mutationKey: collectionMutationKey(session),
    exact: true,
    predicate: ({ state: { variables } }) =>
      variables != null &&
      typeof variables === 'object' &&
      'type' in variables &&
      variables.type === type &&
      'id' in variables &&
      String(variables.id) === String(id),
  };
}

export function useCollectionActionPending(
  session: number,
  type: 'answer' | 'article' | null,
  id: string | number,
) {
  return useIsMutating(collectionMutationFilters(session, type, id)) > 0;
}

export function useCollectionAction() {
  const router = useRouter();
  const showToast = useCollectionStore((state) => state.showToast);
  const setCollectedStatus = useCollectionStore(
    (state) => state.setCollectedStatus,
  );
  const updateCollectedCountOffset = useCollectionStore(
    (state) => state.updateCollectedCountOffset,
  );
  const queryClient = useQueryClient();
  const session = getAuthSessionVersion();

  const collectMutation = useMutation({
    mutationKey: collectionMutationKey(session),
    mutationFn: async ({
      id,
      type,
    }: {
      id: string | number;
      type: 'answer' | 'article';
    }) => {
      if (type === 'answer') {
        return fastCollectAnswer(id);
      } else {
        return fastCollectArticle(id);
      }
    },
    onMutate: () => ({ sessionVersion: getAuthSessionVersion() }),
    onSuccess: (res, variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      const idStr = variables.id.toString();
      const wasCollected =
        useCollectionStore.getState().collectedStatusMap[idStr];
      setCollectedStatus(idStr, true);
      if (wasCollected !== true) updateCollectedCountOffset(idStr, 1);
      updateContentInteractionCaches(queryClient, {
        type: variables.type === 'answer' ? 'answers' : 'articles',
        id: variables.id,
        isCollected: true,
      });

      // Invalidate queries so detail views sync
      queryClient.invalidateQueries({
        queryKey: ['answer-collection-status', idStr],
      });
      queryClient.invalidateQueries({
        queryKey: ['article-collection-status', idStr],
      });

      const folderName = res?.collection?.title || '默认收藏夹';
      showToast(variables.id, variables.type, `已收藏到「${folderName}」`);
    },
    onError: (err: unknown, _variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      baseShowToast(getZhihuErrorMessage(err) || '收藏失败');
    },
  });

  const uncollectMutation = useMutation({
    mutationKey: collectionMutationKey(session),
    mutationFn: async ({
      id,
      type,
    }: {
      id: string | number;
      type: 'answer' | 'article';
    }) => {
      const sessionVersion = getAuthSessionVersion();
      // 1. 获取当前收藏状态以知道它在哪些收藏夹里
      const statusRes = await getAllContentCollectionStatus(id, type);
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new Error('登录状态已改变');
      }

      const favoritedFolders =
        statusRes?.data?.filter((item) => item.is_favorited) || [];

      // 2. 从所有收藏了它的收藏夹中移除
      const promises = favoritedFolders.map((folder) => {
        if (type === 'answer') {
          return removeFromCollection(folder.id, id);
        } else {
          return removeArticleFromCollection(folder.id, id);
        }
      });

      await Promise.all(promises);
      return favoritedFolders;
    },
    onMutate: () => ({ sessionVersion: getAuthSessionVersion() }),
    onSuccess: (removedFolders, variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      const idStr = variables.id.toString();
      const wasCollected =
        useCollectionStore.getState().collectedStatusMap[idStr];
      setCollectedStatus(idStr, false);
      if (wasCollected !== false) updateCollectedCountOffset(idStr, -1);
      updateContentInteractionCaches(queryClient, {
        type: variables.type === 'answer' ? 'answers' : 'articles',
        id: variables.id,
        isCollected: false,
      });

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: ['answer-collection-status', idStr],
      });
      queryClient.invalidateQueries({
        queryKey: ['article-collection-status', idStr],
      });

      const foldersStr = removedFolders
        .map((folder) => folder.title)
        .join('、');
      baseShowToast(foldersStr ? `已从「${foldersStr}」中移出` : '已取消收藏');
    },
    onError: (err: unknown, _variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      baseShowToast(getZhihuErrorMessage(err) || '取消收藏失败');
    },
  });

  const handleCollect = (
    id: string | number,
    type: 'answer' | 'article',
    isCurrentlyCollected: boolean,
  ) => {
    if (!hasAuthenticationCookie(useAuthStore.getState().cookies)) {
      router.push('/login');
      return;
    }
    if (
      session !== getAuthSessionVersion() ||
      queryClient.isMutating(collectionMutationFilters(session, type, id))
    )
      return;
    if (isCurrentlyCollected) {
      uncollectMutation.mutate({ id, type });
    } else {
      collectMutation.mutate({ id, type });
    }
  };

  return {
    collect: (id: string | number, type: 'answer' | 'article') =>
      collectMutation.mutate({ id, type }),
    uncollect: (id: string | number, type: 'answer' | 'article') =>
      uncollectMutation.mutate({ id, type }),
    toggleCollect: handleCollect,
    isPending: collectMutation.isPending || uncollectMutation.isPending,
  };
}
