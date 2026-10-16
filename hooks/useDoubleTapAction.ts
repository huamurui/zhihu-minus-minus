import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { getVoteSuccessMessage, voteContent } from '@/api/zhihu';
import {
  type CachedContentType,
  updateContentInteractionCaches,
} from '@/utils/contentCache';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export interface DoubleTapActionOptions {
  id: string;
  type: CachedContentType;
  voted?: number;
  count?: number;
  enabled?: boolean;
}

/**
 * Double-tap handler for answer / article / pin bodies. Upvoting is one-way
 * here: a double tap on already-upvoted content only gives feedback and never
 * cancels. The write goes through `updateContentInteractionCaches`, the same
 * path as `LikeButton`, so the floating vote capsule follows the shared cache.
 */
export function useDoubleTapAction({
  id,
  type,
  voted = 0,
  count = 0,
  enabled = true,
}: DoubleTapActionOptions) {
  const queryClient = useQueryClient();
  const pendingRef = useRef(false);
  // Latest values without rebuilding the gesture on every render.
  const stateRef = useRef({ id, voted, count });
  stateRef.current = { id, voted, count };

  const trigger = useCallback(async () => {
    if (pendingRef.current) return;
    const current = stateRef.current;
    pendingRef.current = true;
    try {
      await impactAsync(ImpactFeedbackStyle.Light);
      if (current.voted === 1) return; // 已点赞：只反馈，不取消。

      const result = await voteContent(current.id, type, 'up');
      const voteCount =
        result.voteCount ??
        Math.max(0, current.count + (result.voted === 1 ? 1 : 0));
      updateContentInteractionCaches(queryClient, {
        type,
        id: current.id,
        voted: result.voted,
        voteCount,
      });
      showToast(getVoteSuccessMessage(type, current.voted, result.voted));
    } catch (error: unknown) {
      showToast(getZhihuErrorMessage(error));
    } finally {
      pendingRef.current = false;
    }
  }, [queryClient, type]);

  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .enabled(enabled)
        .onEnd((_event, success) => {
          if (success) void trigger();
        }),
    [enabled, trigger],
  );

  return { gesture };
}
