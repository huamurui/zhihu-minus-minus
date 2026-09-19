import { useMutation } from '@tanstack/react-query';
import { likeAnswer, likeArticle } from '@/api/zhihu/like';
import { useLikeStore } from '@/store/useLikeStore';
import { showToast } from '@/utils/toast';

type LikeVariables = {
  id: string | number;
  type: 'answer' | 'article';
  previousLiked: boolean;
};

export function useLikeAction() {
  const setLikedStatus = useLikeStore((state) => state.setLikedStatus);

  const mutation = useMutation({
    mutationFn: ({ id, type }: LikeVariables) => {
      if (type === 'answer') return likeAnswer(id);
      return likeArticle(id);
    },
    onError: (_error, variables) => {
      // 失败回滚到点击前的状态，避免本地乐观更新残留错误状态。
      setLikedStatus(variables.id, variables.previousLiked);
      showToast('喜欢操作失败，请稍后重试');
    },
  });

  const toggleLike = (
    id: string | number,
    type: 'answer' | 'article',
    previousLiked: boolean,
  ) => {
    const next = !previousLiked;
    setLikedStatus(id, next);
    mutation.mutate({ id, type, previousLiked });
  };

  return { toggleLike, isPending: mutation.isPending };
}
