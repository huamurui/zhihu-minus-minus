import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View as RNView, Share } from 'react-native';
import Animated, { SharedTransition } from 'react-native-reanimated';
import { type FeedItem, voteContent } from '@/api/zhihu';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { showToast } from '@/utils/toast';
import { BouncyButton } from './BouncyButton';
import { CustomContextMenu, type MenuOption } from './CustomContextMenu';
import { FeedCardPreview } from './FeedCardPreview';
import { FeedExcerpt } from './FeedExcerpt';
import { LikeButton } from './LikeButton';
import { type ShareContentType, ShareMenu } from './ShareMenu';
import { Text, useThemeColor, View } from './Themed';

const slowTransition = SharedTransition.duration(600);

export const FeedCard = ({ item, tab }: { item: FeedItem; tab?: string }) => {
  const router = useRouter();
  const { cookies } = useAuthStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const isQuestionType = item.type === 'questions';
  const isPinType = item.type === 'pins';
  const isVideoType = item.type === 'videos';
  const engagementType: 'answers' | 'articles' | 'pins' | null =
    item.type === 'answers' || item.type === 'articles' || item.type === 'pins'
      ? item.type
      : null;
  const isGuest = !cookies;
  const colorScheme = useColorScheme();

  const [voted, setVoted] = useState(item.voted || 0);
  const [voteCount, setVoteCount] = useState(item.voteCount || 0);

  useEffect(() => {
    setVoted(item.voted || 0);
    setVoteCount(item.voteCount || 0);
  }, [item.voted, item.voteCount]);

  const isCollectable = item.type === 'answers' || item.type === 'articles';
  const itemIdStr = item.id != null ? item.id.toString() : '';
  const storeCollected = useCollectionStore((state) =>
    itemIdStr ? state.collectedStatusMap[itemIdStr] : undefined,
  );
  const isCollected = storeCollected !== undefined ? storeCollected : false;
  const storeOffset = useCollectionStore(
    (state) => (itemIdStr ? state.collectedCountOffsetMap[itemIdStr] : 0) || 0,
  );
  const displayCount = (item.favlistsCount || 0) + storeOffset;
  const { toggleCollect } = useCollectionAction();
  const warningColor = useThemeColor({}, 'warning');
  const secondaryColor = useThemeColor({}, 'textSecondary');

  const cleanTitle =
    typeof item.title === 'string' ? item.title : item.titleString || '';
  const openDetail = () => {
    if (isVideoType) {
      router.push({
        pathname: '/video/[id]',
        params: { id: item.id, title: cleanTitle },
      });
      return;
    }
    if (isGuest) {
      router.push({
        pathname: '/guest/detail',
        params: {
          item: JSON.stringify({
            ...item,
            title: cleanTitle,
            excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
          }),
        },
      });
      return;
    }

    const params = {
      id: item.id,
      title: cleanTitle,
      questionId: item.questionId,
      ...(tab ? { source: 'feed', tab } : {}),
    };
    if (item.type === 'answers') {
      router.push({ pathname: '/answer/[id]', params });
    } else if (item.type === 'articles') {
      router.push({ pathname: '/article/[id]', params });
    } else if (item.type === 'pins') {
      router.push({ pathname: '/pin/[id]', params });
    } else {
      router.push({ pathname: '/question/[id]', params });
    }
  };

  const [previewVisible, setPreviewVisible] = useState(false);
  const containerRef = useRef<RNView>(null);
  const [originLayout, setOriginLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const menuOptions: MenuOption[] = [
    ...(engagementType
      ? [
          {
            key: 'like',
            title: voted === 1 ? '取消赞同' : '赞同',
            icon: voted === 1 ? 'caret-up' : 'caret-up-outline',
            onPress: async () => {
              const nextVoted = voted === 1 ? 0 : 1;
              const nextCount = voted === 1 ? voteCount - 1 : voteCount + 1;
              try {
                const voteType =
                  item.type === 'pins'
                    ? nextVoted === 1
                      ? 'like'
                      : 'unlike'
                    : nextVoted === 1
                      ? 'up'
                      : 'neutral';
                await voteContent(item.id, engagementType, voteType);
                setVoted(nextVoted);
                setVoteCount(nextCount);
                showToast(nextVoted === 1 ? '已赞同' : '已取消赞同');
              } catch {
                console.error('投票失败');
                showToast('操作失败，请稍后重试');
              }
            },
          },
          {
            key: 'comment',
            title: '评论',
            icon: 'chatbubble-outline',
            onPress: () => {
              const type =
                item.type === 'articles'
                  ? 'article'
                  : item.type === 'answers'
                    ? 'answer'
                    : item.type.slice(0, -1);
              router.push(
                `/comments/${item.id}?type=${type}&count=${item.commentCount}`,
              );
            },
          },
        ]
      : []),
    ...(isCollectable
      ? [
          {
            key: 'collect',
            title: isCollected ? '取消收藏' : '移至收藏',
            icon: isCollected ? 'star' : 'star-outline',
            onPress: () => {
              const typeStr = item.type === 'answers' ? 'answer' : 'article';
              toggleCollect(item.id, typeStr, isCollected);
            },
          },
        ]
      : []),
    {
      key: 'share',
      title: '系统分享',
      icon: 'share-outline',
      onPress: async () => {
        try {
          const routeType = isVideoType ? 'zvideo' : item.type.slice(0, -1);
          const link = `https://www.zhihu.com/${routeType}/${item.id}`;
          await Share.share({
            message: link,
            url: link,
            title: cleanTitle || '知乎分享',
          });
        } catch (_error) {
          showToast('分享失败');
        }
      },
    },
  ];

  return (
    <RNView ref={containerRef} className="w-full bg-transparent">
      <BouncyButton
        onLongPress={() => {
          void impactAsync(ImpactFeedbackStyle.Medium);
          containerRef.current?.measureInWindow(
            (x: number, y: number, width: number, height: number) => {
              setOriginLayout({ x, y, width, height });
              setPreviewVisible(true);
            },
          );
        }}
        onPress={openDetail}
        style={[
          {
            backgroundColor: Colors[colorScheme].backgroundSecondary,
            borderRadius: 12,
            opacity: previewVisible ? 0 : 1,
          },
          isQuestionType ? { paddingBottom: 10 } : undefined,
        ]}
        className="p-4 pb-2 mb-2 mx-1.5"
      >
        {/* 动态动作提示 (针对关注流) */}
        {item.actionText && (
          <Text
            type="secondary"
            className="text-[13px] mb-2 text-tertiary dark:text-tertiary-dark"
          >
            {item.actionText}
          </Text>
        )}

        {/* 热区1：点击作者头像/姓名 -> 用户页 */}
        <BouncyButton
          onPress={() =>
            router.push({
              pathname: '/user/[id]',
              params: {
                id: item.author.url_token || item.author.id,
                avatar: item.author.avatar,
              },
            })
          }
          className="flex-row items-center mb-2"
        >
          <Animated.Image
            source={{ uri: item.author.avatar }}
            className="w-[22px] h-[22px] rounded-full"
            sharedTransitionTag={`avatar-${item.author.url_token || item.author.id}`}
          />
          <Text type="secondary" className="ml-2 text-[13px]">
            {item.author.name}
          </Text>
        </BouncyButton>

        {/* 话题标签 */}
        {item.topics && item.topics.length > 0 && (
          <View className="flex-row flex-wrap mb-2 bg-transparent">
            {item.topics.map((topic) => (
              <BouncyButton
                key={topic.id}
                onPress={() =>
                  router.push({
                    pathname: '/topic/[id]',
                    params: { id: topic.id },
                  })
                }
                className="px-2 py-0.5 rounded-sm mr-2 mb-1"
                style={{ backgroundColor: 'rgba(0,0,132,0.05)' }}
              >
                <Text className="text-[11px] text-tertiary dark:text-tertiary-dark">
                  {topic.name}
                </Text>
              </BouncyButton>
            ))}
          </View>
        )}

        {/* 标题 - 统一为主卡片点击，但点击标题跳转问题 */}
        {item.title ? (
          <BouncyButton
            onPress={() => {
              if (item.type === 'answers' && item.questionId) {
                router.push(`/question/${item.questionId}`);
                return;
              }
              openDetail();
            }}
          >
            <Animated.View
              sharedTransitionTag={`title-${item.questionId || item.id}`}
              sharedTransitionStyle={slowTransition}
            >
              <Text
                className="text-lg font-bold leading-6 text-foreground dark:text-foreground-dark"
                numberOfLines={2}
              >
                {item.title}
              </Text>
            </Animated.View>
          </BouncyButton>
        ) : null}

        {/* 摘要与图片 - 统一为主卡片点击，完美穿透 */}
        <View className="flex-row mt-1 bg-transparent">
          <View className="flex-1 bg-transparent">
            {isPinType && Array.isArray(item.content) ? (
              <FeedExcerpt contentArray={item.content} />
            ) : item.excerpt ? (
              <FeedExcerpt html={item.excerpt} />
            ) : null}
          </View>
          {item.image && (
            <Animated.Image
              source={{ uri: item.image }}
              className="w-[100px] h-[75px] rounded-md ml-2.5 mt-1"
              sharedTransitionTag={`image-${item.id}`}
            />
          )}
        </View>

        {/* 热区4：底部操作栏 - 问题关注类动态不显示 */}
        {engagementType && (
          <View className="flex-row items-center bg-transparent">
            <LikeButton
              id={item.id}
              count={voteCount}
              voted={voted}
              type={engagementType}
              variant="ghost"
              onVoteChange={(newVoted, newCount) => {
                setVoted(newVoted);
                setVoteCount(newCount);
              }}
            />

            {/* 点击评论按钮 -> 评论页 */}
            <BouncyButton
              onPress={() => {
                const type =
                  item.type === 'articles'
                    ? 'article'
                    : item.type === 'answers'
                      ? 'answer'
                      : item.type.slice(0, -1);
                router.push(
                  `/comments/${item.id}?type=${type}&count=${item.commentCount}`,
                );
              }}
              className="flex-row items-center  bg-transparent ml-4 py-1 px-3 rounded-full"
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={secondaryColor}
              />
              <Text type="secondary" className="ml-1 text-xs font-semibold">
                {item.commentCount > 0 ? item.commentCount : '0'}
              </Text>
            </BouncyButton>

            {isCollectable && (
              <BouncyButton
                onPress={() => {
                  const typeStr =
                    item.type === 'answers' ? 'answer' : 'article';
                  toggleCollect(item.id, typeStr, isCollected);
                }}
                className="flex-row items-center  bg-transparent ml-4 py-1 px-3 rounded-full"
              >
                <Ionicons
                  name={isCollected ? 'star' : 'star-outline'}
                  size={16}
                  color={isCollected ? warningColor : secondaryColor}
                />
                {displayCount > 0 && (
                  <Text
                    className="ml-1 text-xs font-semibold"
                    style={{
                      color: isCollected ? warningColor : secondaryColor,
                    }}
                  >
                    {displayCount}
                  </Text>
                )}
              </BouncyButton>
            )}

            <BouncyButton
              onPress={() => setMenuVisible(true)}
              className="ml-auto p-2 -mr-2 bg-transparent"
              style={{ borderRadius: 99 }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={secondaryColor}
              />
            </BouncyButton>
          </View>
        )}

        <ShareMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          type={
            (isVideoType ? 'video' : item.type.slice(0, -1)) as ShareContentType
          }
          data={{
            id: item.id,
            title: cleanTitle,
            author: item.author?.name,
            authorHeadline: item.author?.headline,
            excerpt:
              typeof item.excerpt === 'string' ? item.excerpt : undefined,
            url: isVideoType
              ? `https://www.zhihu.com/zvideo/${item.id}`
              : undefined,
          }}
        />
      </BouncyButton>

      {previewVisible && (
        <CustomContextMenu
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          previewContent={<FeedCardPreview item={item} />}
          options={menuOptions}
          originLayout={originLayout}
        />
      )}
    </RNView>
  );
};
