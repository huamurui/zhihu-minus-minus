import type { QueryClient } from '@tanstack/react-query';
import { getAuthSessionVersion } from '@/store/useAuthStore';

export interface AnswerEndorsementsSource {
  id: string | number;
  endorsements?: unknown;
}

export function getAnswerEndorsementsKey(
  answerId: string,
  sessionVersion: number,
) {
  return ['answer-endorsements', sessionVersion, answerId] as const;
}

function identifier(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : '';
}

/** Clicked list metadata stays available without treating a thin entry as body content. */
export function seedAnswerEndorsements(
  queryClient: QueryClient,
  source: AnswerEndorsementsSource,
): void {
  const id = identifier(source.id);
  if (!id || !Array.isArray(source.endorsements)) return;
  queryClient.setQueryData<readonly unknown[]>(
    getAnswerEndorsementsKey(id, getAuthSessionVersion()),
    source.endorsements,
  );
}
