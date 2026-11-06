import type { QueryClient } from '@tanstack/react-query';
import { getAuthSessionVersion } from '@/store/useAuthStore';

export interface ContentDetailPreview {
  id: string;
  title?: string;
  author?: {
    id?: string;
    name: string;
    avatarUrl?: string;
    urlToken?: string;
    headline?: string;
  };
}

interface ContentDetailPreviewSource {
  id: string | number;
  isIdStable?: boolean;
  title?: unknown;
  titleString?: string;
  author?: {
    id?: string | number;
    name?: string;
    avatar?: string;
    avatar_url?: string;
    url_token?: string;
    headline?: string;
  };
}

export function getContentDetailPreviewKey(
  type: 'article' | 'pin',
  id: string,
  sessionVersion: number,
) {
  return ['content-detail-preview', sessionVersion, type, id.trim()] as const;
}

/** Store only display fields; the detail query remains responsible for fetching. */
export function seedContentDetailPreview(
  queryClient: QueryClient,
  type: 'article' | 'pin',
  source: ContentDetailPreviewSource,
): void {
  const id = String(source.id).trim();
  if (!id || source.isIdStable === false) return;
  const title =
    source.titleString ||
    (typeof source.title === 'string' ? source.title : undefined);
  const author = source.author;
  const preview: ContentDetailPreview = {
    id,
    title: type === 'article' ? title : undefined,
    author: author?.name
      ? {
          id: author.id == null ? undefined : String(author.id),
          name: author.name,
          avatarUrl: author.avatar_url || author.avatar,
          urlToken: author.url_token,
          headline: author.headline,
        }
      : undefined,
  };
  if (!preview.title && !preview.author) return;
  queryClient.setQueryData(
    getContentDetailPreviewKey(type, id, getAuthSessionVersion()),
    preview,
  );
}
