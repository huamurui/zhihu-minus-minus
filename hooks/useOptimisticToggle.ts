import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { showToast } from '@/utils/toast';

export interface UseOptimisticToggleOptions<TData = any> {
  queryKey?: QueryKey;
  mutationFn: () => Promise<any>;
  onUpdateCache?: (oldData: TData) => TData;
  successMessage?: ((isActive: boolean) => string) | string;
  errorMessage?: string;
  isActive?: boolean;
  onSuccessCallback?: () => void;
  invalidateQueries?: QueryKey[];
}

export function useOptimisticToggle<TData = any>({
  queryKey,
  mutationFn,
  onUpdateCache,
  successMessage,
  errorMessage = '操作失败，请稍后重试',
  isActive = false,
  onSuccessCallback,
  invalidateQueries,
}: UseOptimisticToggleOptions<TData>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async () => {
      if (!queryKey || !onUpdateCache) return { previous: undefined };

      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);

      if (previous) {
        queryClient.setQueryData<TData>(queryKey, onUpdateCache(previous));
      }

      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous && queryKey) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      showToast(errorMessage);
    },
    onSuccess: () => {
      if (successMessage) {
        const msg =
          typeof successMessage === 'function'
            ? successMessage(isActive)
            : successMessage;
        showToast(msg);
      }
      if (onSuccessCallback) onSuccessCallback();
    },
    onSettled: () => {
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }
      if (invalidateQueries) {
        invalidateQueries.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    },
  });
}
