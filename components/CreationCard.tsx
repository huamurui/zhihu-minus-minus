import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { View as NativeView, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useCollectionStore } from '@/store/useCollectionStore';
import { BouncyButton } from './BouncyButton';
import { LikeButton } from './LikeButton';
import { type ShareContentType, ShareMenu } from './ShareMenu';

type CreationType = 'answer' | 'article' | 'question' | 'pin' | 'video';

interface CreationContentSegment {
  type: string;
  content?: string;
  data_draft_title?: string;
}

interface CreationItem {
  id: string | number;
  type?: string;
  title?: string;
  titleString?: string;
  content?: string | CreationContentSegment[];
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
  relationship?: { voting?: number };
  reaction?: {
    statistics?: { favorites?: number; like_count?: number };
  };
}

interface CreationCardProps {
  item: CreationItem;
  type: CreationType;
  onPress?: () => void;
  excerpt?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: (id: string, expanded: boolean) => void;
  isCollapsedHighlighted?: boolean;
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
      onPress,
      excerpt,
      isExpanded,
      onToggle,
      isCollapsedHighlighted,
    }: CreationCardProps,
    ref,
  ) => {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const primaryColor = useThemeColor({}, 'primary');
    const warningColor = useThemeColor({}, 'warning');
    const [localExpanded, setLocalExpanded] = React.useState(false);
    const [menuVisible, setMenuVisible] = React.useState(false);
    const footerRef = React.useRef<NativeView>(null);

    const isCollectable = type === 'answer' || type === 'article';
    const storeCollected = useCollectionStore((state) =>
      item?.id ? state.collectedStatusMap[item.id.toString()] : false,
    );
    const isCollected = storeCollected !== undefined ? storeCollected : false;
    const storeOffset = useCollectionStore((state) =>
      item?.id ? state.collectedCountOffsetMap[item.id.toString()] || 0 : 0,
    );
    const displayCount =
      (item?.favlists_count ??
        item?.favlistsCount ??
        item?.favorite_count ??
        item?.reaction?.statistics?.favorites ??
        0) + storeOffset;
    const { toggleCollect } = useCollectionAction();

    React.useImperativeHandle(ref, () => ({
      measureFooter: (callback) => footerRef.current?.measureInWindow(callback),
      id: item.id.toString(),
    }));

    const expanded = isExpanded !== undefined ? isExpanded : localExpanded;
    const setExpanded = (val: boolean) => {
      if (onToggle && item?.id) {
        onToggle(item.id.toString(), val);
      } else {
        setLocalExpanded(val);
      }
    };

    const handlePress = () => {
      if (onPress) {
        onPress();
        return;
      }
      if (excerpt !== undefined) {
        const cleanTitle = (value: unknown) => {
          if (typeof value === 'string') return value;
          if (item.titleString) return item.titleString;
          if (item.question?.titleString) return item.question.titleString;
          return '';
        };
        if (type === 'video') {
          router.push({
            pathname: '/video/[id]',
            params: { id: item.id, title: cleanTitle(item.title) },
          });
        } else {
          router.push({
            pathname: `/${type}/[id]`,
            params: {
              id: item.id,
              title: cleanTitle(item.title || item.question?.title),
              questionId: item.question?.id,
            },
          });
        }
        return;
      }
      if (type === 'answer' || type === 'article' || type === 'pin') {
        setExpanded(!expanded);
        return;
      }
    };

    const getFullContent = () => {
      if (!item) return '';
      if (type === 'pin' && Array.isArray(item.content)) {
        return item.content
          .map((segment) => {
            if (segment.type === 'text') return segment.content;
            if (segment.type === 'link_card')
              return `[链接: ${segment.data_draft_title || '查看详情'}]`;
            return '';
          })
          .join('\n')
          .replace(/<[^>]+>/g, '');
      }
      const content = item.content || item.excerpt || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '');
      }
      return '';
    };

    const getExcerpt = () => {
      if (excerpt !== undefined) return excerpt;
      if (!item) return '';

      if (type === 'pin') {
        if (Array.isArray(item.content)) {
          return item.content
            .filter((segment) => segment.type === 'text')
            .map((segment) => segment.content)
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

    const fullText = getFullContent();
    const isLongContent =
      excerpt === undefined &&
      (type === 'answer' || type === 'article' || type === 'pin') &&
      (fullText.length > 120 ||
        (typeof item.content === 'string' &&
          (item.content.includes('<img') || item.content.includes('<figure'))));

    const displayTypeForShare: ShareContentType = type;
    const timestamp =
      item.updated_time ?? item.updated ?? item.created_time ?? item.created;
    const shareExcerpt = getExcerpt();

    return (
      <BouncyButton
        onPress={handlePress}
        style={[
          {
            backgroundColor: Colors[colorScheme].backgroundSecondary,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: isCollapsedHighlighted ? primaryColor : 'transparent',
          },
          isCollapsedHighlighted && {
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
          },
        ]}
        className="p-4 mb-2.5"
      >
        <BouncyButton
          onPress={() => {
            if (type === 'answer' && item.question?.id) {
              router.push(`/question/${item.question.id}`);
            } else if (type === 'question') {
              router.push(`/question/${item.id}`);
            } else {
              handlePress();
            }
          }}
        >
          <Animated.View
            sharedTransitionTag={`title-${item.question?.id || item.id}`}
          >
            <Text
              className="text-lg font-bold mb-1.5 leading-6 text-foreground dark:text-foreground-dark"
              numberOfLines={expanded ? undefined : 2}
            >
              {getTitle()}
            </Text>
          </Animated.View>
        </BouncyButton>

        <View className="bg-transparent mt-1">
          {expanded &&
          (type === 'answer' || type === 'article' || type === 'pin') ? (
            <View className="flex-1 bg-transparent mt-1">
              <ZhihuContent
                objectId={item.id?.toString()}
                type={type === 'pin' ? 'pin' : type}
                content={
                  typeof item.content === 'string' ? item.content : undefined
                }
                contentArray={
                  type === 'pin' && Array.isArray(item.content)
                    ? item.content
                    : undefined
                }
                linkCardInfo={item.link_card_info}
                useNative={true}
              />
              <Pressable
                onPress={() => setExpanded(false)}
                className="mt-3 py-2.5 flex-row items-center justify-center border-t border-gray-100 dark:border-gray-800"
              >
                <Text
                  className="text-sm font-bold mr-1"
                  style={{ color: primaryColor }}
                >
                  收起
                  {type === 'answer'
                    ? '回答'
                    : type === 'article'
                      ? '文章'
                      : '想法'}
                </Text>
                <Ionicons name="chevron-up" size={14} color={primaryColor} />
              </Pressable>
            </View>
          ) : type === 'answer' || type === 'article' || type === 'pin' ? (
            isLongContent ? (
              <Pressable
                onPress={() => setExpanded(true)}
                style={{ maxHeight: 150, overflow: 'hidden' }}
                className="flex-1"
              >
                <Text
                  type="secondary"
                  className="text-[17px]"
                  style={{ lineHeight: 27 }}
                  numberOfLines={5}
                >
                  {getExcerpt()}
                </Text>
                <Pressable
                  onPress={() => setExpanded(true)}
                  className="absolute inset-x-0 bottom-0 h-24 z-[100]"
                >
                  <LinearGradient
                    colors={[
                      colorScheme === 'dark'
                        ? 'rgba(26, 26, 26, 0)'
                        : 'rgba(255, 255, 255, 0)',
                      colorScheme === 'dark'
                        ? 'rgba(26, 26, 26, 1)'
                        : 'rgba(255, 255, 255, 1)',
                    ]}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      paddingBottom: 10,
                    }}
                  >
                    <View className="flex-row items-center justify-center bg-transparent">
                      <Text
                        type="primary"
                        className="text-[13px] font-bold mr-1"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={primaryColor}
                      />
                    </View>
                  </LinearGradient>
                </Pressable>
              </Pressable>
            ) : (
              <View className="flex-1 bg-transparent">
                <ZhihuContent
                  objectId={item.id?.toString()}
                  type={type === 'pin' ? 'pin' : type}
                  content={
                    typeof item.content === 'string' ? item.content : undefined
                  }
                  contentArray={
                    type === 'pin' && Array.isArray(item.content)
                      ? item.content
                      : undefined
                  }
                  linkCardInfo={item.link_card_info}
                  useNative={true}
                />
              </View>
            )
          ) : (
            <View className="bg-transparent">
              <Text
                type="secondary"
                className="text-[17px]"
                style={{ lineHeight: 27 }}
                numberOfLines={3}
              >
                {getExcerpt()}
              </Text>
            </View>
          )}
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
                  item.voteup_count ??
                  (type === 'pin'
                    ? item.reaction_count || item.like_count
                    : 0) ??
                  0
                }
                voted={
                  item.voted !== undefined
                    ? item.voted
                    : item.relationship?.voting || 0
                }
                type={
                  type === 'article'
                    ? 'articles'
                    : type === 'pin'
                      ? 'pins'
                      : 'answers'
                }
                variant="ghost"
              />
              <Pressable
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
                className="flex-row items-center ml-5 bg-transparent py-1"
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={Colors[colorScheme].iconMuted}
                />
                <Text className="ml-1 text-xs font-semibold">
                  {(item.comment_count ?? 0) > 0 ? item.comment_count : '0'}
                </Text>
              </Pressable>
              {isCollectable && (
                <Pressable
                  onPress={() => toggleCollect(item.id, type, isCollected)}
                  className="flex-row items-center ml-5 bg-transparent py-1"
                >
                  <Ionicons
                    name={isCollected ? 'star' : 'star-outline'}
                    size={16}
                    color={
                      isCollected ? warningColor : Colors[colorScheme].iconMuted
                    }
                  />
                  {displayCount > 0 && (
                    <Text
                      className="ml-1 text-xs font-semibold"
                      style={{
                        color: isCollected
                          ? warningColor
                          : Colors[colorScheme].iconMuted,
                      }}
                    >
                      {displayCount}
                    </Text>
                  )}
                </Pressable>
              )}
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
            <BouncyButton
              onPress={() => setMenuVisible(true)}
              className="p-1 -mr-1 bg-transparent"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={Colors[colorScheme].iconMuted}
              />
            </BouncyButton>
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
            excerpt:
              typeof shareExcerpt === 'string' ? shareExcerpt : undefined,
            url: item.url,
          }}
        />
      </BouncyButton>
    );
  },
);
