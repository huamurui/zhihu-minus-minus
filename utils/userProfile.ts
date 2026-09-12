export interface MemberIdentity {
  id?: string | number | null;
  url_token?: string | null;
}

export type UserFeedType =
  | 'answers'
  | 'articles'
  | 'questions'
  | 'pins'
  | 'videos';

function normalizeIdentity(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

/** Match a route token against every stable identifier returned for a member. */
export function isSameMember(
  routeId: string | number | null | undefined,
  ...members: Array<MemberIdentity | null | undefined>
) {
  const normalizedRouteId = normalizeIdentity(routeId);
  if (!normalizedRouteId) return false;

  return members.some((member) => {
    if (!member) return false;
    return [member.id, member.url_token].some(
      (candidate) => normalizeIdentity(candidate) === normalizedRouteId,
    );
  });
}

/**
 * Decide whether a profile belongs to the signed-in member.
 *
 * The route will naturally match the loaded profile, so the profile itself must
 * never be used as independent proof that it is the current member. It is only
 * useful for bridging an id/url_token mismatch with the current-member payload.
 */
export function isOwnMemberProfile(
  routeId: string | number | null | undefined,
  currentMember: MemberIdentity | null | undefined,
  profileMember: MemberIdentity | null | undefined,
) {
  if (!currentMember) return false;
  if (isSameMember(routeId, currentMember)) return true;
  if (!profileMember) return false;

  const currentIdentifiers = [currentMember.id, currentMember.url_token]
    .map(normalizeIdentity)
    .filter((value): value is string => Boolean(value));
  const profileIdentifiers = new Set(
    [profileMember.id, profileMember.url_token]
      .map(normalizeIdentity)
      .filter((value): value is string => Boolean(value)),
  );

  return currentIdentifiers.some((identifier) =>
    profileIdentifiers.has(identifier),
  );
}

export function normalizeUserFeedType(
  type: string | null | undefined,
): UserFeedType | null {
  switch (type) {
    case 'answer':
    case 'answers':
      return 'answers';
    case 'article':
    case 'articles':
      return 'articles';
    case 'question':
    case 'questions':
      return 'questions';
    case 'pin':
    case 'pins':
    case 'moments_pin':
      return 'pins';
    case 'video':
    case 'videos':
    case 'zvideo':
    case 'zvideos':
      return 'videos';
    default:
      return null;
  }
}

export function getNextPageOffset(nextUrl: string | null | undefined) {
  if (!nextUrl) return undefined;
  try {
    const url = new URL(nextUrl, 'https://www.zhihu.com');
    const offset = url.searchParams.get('offset');
    if (offset === null) return undefined;
    const parsedOffset = Number.parseInt(offset, 10);
    return Number.isFinite(parsedOffset) ? parsedOffset : undefined;
  } catch {
    return undefined;
  }
}

export interface RecentActivityCursor {
  offset: number;
  pageNum: number;
}

interface RecentActivityTargetIdentity {
  id?: string | number;
  type?: string;
  url?: string;
}

/** Recover exact pin ids from URLs because their JSON numbers exceed 2^53 - 1. */
export function getRecentActivityTargetId(
  target: RecentActivityTargetIdentity,
) {
  if (
    !target.url ||
    (target.type !== 'moments_pin' &&
      target.type !== 'pin' &&
      target.type !== 'pins')
  ) {
    return target.id;
  }
  try {
    const pathname = new URL(target.url, 'https://www.zhihu.com').pathname;
    return pathname.match(/^\/pins?\/([^/]+)$/)?.[1] || target.id;
  } catch {
    return target.id;
  }
}

/** Parse the timestamp cursor used by the Android recent-person activity API. */
export function getNextRecentActivityCursor(
  nextUrl: string | null | undefined,
): RecentActivityCursor | undefined {
  if (!nextUrl) return undefined;
  try {
    const url = new URL(nextUrl, 'https://api.zhihu.com');
    const offset = Number.parseInt(url.searchParams.get('offset') || '', 10);
    const pageNum = Number.parseInt(url.searchParams.get('page_num') || '', 10);
    if (!Number.isFinite(offset) || !Number.isFinite(pageNum)) return undefined;
    return { offset, pageNum };
  } catch {
    return undefined;
  }
}

/**
 * Return the raw activity index after which the entry-time unread marker goes.
 * Keep waiting for more pages unless the server says the stream has ended.
 */
export function getRecentActivityReadBoundary(
  unreadCount: number,
  loadedCount: number,
  isEnd: boolean,
) {
  if (!Number.isInteger(unreadCount) || unreadCount <= 0 || loadedCount <= 0) {
    return undefined;
  }
  if (loadedCount >= unreadCount) return unreadCount;
  return isEnd ? loadedCount : undefined;
}
