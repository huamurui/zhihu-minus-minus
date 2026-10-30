import type { ZhihuMemberRelation } from '@/types/zhihu';

/** 「创作」里的三类内容，与个人主页同名 tab 一致。 */
export type CreationKind = 'answers' | 'articles' | 'pins';

export interface MemberCreation {
  kind: CreationKind;
  item: ZhihuMemberRelation;
}

/**
 * One entry of the 「创作」 list (`/moments/{memberId}/origin`). With a web
 * session the endpoint answers `moments_feed` entries whose `target` is the
 * full answer, article or pin, as the member's own lists return them.
 */
export interface ZhihuCreationEntry {
  type?: string;
  target?: { type?: string; id?: unknown };
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
  return { kind, item: target as unknown as ZhihuMemberRelation };
}
