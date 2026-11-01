import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { View as NativeView, type ViewInstance } from 'react-native';
import {
  getContentCollectionMetadata,
  getContentVoteCount,
  getContentVoteState,
  type VoteContentType,
} from '@/api/zhihu';
import { CollectionButton } from '@/components/CollectionButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useCollectionStore } from '@/store/useCollectionStore';
import type { ZhihuContentSegment } from '@/types/zhihu';
import { seedAnswerPreviewEntry } from '@/utils/answerPreviewEntry';
import { getAnswerReadingRouteParams } from '@/utils/answerReadingContext';
import { getZhihuVideoSource } from '@/utils/zhihuVideo';
import { BouncyButton } from './BouncyButton';
import { useContentCardSurface } from './contentCardSurface';
import { LikeButton } from './LikeButton';
import { type ShareContentType, ShareMenu } from './ShareMenu';

type CreationType = 'answer' | 'article' | 'question' | 'pin' | 'video';

interface CreationItem {
  id: string | number;
  type?: string;
  title?: string;
  titleString?: string;
  content?: string | readonly ZhihuContentSegment[];
  excerpt?: string;
  url?: string;
  voteCount?: number;
  voteup_count?: number;
  voted?: number;
  reaction_count?: number;
  like_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favlistsCount?: number;
  favorite_count?: number;
  answer_count?: number;
  follower_count?: number;
  created?: number;
  created_time?: number;
  updated?: number;
  updated_time?: number;
  link_card_info?: Record<string, string>;
  question?: {
    id?: string | number;
    title?: string;
    titleString?: string;
  };
  author?: { name?: string; headline?: string };
  relationship?: { voting?: number; is_favorited?: boolean };
  reaction?: {
    statistics?: { favorites?: number; like_count?: number };
    relation?: { faved?: boolean };
  };
}

interface CreationCardProps {
  item: CreationItem;
  type: CreationType;
  onPress?: () => void;
  excerpt?: React.ReactNode;
}

interface CreationCardHandle {
  measureFooter: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  id: string;
}

export const CreationCard = React.forwardRef<
  CreationCardHandle,
  CreationCardProps
>(
  (
    {
      item,
      type,
      // The whole ordinary card opens its content route or this override.
      onPress,
      excerpt,
    }: CreationCardProps,
    ref,
  ) => {
    const router = useRouter();
    const queryClient = useQueryClient();
    const secondaryColor = useThemeColor({}, 'textSecondary');
    const surface = useContentCardSurface({ radius: 12, gap: 10 });
    const [menuVisible, setMenuVisible] = React.useState(false);
    const footerRef = React.useRef<ViewInstance>(null);

    const voteContentType: VoteContentType | null =
      type === 'article'
        ? 'articles'
        : type === 'pin'
          ? 'pins'
          : type === 'answer'
            ? 'answers'
            : null;
    const storeCollected = useCollectionStore(
      (state) => state.collectedStatusMap[item.id.toString()],
    );
    const collection = getContentCollectionMetadata(item);
    const activeCollected = storeCollected ?? collection.isCollected;
    const identity = `${type}:${item.id}`;
    const previousIdentity = React.useRef(identity);
    React.useEffect(() => {
      if (previousIdentity.current === identity) return;
      previousIdentity.current = identity;
      setMenuVisible(false);
    }, [identity]);

    React.useImperativeHandle(ref, () => ({
      measureFooter: (callback) => footerRef.current?.measureInWindow(callback),
      id: item.id.toString(),
    }));

    const handlePress = () => {
      if (type === 'answer') {
        seedAnswerPreviewEntry(queryClient, { ...item, type });
      }
      if (onPress) {
        onPress();
        return;
      }
      const cleanTitle = (value: unknown) => {
        if (typeof value === 'string') return value;
        if (item.titleString) return item.titleString;
        if (item.question?.titleString) return item.question.titleString;
        return '';
      };
      if (type === 'video') {
        router.push({
          pathname: '/video/[id]',
          params: {
            id: item.id,
            title: cleanTitle(item.title),
            source: getZhihuVideoSource(item.type) || 'zvideo',
          },
        });
      } else {
        router.push({
          pathname: `/${type}/[id]`,
          params: {
            id: item.id,
            title: cleanTitle(item.title || item.question?.title),
            questionId: item.question?.id,
            ...(type === 'answer' ? getAnswerReadingRouteParams() : {}),
          },
        });
      }
    };

    const getExcerpt = () => {
      if (excerpt !== undefined) return excerpt;
      if (!item) return '';

      if (type === 'pin') {
        if (Array.isArray(item.content)) {
          return item.content
            .filter((segment) => segment.type === 'text')
            .map((segment) => segment.content || segment.own_text || '')
            .join('')
            .replace(/<[^>]+>/g, '')
            .substring(0, 100);
        }
        if (typeof item.content === 'string') {
          return item.content.replace(/<[^>]+>/g, '').substring(0, 100);
        }
      }

      const content = item.excerpt || item.content || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '').substring(0, 100);
      }
      return '';
    };

    const getTitle = () => {
      if (type === 'pin') return '发布了想法';
      if (type === 'video') return item.title || '发布了视频';
      return item.title || item.question?.title || '未知内容';
    };

    const displayTypeForShare: ShareContentType = type;
    const timestamp =
      item.updated_time ?? item.updated ?? item.created_time ?? item.created;
    const shareExcerpt = getExcerpt();

    return (
      <BouncyButton
        onPress={handlePress}
        style={[{ borderWidth: 1.5, borderColor: 'transparent' }, surface]}
        className="p-4"
      >
        <View>
          <Text
            className="text-lg font-bold mb-1.5 leading-6 text-foreground dark:text-foreground-dark"
            numberOfLines={2}
          >
            {getTitle()}
          </Text>
        </View>
        <View className="bg-transparent mt-1" pointerEvents="none">
          <Text
            type="secondary"
            className="text-[17px]"
            style={{ lineHeight: 27 }}
            numberOfLines={3}
          >
            {getExcerpt()}
          </Text>
        </View>

        <NativeView
          ref={footerRef}
          className="flex-row justify-between mt-4 items-center bg-transparent"
        >
          {type !== 'question' && type !== 'video' ? (
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={item.id}
                count={
                  item.voteCount ??
                  (voteContentType
                    ? getContentVoteCount(voteContentType, item)
                    : undefined) ??
                  0
                }
                voted={
                  item.voted !== undefined
                    ? item.voted
                    : voteContentType
                      ? (getContentVoteState(voteContentType, item) ?? 0)
                      : 0
                }
                type={voteContentType ?? 'answers'}
                variant="ghost"
              />
              {type === 'answer' || type === 'article' ? (
                <CollectionButton
                  id={item.id}
                  type={type}
                  isCollected={activeCollected}
                  count={collection.favlistsCount}
                  variant="inline"
                />
              ) : null}
              <BouncyButton
                accessibilityRole="button"
                accessibilityLabel="评论"
                onPress={() => {
                  const commentType =
                    type === 'article'
                      ? 'article'
                      : type === 'pin'
                        ? 'pin'
                        : 'answer';
                  router.push(
                    `/comments/${item.id}?type=${commentType}&count=${item.comment_count || 0}`,
                  );
                }}
                className="flex-row items-center justify-center ml-3 p-2 rounded-full bg-transparent"
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={secondaryColor}
                />
                <Text type="secondary" className="ml-1 text-xs font-semibold">
                  {(item.comment_count ?? 0) > 0 ? item.comment_count : '0'}
                </Text>
              </BouncyButton>
            </View>
          ) : (
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark"
            >
              {type === 'question'
                ? `${item.answer_count || 0} 回答 · ${item.follower_count || 0} 关注`
                : `${item.reaction?.statistics?.like_count || item.voteup_count || 0} 赞同 · ${item.comment_count || 0} 评论`}
            </Text>
          )}

          <View className="flex-row items-center bg-transparent ml-auto">
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark mr-3"
            >
              {timestamp ? new Date(timestamp * 1000).toLocaleDateString() : ''}
            </Text>
            <MoreActionsButton
              onPress={() => setMenuVisible(true)}
              color={secondaryColor}
              style={{ marginRight: -4 }}
            />
          </View>
        </NativeView>

        <ShareMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          type={displayTypeForShare}
          data={{
            id: item.id,
            title: getTitle(),
            author: item.author?.name,
            authorHeadline: item.author?.headline,
            questionId: item.question?.id,
            isCollected: activeCollected,
            excerpt:
              typeof shareExcerpt === 'string' ? shareExcerpt : undefined,
            url: item.url,
          }}
        />
      </BouncyButton>
    );
  },
);
