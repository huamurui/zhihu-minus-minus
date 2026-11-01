import type { ZhihuMemberRelation } from '@/types/zhihu';
import { getRecentActivityTargetId } from '@/utils/userProfile';

/** 「创作」里的三类内容，与个人主页同名 tab 一致。 */
export type CreationKind = 'answers' | 'articles' | 'pins';

export interface MemberCreation {
  kind: CreationKind;
  item: ZhihuMemberRelation;
  actionText?: string;
  actionTime?: number;
}

/**
 * One entry of the 「创作」 list (`/moments/{memberId}/origin`). With a web
 * session the endpoint answers `moments_feed` entries whose `target` is the
 * full answer, article or pin, as the member's own lists return them.
 */
export interface ZhihuCreationEntry {
  type?: string;
  action_text?: string;
  action_time?: number;
  created_time?: number;
  updated_time?: number;
  source?: {
    action_text?: string;
    action_time?: number;
    action_type?: string;
    created_time?: number;
  };
  target?: {
    type?: string;
    id?: unknown;
    action_text?: string;
    created_time?: number;
    created?: number;
    updated_time?: number;
    [key: string]: unknown;
  };
}

const KIND_BY_TARGET_TYPE: Record<string, CreationKind> = {
  answer: 'answers',
  article: 'articles',
  pin: 'pins',
};

/** The entry's content for the matching profile tab, or null for other types. */
export function toMemberCreation(
  entry: ZhihuCreationEntry,
): MemberCreation | null {
  const target = entry.target;
  const kind = target?.type ? KIND_BY_TARGET_TYPE[target.type] : undefined;
  if (!kind || target?.id === undefined || target.id === null) return null;

  const actionText =
    entry.action_text ||
    entry.source?.action_text ||
    (typeof target.action_text === 'string' ? target.action_text : undefined);

  const rawTime =
    entry.created_time ??
    entry.action_time ??
    entry.source?.action_time ??
    entry.source?.created_time ??
    entry.updated_time ??
    (typeof target.created === 'number' ? target.created : undefined) ??
    (typeof target.created_time === 'number'
      ? target.created_time
      : undefined) ??
    (typeof target.updated_time === 'number' ? target.updated_time : undefined);

  const actionTime =
    typeof rawTime === 'number' && Number.isFinite(rawTime)
      ? rawTime > 1e11
        ? Math.floor(rawTime / 1000)
        : rawTime
      : undefined;

  const resolvedId =
    kind === 'pins'
      ? getRecentActivityTargetId({
          id: target.id as string | number,
          type: target.type,
          url: typeof target.url === 'string' ? target.url : undefined,
        })
      : target.id;

  const item =
    resolvedId !== undefined && resolvedId !== target.id
      ? ({ ...target, id: resolvedId } as unknown as ZhihuMemberRelation)
      : (target as unknown as ZhihuMemberRelation);

  const result: MemberCreation = {
    kind,
    item,
  };
  if (actionText !== undefined) {
    result.actionText = actionText;
  }
  if (actionTime !== undefined) {
    result.actionTime = actionTime;
  }
  return result;
}
