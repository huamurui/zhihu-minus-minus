import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  fastCollectAnswer,
  fastCollectArticle,
  getAnswerCollectionStatus,
  getArticleCollectionStatus,
  removeArticleFromCollection,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast as baseShowToast } from '@/utils/toast';

export function useCollectionAction() {
  const router = useRouter();
  const { cookies } = useAuthStore();
  const showToast = useCollectionStore((state) => state.showToast);
  const setCollectedStatus = useCollectionStore(
    (state) => state.setCollectedStatus,
  );
  const updateCollectedCountOffset = useCollectionStore(
    (state) => state.updateCollectedCountOffset,
  );
  const queryClient = useQueryClient();

  const collectMutation = useMutation({
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
    onSuccess: (res, variables) => {
      const idStr = variables.id.toString();
      setCollectedStatus(idStr, true);
      updateCollectedCountOffset(idStr, 1);
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
    onError: (err: any) => {
      baseShowToast(err.response?.data?.error?.message || '收藏失败');
    },
  });

  const uncollectMutation = useMutation({
    mutationFn: async ({
      id,
      type,
    }: {
      id: string | number;
      type: 'answer' | 'article';
    }) => {
      // 1. 获取当前收藏状态以知道它在哪些收藏夹里
      const statusRes =
        type === 'answer'
          ? await getAnswerCollectionStatus(id)
          : await getArticleCollectionStatus(id);

      const favoritedFolders =
        statusRes?.data?.filter((item: any) => item.is_favorited) || [];

      // 2. 从所有收藏了它的收藏夹中移除
      const promises = favoritedFolders.map((folder: any) => {
        if (type === 'answer') {
          return removeFromCollection(folder.id, id);
        } else {
          return removeArticleFromCollection(folder.id, id);
        }
      });

      await Promise.all(promises);
      return favoritedFolders;
    },
    onSuccess: (removedFolders, variables) => {
      const idStr = variables.id.toString();
      setCollectedStatus(idStr, false);
      updateCollectedCountOffset(idStr, -1);
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

      const foldersStr = removedFolders.map((f: any) => f.title).join('、');
      baseShowToast(foldersStr ? `已从「${foldersStr}」中移出` : '已取消收藏');
    },
    onError: (err: any) => {
      baseShowToast(err.response?.data?.error?.message || '取消收藏失败');
    },
  });

  const handleCollect = (
    id: string | number,
    type: 'answer' | 'article',
    isCurrentlyCollected: boolean,
  ) => {
    if (!cookies) {
      router.push('/login' as any);
      return;
    }
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
